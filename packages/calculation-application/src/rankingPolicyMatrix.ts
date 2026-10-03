import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import { rankingSelectionSchema, type VersionContext } from '@fgo-lab/schema';
import type {
  RankingPolicyCalculation,
  RankingPolicyConditions,
  RankingProfileInput,
} from './rankingContracts';
import { calculateRankingPolicy } from './rankingPolicyCalculation';

export type RankingPolicyMatrixConditions = Omit<
  Extract<RankingPolicyConditions, { growthBasis: 'common' }>,
  'npLevelBasis'
>;

export type RankingPolicyCalculationMatrix = readonly [
  RankingPolicyCalculation,
  RankingPolicyCalculation,
  RankingPolicyCalculation,
  RankingPolicyCalculation,
  RankingPolicyCalculation,
];

/**
 * Correctness oracle for TSK-06. Every NP level compiles a fresh finite candidate
 * space and traverses the same application/executor path as a single policy call.
 * Cross-level blueprint caches are intentionally deferred until their identity is
 * observable without reusing partial execution results.
 */
export function calculateRankingPolicyMatrix(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyMatrixConditions,
  versions: VersionContext,
): RankingPolicyCalculationMatrix {
  rankingSelectionSchema.options[0].shape.growthBasis.parse(conditions.growthBasis);
  const calculate = (npLevel: 1 | 2 | 3 | 4 | 5) =>
    calculateRankingPolicy(
      master,
      profile,
      { ...conditions, npLevelBasis: { kind: 'specified', npLevel } },
      versions,
    );
  return [calculate(1), calculate(2), calculate(3), calculate(4), calculate(5)];
}
