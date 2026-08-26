import type { EffectProjection } from '@fgo-lab/battle-execution';

export interface EffectControlViewModel {
  key: string;
  projection: EffectProjection;
  operationIds: readonly string[];
  control: 'toggle' | 'singleChoice' | 'automatic';
}

function aggregateProjection(members: readonly EffectProjection[]): EffectProjection {
  const representative = members[0]!;
  const applied = members.filter((member) => member.outcome === 'applied');
  const valuePermille = applied.reduce((sum, member) => sum + (member.valuePermille ?? 0), 0);
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
  return {
    ...representative,
    valuePermille: hasNumericValue ? valuePermille : representative.valuePermille,
    value:
      hasNumericValue && representative.modifier !== 'flatDamage'
        ? valuePermille / 1_000
        : representative.value,
    outcome,
    selectionGroups,
  };
}

export function createEffectControlViewModels(
  effects: readonly EffectProjection[],
): EffectControlViewModel[] {
  const groups = new Map<string, EffectProjection[]>();
  for (const effect of effects) {
    if (effect.visibility !== 'visible') continue;
    const members = groups.get(effect.projectionKey) ?? [];
    members.push(effect);
    groups.set(effect.projectionKey, members);
  }
  const aggregated = [...groups.entries()].map(([key, members]) => ({
    key,
    projection: aggregateProjection(members),
    operationIds: members.map((member) => member.operationId),
  }));
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
      control:
        projection.controllability !== 'user'
          ? 'automatic'
          : belongsToChoice
            ? 'singleChoice'
            : 'toggle',
    };
  });
}
