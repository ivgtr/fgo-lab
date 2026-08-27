import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import type {
  RankingCalculation,
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingProfileInput,
  RankingRowSummary,
  RankingSummary,
} from './rankingContracts';
import {
  compileRankingExecutionPlan,
  createRankingScenarioFromPolicy,
  executeRankingScenarios,
  selectRankingExecutionIndex,
} from './rankingScenario';
import { createRankingRow, includedRankingServants } from './rankingRows';
import { calculateScenario } from './scenario';

export * from './rankingContracts';

export function createRankingScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
) {
  return createRankingScenarioFromPolicy(servant, master, profile, conditions, versions);
}

export function calculateRankingDetail(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingDetail {
  return calculateRankingCandidate(servant, master, profile, conditions, versions, true);
}

function calculateRankingCandidate(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
): RankingDetail {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const candidates = executeRankingScenarios(plan.rankingScenarios, master, versions);
  const selectedIndex = selectRankingExecutionIndex(candidates, conditions.npLevel);
  const execution = candidates[selectedIndex]!;
  const withoutAreaExecution =
    includeAreaSupport && plan.withoutAreaScenarios[selectedIndex]
      ? calculateScenario(plan.withoutAreaScenarios[selectedIndex], master, versions)
      : null;
  return {
    servantId: servant.id,
    scenario: execution.scenario as Extract<CalculationScenario, { mode: 'resolved' }>,
    input: execution.input,
    result: execution.result,
    effects: execution.effects,
    effectInputs: execution.effectInputs,
    warnings: execution.effectWarnings,
    areaContribution: withoutAreaExecution
      ? {
          withoutAreaScenario: withoutAreaExecution.scenario as Extract<
            CalculationScenario,
            { mode: 'resolved' }
          >,
          withoutAreaInput: withoutAreaExecution.input,
          withoutAreaResult: withoutAreaExecution.result,
          withoutAreaEffects: withoutAreaExecution.effects,
          warnings: withoutAreaExecution.effectWarnings,
        }
      : null,
    executionMetrics: {
      worldCandidateCount: plan.worldCandidateCount,
      scenarioCalculationCount: 1 + candidates.length + (withoutAreaExecution ? 1 : 0),
    },
  };
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
  for (const servant of includedRankingServants(master, profile, conditions)) {
    const detail = calculateRankingCandidate(
      servant,
      master,
      profile,
      conditions,
      versions,
      includeDetails,
    );
    if (includeDetails) details[servant.id] = detail;
    const candidate = createRankingRow(servant, detail, profile);
    if ('status' in candidate) failures.push(candidate);
    else rows.push(candidate);
  }
  return { rows, failures, details };
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
