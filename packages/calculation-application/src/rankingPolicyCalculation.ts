import { compileRankingSelection } from './rankingBasis';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
import type { DamageResolutionValue } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import {
  calculateRankingCandidateSet,
  calculateRankingCandidateSummary,
} from './rankingPolicyCandidates';
import type { RankingCandidateEvent } from './rankingCandidateBatch';
import type {
  RankingPolicyCalculation,
  RankingPolicyConditions,
  RankingProfileInput,
  RankingProfileResult,
  RankingRowSummary,
  RankingPolicySummary,
} from './rankingContracts';
import {
  createRankingPolicyExclusion,
  createRankingRow,
  includedRankingServants,
} from './rankingRows';
import { rankingFailureResult, unresolvedProfileResult } from './rankingProfileOutcome';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';

export interface RankingPolicyCandidateObservation {
  servant: ServantMaster;
  conditions: RankingPolicyConditions;
  candidateSet: RankingCandidateCalculation;
  candidateEvents: readonly RankingCandidateEvent[];
}

export type RankingPolicyCandidateObserver = (
  observation: RankingPolicyCandidateObservation,
) => void;

function evaluateRankingPolicy(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  observeCandidate?: RankingPolicyCandidateObserver,
): RankingPolicyCalculation;
function evaluateRankingPolicy(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  observeCandidate: undefined,
  retainProfileResults: false,
): RankingPolicySummary;
function evaluateRankingPolicy(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  observeCandidate?: RankingPolicyCandidateObserver,
  retainProfileResults = true,
): RankingPolicyCalculation | RankingPolicySummary {
  const rows: RankingRowSummary[] = [];
  const profileResults: Record<string, RankingProfileResult> | undefined = retainProfileResults
    ? {}
    : undefined;
  const exclusions: RankingPolicyCalculation['exclusions'] = [];
  const damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>();
  let generatedCount = 0;
  let semanticUpperBound = 0;
  let deduplicatedCount = 0;
  const selection = compileRankingSelection(conditions);
  const population =
    selection.status === 'valid'
      ? includedRankingServants(master, profile, selection.selection)
      : [];
  for (const servant of population) {
    const inventory = createStaticAttackProfiles(servant);
    let candidateSet:
      RankingCandidateCalculation | ReturnType<typeof calculateRankingCandidateSummary>;
    const candidateEvents: RankingCandidateEvent[] = [];
    try {
      if (!retainProfileResults && !observeCandidate)
        candidateSet = calculateRankingCandidateSummary(
          servant,
          master,
          profile,
          conditions,
          versions,
          damageCache,
        );
      else {
        candidateSet = calculateRankingCandidateSet(
          servant,
          master,
          profile,
          conditions,
          versions,
          false,
          damageCache,
          false,
          observeCandidate ? (event) => candidateEvents.push(event) : undefined,
        );
      }
    } catch (error) {
      for (const attackProfile of inventory) {
        const profileKey = attackProfileKey(attackProfile);
        const result = rankingFailureResult(error, attackProfile);
        if (profileResults) profileResults[profileKey] = result;
        exclusions.push(createRankingPolicyExclusion(servant, profileKey, result));
      }
      continue;
    }
    if (observeCandidate && !('rows' in candidateSet))
      observeCandidate({ servant, conditions, candidateSet, candidateEvents });
    try {
      const { plan } = candidateSet;
      generatedCount += candidateSet.candidateInventory.generated;
      semanticUpperBound += plan.candidateUpperBound;
      // Canonical servant IDs are unique; exact per-servant key sets have disjoint namespaces.
      deduplicatedCount += candidateSet.candidateInventory.deduplicated;
      if ('rows' in candidateSet) {
        rows.push(...candidateSet.rows);
        exclusions.push(...candidateSet.exclusions);
        continue;
      }
      for (const attackProfile of inventory) {
        const profileKey = attackProfileKey(attackProfile);
        const result = unresolvedProfileResult(candidateSet, attackProfile);
        if (profileResults) profileResults[profileKey] = result;
        if (result.status === 'calculated')
          rows.push(createRankingRow(servant, result.detail, profile));
        else exclusions.push(createRankingPolicyExclusion(servant, profileKey, result));
      }
    } catch (error) {
      for (const attackProfile of inventory) {
        const profileKey = attackProfileKey(attackProfile);
        const result = rankingFailureResult(error, attackProfile);
        if (profileResults) profileResults[profileKey] = result;
        exclusions.push(createRankingPolicyExclusion(servant, profileKey, result));
      }
    }
  }
  return {
    ...(selection.status === 'invalid' ? selection : { status: 'calculated' as const }),
    rows,
    ...(profileResults ? { profileResults } : {}),
    exclusions,
    damageCache: damageCache.inventory,
    candidateInventory: {
      semanticUpperBound,
      generatedCount,
      deduplicatedCount: deduplicatedCount,
      damageRequestUpperBound: generatedCount,
      damageRequestCount: damageCache.inventory.requestCount,
      distinctDamageInputCount: damageCache.inventory.distinctDamageInputCount,
    },
  };
}

export function calculateRankingPolicy(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  observeCandidate?: RankingPolicyCandidateObserver,
): RankingPolicyCalculation {
  return evaluateRankingPolicy(master, profile, conditions, versions, observeCandidate);
}

export function calculateRankingPolicySummary(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
): RankingPolicySummary {
  return evaluateRankingPolicy(master, profile, conditions, versions, undefined, false);
}
