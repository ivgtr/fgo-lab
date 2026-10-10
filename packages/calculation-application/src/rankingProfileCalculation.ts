import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles, type AttackProfile } from './attackProfile';
import { compileRankingSelection } from './rankingBasis';
import type {
  RankingPolicyConditions,
  RankingProfileInput,
  RankingProfileResult,
} from './rankingContracts';
import { includedRankingServants } from './rankingRows';
import { calculateRankingCandidateSet } from './rankingPolicyCandidates';
import { rankingFailureResult, unresolvedProfileResult } from './rankingProfileOutcome';

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
    const requested = attackProfile ?? createStaticAttackProfiles(servant)[0];
    if (!requested)
      return {
        status: 'invalid',
        attackProfile: null,
        issues: [],
        reason: 'rankingAttackProfileInventoryMissing',
      };
    const candidateSet = calculateRankingCandidateSet(
      servant,
      master,
      profile,
      conditions,
      versions,
      includeAreaSupport,
      undefined,
      false,
      undefined,
      attackProfileKey(requested),
    );
    return unresolvedProfileResult(candidateSet, requested);
  } catch (error) {
    return rankingFailureResult(error, attackProfile ?? null);
  }
}
