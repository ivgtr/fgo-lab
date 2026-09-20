import { compileRankingSelection } from './rankingBasis';
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
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';

export interface RankingPolicyCandidateObservation {
  servant: ServantMaster;
  conditions: RankingPolicyConditions;
  candidateSet: RankingCandidateCalculation;
}

export type RankingPolicyCandidateObserver = (
  observation: RankingPolicyCandidateObservation,
) => void;

export function calculateRankingPolicyDetail(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  attackProfile?: AttackProfile,
  includeAreaSupport = true,
): RankingProfileResult {
  const selection = compileRankingSelection(conditions);
  if (selection.status === 'invalid') return { ...selection, attackProfile: null, issues: [] };
  if (
    !includedRankingServants(master, profile, selection.selection).some(
      ({ id }) => id === servant.id,
    )
  )
    return {
      status: 'invalid',
      attackProfile: null,
      issues: [],
      reason: 'rankingServantOutsidePopulation',
    };
  try {
    const candidateSet = calculateRankingCandidateSet(
      servant,
      master,
      profile,
      conditions,
      versions,
      includeAreaSupport,
    );
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
  observeCandidate?: RankingPolicyCandidateObserver,
): RankingPolicyCalculation {
  const rows: RankingRowSummary[] = [];
  const profileResults: Record<string, RankingProfileResult> = {};
  const exclusions: RankingPolicyCalculation['exclusions'] = [];
  const damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>();
  let generatedCount = 0;
  let semanticUpperBound = 0;
  const deduplicatedKeys = new Set<string>();
  const selection = compileRankingSelection(conditions);
  const population =
    selection.status === 'valid'
      ? includedRankingServants(master, profile, selection.selection)
      : [];
  for (const servant of population) {
    const inventory = createStaticAttackProfiles(servant);
    let candidateSet: RankingCandidateCalculation;
    try {
      candidateSet = calculateRankingCandidateSet(
        servant,
        master,
        profile,
        conditions,
        versions,
        false,
        damageCache,
      );
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
      continue;
    }
    observeCandidate?.({ servant, conditions, candidateSet });
    try {
      const { plan } = candidateSet;
      generatedCount += plan.candidateKeys.length;
      semanticUpperBound += plan.candidateUpperBound;
      for (const [index, key] of plan.candidateKeys.entries())
        deduplicatedKeys.add(
          `${servant.id}:${attackProfileKey(plan.attackProfiles[index]!)}:${key}`,
        );
      for (const attackProfile of inventory) {
        const profileKey = attackProfileKey(attackProfile);
        const result = unresolvedProfileResult(candidateSet, attackProfile);
        profileResults[profileKey] = result;
        if (result.status === 'calculated')
          rows.push(createRankingRow(servant, result.detail, profile));
        else exclusions.push(createRankingPolicyExclusion(servant, profileKey, result));
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
    ...(selection.status === 'invalid' ? selection : { status: 'calculated' as const }),
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
