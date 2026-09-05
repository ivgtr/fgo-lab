import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type {
  RankingPolicyCalculation,
  RankingPolicyConditions,
  RankingProfileInput,
} from './rankingContracts';
import { calculateRankingPolicy } from './rankingPolicyCalculation';

const NP_LEVELS = [1, 2, 3, 4, 5] as const;

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
  conditions: Omit<RankingPolicyConditions, 'npLevelBasis'>,
  versions: VersionContext,
): RankingPolicyCalculationMatrix {
  return NP_LEVELS.map((npLevel) =>
    calculateRankingPolicy(
      master,
      profile,
      { ...conditions, npLevelBasis: { kind: 'specified', npLevel } },
      versions,
    ),
  ) as unknown as RankingPolicyCalculationMatrix;
}
