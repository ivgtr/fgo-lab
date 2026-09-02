import type { ContributionApplicationPolicy } from '@fgo-lab/battle-execution';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { ActorFormId } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, createStaticAttackProfiles, type AttackProfile } from './attackProfile';
import {
  compileRankingCandidateSpaces,
  materializeRankingCandidateSpace,
  type RankingCandidateSpace,
  type RankingCandidateEvidence,
} from './rankingCandidateSpace';
import type { RankingPolicyConditions, RankingProfileInput } from './rankingContracts';
import { executeRankingScenarios, selectRankingExecutionIndexes } from './rankingExecution';
import type { ResolvedScenario } from './rankingPolicy';
import { prepareCalculationScenarioWithPolicy, type PreparedCalculationScenario } from './scenario';

export { executeRankingScenarios, selectRankingExecutionIndexes } from './rankingExecution';

export interface RankingExecutionPlan {
  baseScenario: ResolvedScenario | null;
  rankingScenarios: readonly ResolvedScenario[];
  preparedRankingScenarios: readonly PreparedCalculationScenario[];
  attackProfiles: readonly AttackProfile[];
  expectedTerminalFormIds: readonly ActorFormId[];
  contributionPolicies: readonly ContributionApplicationPolicy[];
  withoutAreaScenarios: readonly (ResolvedScenario | null)[];
  withoutAreaContributionPolicies: readonly (ContributionApplicationPolicy | null)[];
  candidateSpaces: readonly RankingCandidateSpace[];
  worldCandidateCount: number;
  candidateUpperBound: number;
  candidateKeys: readonly string[];
  preparationPlanKeys: readonly string[];
  startNpGauges: readonly number[];
  baselineInputDeviations: readonly number[];
  candidateEvidence: readonly RankingCandidateEvidence[];
}

export function compileRankingExecutionPlan(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  _versions: VersionContext,
): RankingExecutionPlan {
  void _versions;
  const inventory = createStaticAttackProfiles(servant);
  const candidateSpaces = compileRankingCandidateSpaces(
    servant,
    master,
    profile,
    conditions,
    inventory,
  );
  const candidates = candidateSpaces.flatMap((space) =>
    space.status === 'ready'
      ? materializeRankingCandidateSpace({ servant, master, profile, conditions, space })
      : [],
  );
  const preparedRankingScenarios = candidates.map((candidate) =>
    prepareCalculationScenarioWithPolicy(candidate.scenario, master, candidate.contributionPolicy, {
      initialNpGauge: candidate.evidence.startNpGauge,
    }),
  );
  const baselineGauge = master.npResourceSemantics.noblePhantasmUse.requirement;
  return {
    baseScenario: candidates[0]?.scenario ?? null,
    rankingScenarios: candidates.map(({ scenario }) => scenario),
    preparedRankingScenarios,
    attackProfiles: candidates.map(({ attackProfile }) => attackProfile),
    expectedTerminalFormIds: candidates.map(({ expectedTerminalFormId }) => expectedTerminalFormId),
    contributionPolicies: candidates.map(({ contributionPolicy }) => contributionPolicy),
    withoutAreaScenarios: candidates.map((candidate) =>
      candidate.withoutAreaContributionPolicy ? candidate.scenario : null,
    ),
    withoutAreaContributionPolicies: candidates.map(
      ({ withoutAreaContributionPolicy }) => withoutAreaContributionPolicy,
    ),
    candidateSpaces,
    worldCandidateCount: candidates.length,
    candidateUpperBound: candidateSpaces.reduce(
      (sum, space) => sum + (space.status === 'ready' ? space.upperBound : 0),
      0,
    ),
    candidateKeys: candidates.map(({ key }) => key),
    preparationPlanKeys: candidates.map(({ evidence }) => evidence.preparationPlanKey),
    startNpGauges: candidates.map(({ evidence }) => evidence.startNpGauge),
    baselineInputDeviations: candidates.map(
      ({ evidence, scenario }) =>
        evidence.canonicalInputBaselineDeviation +
        Math.abs(evidence.startNpGauge - baselineGauge) +
        scenario.worldFactAssertions.filter(
          ({ decisionKey, fact }) =>
            decisionKey.startsWith('ranking:') && fact.kind === 'trait' && fact.present,
        ).length,
    ),
    candidateEvidence: candidates.map(({ evidence }) => evidence),
  };
}

export function createRankingScenarioFromPolicy(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  requestedAttackProfile?: AttackProfile,
): ResolvedScenario {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const executions = executeRankingScenarios(
    plan.preparedRankingScenarios,
    master,
    versions,
    plan.contributionPolicies,
  );
  const selected = selectRankingExecutionIndexes(
    executions,
    plan.attackProfiles,
    conditions.npLevel,
    plan,
  );
  const requestedKey = requestedAttackProfile ? attackProfileKey(requestedAttackProfile) : null;
  const selectedEntry = [...selected].find(
    ([profileKey]) => requestedKey === null || profileKey === requestedKey,
  );
  const index = selectedEntry?.[1];
  if (index === undefined)
    throw new TypeError(`ranking_attack_profile_candidate_missing:${requestedKey ?? 'default'}`);
  return executions[index]!.scenario as ResolvedScenario;
}
