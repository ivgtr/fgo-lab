import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type {
  RankingCalculation,
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingProfileInput,
  RankingRowSummary,
  RankingSummary,
} from './rankingContracts';
import { createRankingScenarioFromPolicy } from './rankingScenario';
import { createRankingRow, includedLegacyRankingServants } from './rankingRows';
import type { AttackProfile } from './attackProfile';
import { calculateRankingCandidates, selectRankingDetail } from './rankingCandidates';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import type { calculateDamageResolution } from './damageResolution';

export * from './rankingContracts';

export function createRankingScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  attackProfile?: AttackProfile,
) {
  return createRankingScenarioFromPolicy(
    servant,
    master,
    profile,
    conditions,
    versions,
    attackProfile,
  );
}

export function calculateRankingDetail(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  attackProfile?: AttackProfile,
): RankingDetail {
  const details = calculateRankingCandidates(servant, master, profile, conditions, versions, true);
  return selectRankingDetail(details, servant, attackProfile);
}

function calculateRows(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  includeDetails: boolean,
): RankingCalculation {
  const rows: RankingRowSummary[] = [];
  const failures: RankingFailure[] = [];
  const details: Record<string, RankingDetail> = {};
  const damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>();
  for (const servant of includedLegacyRankingServants(master, profile, conditions)) {
    let servantDetails: ReadonlyMap<string, RankingDetail>;
    try {
      servantDetails = calculateRankingCandidates(
        servant,
        master,
        profile,
        conditions,
        versions,
        includeDetails,
        damageCache,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown';
      throw new TypeError(`ranking_candidate_failure:${servant.id}:${detail}`);
    }
    for (const detail of servantDetails.values()) {
      if (includeDetails) details[detail.entryId] = detail;
      const candidate = createRankingRow(servant, detail, profile);
      if ('status' in candidate) failures.push(candidate);
      else rows.push(candidate);
    }
  }
  return { rows, failures, details, damageCache: damageCache.inventory };
}

export function calculateRankingSummary(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingSummary {
  const { rows, failures } = calculateRows(master, profile, conditions, versions, false);
  return { rows, failures };
}

export function calculateRanking(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingCalculation {
  return calculateRows(master, profile, conditions, versions, true);
}
