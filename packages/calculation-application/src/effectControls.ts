import type { ConditionExpression, EffectProjection } from '@fgo-lab/battle-execution';

export interface EffectControlViewModel {
  key: string;
  projection: EffectProjection;
  operationIds: readonly string[];
  interaction: 'none' | 'toggle' | 'singleChoice';
  active: boolean;
  valueDisplay: 'single' | 'sum';
  presentationState: EffectPresentationState;
}

export type EffectPresentationState =
  | 'applied'
  | 'manuallyExcluded'
  | 'procFailed'
  | 'sourceInactive'
  | 'conditionUnsatisfied'
  | 'conditionUnselected'
  | 'unsupported'
  | 'impossible';

export function conditionAllowsEffectLocalDecision(condition: ConditionExpression | null): boolean {
  if (condition === null) return false;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(conditionAllowsEffectLocalDecision);
  if (condition.kind === 'not') return conditionAllowsEffectLocalDecision(condition.expression);
  return (
    condition.kind === 'trait' || condition.kind === 'traitCount' || condition.kind === 'choice'
  );
}

function aggregateProjection(members: readonly EffectProjection[]): EffectProjection {
  const representative = members[0]!;
  const applied = members.filter((member) => member.outcome === 'applied');
  const valuePermille =
    members.length === 1
      ? representative.valuePermille
      : applied.reduce((sum, member) => sum + (member.valuePermille ?? 0), 0);
  const hasNumericValue = members.some((member) => member.valuePermille !== null);
  const outcome = members.some((member) => member.outcome === 'unsupported')
    ? ('unsupported' as const)
    : applied.length > 0
      ? ('applied' as const)
      : members.some((member) => member.outcome === 'impossible')
        ? ('impossible' as const)
        : ('notApplied' as const);
  const selectionGroups = [
    ...new Map(
      members
        .flatMap((member) => member.selectionGroups)
        .map((group) => [`${group.groupKey}:${group.candidateKey}`, group]),
    ).values(),
  ];
  const quantityMember = members.find((member) => member.requiredQuantity !== null);
  return {
    ...representative,
    valuePermille: hasNumericValue ? valuePermille : representative.valuePermille,
    value:
      hasNumericValue && valuePermille !== null && representative.modifier !== 'flatDamage'
        ? valuePermille / 1_000
        : representative.value,
    outcome,
    selectionGroups,
    requiredQuantity: quantityMember?.requiredQuantity ?? representative.requiredQuantity,
    requiredQuantityOwner:
      quantityMember?.requiredQuantityOwner ?? representative.requiredQuantityOwner,
  };
}

function projectionSelected(projection: EffectProjection): boolean {
  return (
    projection.decision.state === 'enabled' ||
    (projection.decision.state === 'none' && projection.outcome === 'applied')
  );
}

export function deriveEffectPresentationState(
  projection: EffectProjection,
  active: boolean,
  conditionSelectable: boolean,
): EffectPresentationState {
  if (projection.outcome === 'unsupported') return 'unsupported';
  if (projection.outcome === 'impossible') return 'impossible';
  if (!projection.sourceActive) return 'sourceInactive';
  if (projection.proc.kind === 'chainedRolls' && !active) return 'procFailed';
  if (!projectionSelected(projection))
    return projection.proc.kind === 'guaranteed' || projection.procRatePermille === 1_000
      ? 'manuallyExcluded'
      : 'procFailed';
  if (conditionSelectable && projection.conditionDecision !== 'assumeSatisfied')
    return 'conditionUnselected';
  if (projection.outcome === 'applied') return 'applied';
  if (
    projection.explanation.condition !== null &&
    (projection.explanation.code === 'conditionNotMet' ||
      projection.explanation.code === 'targetMismatch')
  )
    return 'conditionUnsatisfied';
  return 'impossible';
}

export function createEffectControlViewModels(
  effects: readonly EffectProjection[],
  canonicalInputValues: Readonly<Record<string, number>> = {},
): EffectControlViewModel[] {
  const groups = new Map<string, EffectProjection[]>();
  for (const effect of effects) {
    const members = groups.get(effect.projectionKey) ?? [];
    members.push(effect);
    groups.set(effect.projectionKey, members);
  }
  const aggregated = [...groups.entries()].flatMap(([key, members]) =>
    members.some((member) => member.visibility === 'visible')
      ? [
          {
            key,
            projection: aggregateProjection(members),
            operationIds: members.map((member) => member.operationId),
          },
        ]
      : [],
  );
  const candidatesByGroup = new Map<string, Set<string>>();
  for (const { projection } of aggregated)
    for (const group of projection.selectionGroups) {
      const candidates = candidatesByGroup.get(group.groupKey) ?? new Set<string>();
      candidates.add(group.candidateKey);
      candidatesByGroup.set(group.groupKey, candidates);
    }
  return aggregated.map(({ key, projection, operationIds }) => {
    const belongsToChoice = projection.selectionGroups.some(
      (group) => (candidatesByGroup.get(group.groupKey)?.size ?? 0) > 1,
    );
    const conditionSelectable =
      projection.decision.state !== 'none' &&
      projection.decision.kind === 'effect' &&
      projection.decision.plan.condition === 'userMayAssume' &&
      conditionAllowsEffectLocalDecision(projection.explanation.condition);
    const chainedInput = projection.requiredInputs.find(
      (input) => input.kind === 'procSuccessCount',
    );
    const selected = projectionSelected(projection);
    const active =
      projection.proc.kind === 'chainedRolls' && chainedInput
        ? projection.sourceActive &&
          selected &&
          (!conditionSelectable || projection.conditionDecision === 'assumeSatisfied') &&
          (canonicalInputValues[chainedInput.key] ?? chainedInput.defaultValue ?? 0) >
            chainedInput.minimum
        : projection.sourceActive &&
          selected &&
          (!conditionSelectable || projection.conditionDecision === 'assumeSatisfied');
    return {
      key,
      projection,
      operationIds,
      active,
      presentationState: deriveEffectPresentationState(projection, active, conditionSelectable),
      valueDisplay: operationIds.length > 1 ? 'sum' : 'single',
      interaction:
        projection.proc.kind === 'chainedRolls' || projection.decision.state !== 'none'
          ? conditionSelectable && belongsToChoice
            ? 'singleChoice'
            : 'toggle'
          : 'none',
    };
  });
}
