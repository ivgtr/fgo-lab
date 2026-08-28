import type { EffectControlViewModel } from './effectControls';

export type RankingChoiceWorld = Readonly<Record<string, string>>;

const MAX_RANKING_CHOICE_CANDIDATES = 256;

export function createRankingChoiceCandidates(
  controls: readonly EffectControlViewModel[],
  selectedKeys: ReadonlySet<string>,
): readonly RankingChoiceWorld[] {
  const candidatesByGroup = new Map<string, Set<string>>();
  for (const control of controls) {
    if (!selectedKeys.has(control.key)) continue;
    for (const group of control.projection.selectionGroups) {
      if (!group.groupKey.startsWith('choice:')) continue;
      const candidates = candidatesByGroup.get(group.groupKey) ?? new Set<string>();
      candidates.add(group.candidateKey);
      candidatesByGroup.set(group.groupKey, candidates);
    }
  }
  let worlds: RankingChoiceWorld[] = [{}];
  for (const [groupKey, candidates] of [...candidatesByGroup].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    worlds = worlds.flatMap((world) => [
      world,
      ...[...candidates]
        .sort((left, right) => left.localeCompare(right))
        .map((candidate) => ({ ...world, [groupKey]: candidate })),
    ]);
    if (worlds.length > MAX_RANKING_CHOICE_CANDIDATES)
      throw new RangeError('ranking_choice_candidate_limit');
  }
  return worlds;
}
