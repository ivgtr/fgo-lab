import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles, type AttackProfile } from './attackProfile';
import type { calculateDamageResolution } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import {
  calculateRankingCandidateSet,
  type RankingCandidateCalculation,
} from './rankingPolicyCandidates';
import type {
  RankingPolicyCalculation,
  RankingPolicyConditions,
  RankingProfileInput,
  RankingProfileResult,
  RankingRowSummary,
} from './rankingContracts';
import { createRankingRow, includedRankingServants } from './rankingRows';

function unresolvedProfileResult(
  candidateSet: RankingCandidateCalculation,
  attackProfile: AttackProfile,
): RankingProfileResult {
  const profileKey = attackProfileKey(attackProfile);
  const space = candidateSet.plan.candidateSpaces.find(
    (candidate) => attackProfileKey(candidate.attackProfile) === profileKey,
  );
  if (space?.status === 'invalid')
    return {
      status: 'invalid',
      attackProfile,
      issues: [],
      reason: space.issue.kind,
      candidateSpaceIssue: space.issue,
    };
  if (!space || space.programs.length === 0)
    return { status: 'unavailableUnderPolicy', attackProfile, reason: 'attackProfileNotReachable' };
  const matchingIndexes = candidateSet.plan.attackProfiles.flatMap((candidate, index) =>
    attackProfileKey(candidate) === profileKey ? [index] : [],
  );
  const matchingExecutions = matchingIndexes.map((index) => candidateSet.executions[index]!);
  const inputRequired = matchingExecutions.find(({ result }) => result.status === 'inputRequired');
  if (inputRequired?.result.status === 'inputRequired')
    return {
      status: 'invalid',
      attackProfile,
      issues: inputRequired.result.issues,
      reason: `inputRequired:${inputRequired.result.requiredInputs.map(({ key }) => key).join(',')}`,
    };
  const insufficientGauge = matchingIndexes.some(
    (index) =>
      candidateSet.plan.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ===
      'insufficientNpGauge',
  );
  if (insufficientGauge)
    return { status: 'unavailableUnderPolicy', attackProfile, reason: 'insufficientNpGauge' };
  return { status: 'unavailableUnderPolicy', attackProfile, reason: 'noSatisfiableCandidate' };
}

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
          profileResults[profileKey] = unresolvedProfileResult(candidateSet, attackProfile);
          continue;
        }
        profileResults[profileKey] = { status: 'calculated', detail };
        const row = createRankingRow(servant, detail, profile);
        if (!('status' in row)) rows.push(row);
      }
    } catch (error) {
      for (const attackProfile of inventory)
        profileResults[attackProfileKey(attackProfile)] = {
          status: 'invalid',
          attackProfile,
          issues: [],
          reason: 'unexpectedRankingFailure',
          detail: error instanceof Error ? error.message : String(error),
        };
    }
  }
  return {
    rows,
    profileResults,
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
