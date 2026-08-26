import type { EffectProjection } from '@fgo-lab/battle-execution';

export interface EffectControlViewModel {
  key: string;
  projection: EffectProjection;
  operationIds: readonly string[];
  control: 'toggle' | 'singleChoice' | 'automatic';
  valueDisplay: 'single' | 'sum';
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

export function createEffectControlViewModels(
  effects: readonly EffectProjection[],
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
    return {
      key,
      projection,
      operationIds,
      valueDisplay: operationIds.length > 1 ? 'sum' : 'single',
      control:
        projection.controllability !== 'user'
          ? 'automatic'
          : belongsToChoice
            ? 'singleChoice'
            : 'toggle',
    };
  });
}
