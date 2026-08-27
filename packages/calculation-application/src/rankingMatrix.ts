import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import type {
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingNpLevel,
  RankingProfileInput,
  RankingRowSummary,
  RankingSummaryMatrix,
} from './rankingContracts';
import { createRankingRow, includedRankingServants } from './rankingRows';
import {
  compileRankingExecutionPlan,
  executeRankingScenarios,
  selectRankingExecutionIndex,
} from './rankingScenario';

const NP_LEVELS = [1, 2, 3, 4, 5] as const;

export function rankingMatrixPolicyKey(conditions: Omit<RankingConditions, 'npLevel'>): string {
  return [
    conditions.comparisonMode,
    conditions.classAffinity,
    conditions.selfBuffs,
    conditions.specialAttack,
  ].join(':');
}

function detailAtNpLevel(
  execution: ReturnType<typeof executeRankingScenarios>[number],
  npLevel: RankingNpLevel,
  worldCandidateCount: number,
  scenarioCalculationCount: number,
): RankingDetail {
  if (execution.scenario.mode !== 'resolved')
    throw new TypeError('ranking_matrix_resolved_scenario_required');
  const scenario: Extract<CalculationScenario, { mode: 'resolved' }> = {
    ...execution.scenario,
    attacker: { ...execution.scenario.attacker, npLevel },
  };
  return {
    servantId: scenario.attacker.servantId,
    scenario,
    input: { ...execution.input, npLevel },
    result: execution.result,
    effects: execution.effects,
    effectInputs: execution.effectInputs,
    warnings: execution.effectWarnings,
    areaContribution: null,
    executionMetrics: { worldCandidateCount, scenarioCalculationCount },
  };
}

export function calculateStandardRankingMatrix(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: Omit<RankingConditions, 'npLevel'>,
  versions: VersionContext,
): RankingSummaryMatrix {
  if (conditions.comparisonMode !== 'standard')
    throw new TypeError('ranking_matrix_standard_mode_required');
  const rows = NP_LEVELS.map(() => [] as RankingRowSummary[]);
  const failures = NP_LEVELS.map(() => [] as RankingFailure[]);
  const baseConditions: RankingConditions = { ...conditions, npLevel: 1 };
  for (const servant of includedRankingServants(master, profile, baseConditions)) {
    const plan = compileRankingExecutionPlan(servant, master, profile, baseConditions, versions);
    const executions = executeRankingScenarios(plan.rankingScenarios, master, versions);
    for (const npLevel of NP_LEVELS) {
      const selected = executions[selectRankingExecutionIndex(executions, npLevel)]!;
      const detail = detailAtNpLevel(
        selected,
        npLevel,
        plan.worldCandidateCount,
        1 + executions.length,
      );
      const row = createRankingRow(servant, detail, profile);
      if ('status' in row) failures[npLevel - 1]!.push(row);
      else rows[npLevel - 1]!.push(row);
    }
  }
  return NP_LEVELS.map((npLevel) => ({
    rows: rows[npLevel - 1]!,
    failures: failures[npLevel - 1]!,
  })) as unknown as RankingSummaryMatrix;
}
