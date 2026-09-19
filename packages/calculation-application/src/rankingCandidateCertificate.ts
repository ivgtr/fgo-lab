import { finiteSemanticProductBound, type FiniteSemanticDimension } from './finiteSemanticProduct';

export interface FiniteRankingDomainCertificate {
  supportedMaximum: 4_096;
  programBounds: readonly {
    programKey: string;
    rawWorldCardinality: number;
    worldEquivalenceClasses: number;
    dimensions: readonly { key: string; cardinality: number }[];
    upperBound: number;
  }[];
  completeUpperBound: number;
}

export function certifyRankingProgramDomain(input: {
  programKey: string;
  rawWorldCardinality: number;
  worldEquivalenceClasses: number;
  dimensions: readonly FiniteSemanticDimension<number>[];
  remaining: number;
}): FiniteRankingDomainCertificate['programBounds'][number] | { limitExceeded: number } {
  const bound = finiteSemanticProductBound(input.dimensions, input.remaining);
  if (bound.status === 'limitExceeded') return { limitExceeded: bound.upperBound };
  return {
    programKey: input.programKey,
    rawWorldCardinality: input.rawWorldCardinality,
    worldEquivalenceClasses: input.worldEquivalenceClasses,
    dimensions: input.dimensions.map(({ key, values }) => ({ key, cardinality: values.length })),
    upperBound: bound.upperBound,
  };
}

export function assertRankingCandidateMaterialization(
  actual: number,
  certificate: FiniteRankingDomainCertificate,
): void {
  if (actual !== certificate.completeUpperBound)
    throw new TypeError(
      `ranking_candidate_space_materialization_mismatch:${actual}:${certificate.completeUpperBound}`,
    );
}
