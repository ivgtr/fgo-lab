export interface RankingSelectionCandidate {
  average: number;
  externalFactCount: number;
  activationFactCount: number;
  transitionCount: number;
  noblePhantasmVariantKey: string;
  baselineInputDeviation: number;
  preparationActionCount: number;
  candidateKey: string;
}

export function compareRankingCandidates(
  left: RankingSelectionCandidate,
  right: RankingSelectionCandidate,
): number {
  return (
    right.average - left.average ||
    left.externalFactCount - right.externalFactCount ||
    left.baselineInputDeviation - right.baselineInputDeviation ||
    left.preparationActionCount - right.preparationActionCount ||
    left.transitionCount - right.transitionCount ||
    left.candidateKey.localeCompare(right.candidateKey) ||
    left.noblePhantasmVariantKey.localeCompare(right.noblePhantasmVariantKey) ||
    left.activationFactCount - right.activationFactCount
  );
}
