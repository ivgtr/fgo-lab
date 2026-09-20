import type { RankingWorldCandidate } from './rankingWorldDomain';
import { observeRankingWorld, type RankingWorldObservationPlan } from './rankingWorldObservation';

export interface RankingWorldEquivalenceClass {
  key: string;
  representative: RankingWorldCandidate;
  members: readonly RankingWorldCandidate[];
}

export interface RankingWorldQuotient {
  classes: readonly RankingWorldEquivalenceClass[];
  representatives: readonly RankingWorldCandidate[];
  rawWorldCardinality: number;
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

export function analyzeRankingWorldDomain(
  candidates: readonly RankingWorldCandidate[],
  plan: RankingWorldObservationPlan,
): RankingWorldQuotient {
  const classes = new Map<string, RankingWorldCandidate[]>();
  for (const candidate of candidates) {
    const key = observeRankingWorld(plan, candidate).key;
    classes.set(key, [...(classes.get(key) ?? []), candidate]);
  }
  const equivalenceClasses = [...classes].map(([key, members]) => ({
    key,
    representative: selectRankingWorldRepresentative(members),
    members,
  }));
  const coveredWorlds = equivalenceClasses.reduce(
    (sum, equivalenceClass) => sum + equivalenceClass.members.length,
    0,
  );
  if (coveredWorlds !== candidates.length)
    throw new TypeError(`ranking_world_quotient_coverage:${coveredWorlds}:${candidates.length}`);
  return {
    classes: equivalenceClasses,
    representatives: equivalenceClasses.map(({ representative }) => representative),
    rawWorldCardinality: candidates.length,
  };
}

export function quotientRankingWorldDomain(
  candidates: readonly RankingWorldCandidate[],
  plan: RankingWorldObservationPlan,
): readonly RankingWorldEquivalenceClass[] {
  return analyzeRankingWorldDomain(candidates, plan).classes;
}
