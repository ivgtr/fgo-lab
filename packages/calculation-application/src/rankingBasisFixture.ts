import type { ServantMaster } from '@fgo-lab/master-data';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
  type RankingProfileInput,
} from './rankingContracts';
import { compileRankingSelection, resolveRankingBasis } from './rankingBasis';

export function rankingBasisFixture(
  servant: ServantMaster,
  conditions: RankingPolicyConditions = DEFAULT_RANKING_POLICY_CONDITIONS,
  profile: RankingProfileInput = { servantBuilds: {} },
) {
  const result = compileRankingSelection(conditions);
  if (result.status === 'invalid') throw new TypeError(result.reason);
  return resolveRankingBasis(servant, profile, result.selection);
}
