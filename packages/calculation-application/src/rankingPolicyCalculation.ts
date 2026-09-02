import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles, type AttackProfile } from './attackProfile';
import type { calculateDamageResolution } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import { calculateRankingCandidateSet } from './rankingPolicyCandidates';
import type {
  RankingPolicyCalculation,
  RankingPolicyConditions,
  RankingProfileInput,
  RankingProfileResult,
  RankingRowSummary,
} from './rankingContracts';
import {
  createRankingPolicyExclusion,
  createRankingRow,
  includedRankingServants,
} from './rankingRows';
import { unresolvedProfileResult } from './rankingProfileOutcome';

export function calculateRankingPolicyDetail(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  attackProfile?: AttackProfile,
): RankingProfileResult {
  try {
    const candidateSet = calculateRankingCandidateSet(
      servant,
      master,
      profile,
      conditions,
      versions,
      true,
    );
    const detail = attackProfile
      ? candidateSet.details.get(attackProfileKey(attackProfile))
      : candidateSet.details.values().next().value;
    if (detail) return { status: 'calculated', detail };
    const requested = attackProfile ?? createStaticAttackProfiles(servant)[0];
    if (!requested)
      return {
        status: 'invalid',
        attackProfile: null,
        issues: [],
        reason: 'rankingAttackProfileInventoryMissing',
      };
    return unresolvedProfileResult(candidateSet, requested);
  } catch (error) {
    return {
      status: 'invalid',
      attackProfile: attackProfile ?? null,
      issues: [],
      reason: 'unexpectedRankingFailure',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function calculateRankingPolicy(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
): RankingPolicyCalculation {
  const rows: RankingRowSummary[] = [];
  const profileResults: Record<string, RankingProfileResult> = {};
  const exclusions: RankingPolicyCalculation['exclusions'] = [];
  const damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>();
  let generatedCount = 0;
  let semanticUpperBound = 0;
  const deduplicatedKeys = new Set<string>();
  for (const servant of includedRankingServants(master, profile, conditions)) {
    const inventory = createStaticAttackProfiles(servant);
    try {
      const candidateSet = calculateRankingCandidateSet(
        servant,
        master,
        profile,
        conditions,
        versions,
        false,
        damageCache,
      );
      const { plan } = candidateSet;
      generatedCount += plan.candidateKeys.length;
      semanticUpperBound += plan.candidateUpperBound;
      for (const [index, key] of plan.candidateKeys.entries())
        deduplicatedKeys.add(
          `${servant.id}:${attackProfileKey(plan.attackProfiles[index]!)}:${key}`,
        );
      for (const attackProfile of inventory) {
        const profileKey = attackProfileKey(attackProfile);
        const detail = candidateSet.details.get(profileKey);
        if (!detail) {
          const result = unresolvedProfileResult(candidateSet, attackProfile);
          profileResults[profileKey] = result;
          exclusions.push(createRankingPolicyExclusion(servant, profileKey, result));
          continue;
        }
        profileResults[profileKey] = { status: 'calculated', detail };
        rows.push(createRankingRow(servant, detail, profile));
      }
    } catch (error) {
      for (const attackProfile of inventory) {
        const profileKey = attackProfileKey(attackProfile);
        const result: RankingProfileResult = {
          status: 'invalid',
          attackProfile,
          issues: [],
          reason: 'unexpectedRankingFailure',
          detail: error instanceof Error ? error.message : String(error),
        };
        profileResults[profileKey] = result;
        exclusions.push(createRankingPolicyExclusion(servant, profileKey, result));
      }
    }
  }
  return {
    rows,
    profileResults,
    exclusions,
    damageCache: damageCache.inventory,
    candidateInventory: {
      semanticUpperBound,
      generatedCount,
      deduplicatedCount: deduplicatedKeys.size,
      damageRequestUpperBound: generatedCount,
      damageRequestCount: damageCache.inventory.requestCount,
      distinctDamageInputCount: damageCache.inventory.distinctDamageInputCount,
    },
  };
}
