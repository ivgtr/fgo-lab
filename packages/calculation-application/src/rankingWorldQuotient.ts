import type { RankingWorldCandidate } from './rankingWorldDomain';
import { observeRankingWorld, type RankingWorldObservationPlan } from './rankingWorldObservation';

export interface RankingWorldEquivalenceClass {
  key: string;
  representative: RankingWorldCandidate;
  members: readonly RankingWorldCandidate[];
}

function positiveAssumptions(candidate: RankingWorldCandidate): number {
  return candidate.traitFacts.filter(({ present }) => present).length;
}

export function selectRankingWorldRepresentative(
  candidates: readonly RankingWorldCandidate[],
): RankingWorldCandidate {
  const sorted = [...candidates].sort(
    (left, right) =>
      positiveAssumptions(left) - positiveAssumptions(right) || left.key.localeCompare(right.key),
  );
  if (!sorted[0]) throw new TypeError('ranking_world_equivalence_class_empty');
  return sorted[0];
}

export function quotientRankingWorldDomain(
  candidates: readonly RankingWorldCandidate[],
  plan: RankingWorldObservationPlan,
): readonly RankingWorldEquivalenceClass[] {
  const classes = new Map<string, RankingWorldCandidate[]>();
  for (const candidate of candidates) {
    const key = observeRankingWorld(plan, candidate).key;
    classes.set(key, [...(classes.get(key) ?? []), candidate]);
  }
  return [...classes].map(([key, members]) => ({
    key,
    representative: selectRankingWorldRepresentative(members),
    members,
  }));
}
