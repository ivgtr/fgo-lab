import { attackProfileKey, type AttackProfile } from './attackProfile';

export interface RankingSelectionCandidate {
  index: number;
  attackProfile: AttackProfile;
  average: number | null;
  externalFactCount: number;
  activationFactCount: number;
  transitionCount: number;
  noblePhantasmVariantKey: string;
  baselineInputDeviation: number;
  preparationActionCount: number;
  candidateKey: string;
}

export function selectRankingCandidateIndexes(
  candidates: readonly RankingSelectionCandidate[],
): ReadonlyMap<string, number> {
  const selected = new Map<string, number>();
  const profileKeys = new Set(
    candidates.map(({ attackProfile }) => attackProfileKey(attackProfile)),
  );
  for (const profileKey of profileKeys) {
    const winner = candidates
      .filter(
        (candidate): candidate is RankingSelectionCandidate & { average: number } =>
          attackProfileKey(candidate.attackProfile) === profileKey && candidate.average !== null,
      )
      .sort(
        (left, right) =>
          right.average - left.average ||
          left.externalFactCount - right.externalFactCount ||
          left.baselineInputDeviation - right.baselineInputDeviation ||
          left.preparationActionCount - right.preparationActionCount ||
          left.transitionCount - right.transitionCount ||
          left.candidateKey.localeCompare(right.candidateKey) ||
          left.noblePhantasmVariantKey.localeCompare(right.noblePhantasmVariantKey) ||
          left.activationFactCount - right.activationFactCount,
      )[0];
    if (winner) selected.set(profileKey, winner.index);
  }
  return selected;
}
