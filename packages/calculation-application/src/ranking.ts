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
  selectRankingExecutionIndexes,
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
  targetScope?: 'single' | 'all',
) {
  return createRankingScenarioFromPolicy(
    servant,
    master,
    profile,
    conditions,
    versions,
    targetScope,
  );
}

export function calculateRankingDetail(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  targetScope?: 'single' | 'all',
): RankingDetail {
  const details = calculateRankingCandidates(servant, master, profile, conditions, versions, true);
  const detail = targetScope
    ? details.get(targetScope)
    : (details.get('single') ?? details.get('all'));
  if (!detail) throw new TypeError(`ranking_scope_candidate_missing:${servant.id}`);
  return detail;
}

function calculateRankingCandidates(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
): ReadonlyMap<'single' | 'all', RankingDetail> {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const candidates = executeRankingScenarios(plan.rankingScenarios, master, versions);
  const selected = selectRankingExecutionIndexes(candidates, conditions.npLevel);
  return new Map(
    [...selected].map(([scope, selectedIndex]) => {
      const execution = candidates[selectedIndex]!;
      const variant = execution.noblePhantasmVariant;
      if (variant?.kind !== 'attack' || variant.targetScope !== scope)
        throw new TypeError(`ranking_variant_scope_mismatch:${servant.id}:${scope}`);
      const withoutAreaExecution =
        includeAreaSupport && plan.withoutAreaScenarios[selectedIndex]
          ? calculateScenario(plan.withoutAreaScenarios[selectedIndex], master, versions)
          : null;
      const detail: RankingDetail = {
        entryId: `${servant.id}:${scope}`,
        servantId: servant.id,
        noblePhantasmVariant: variant.ref,
        noblePhantasmName: variant.name,
        npCard: variant.card,
        npTarget: variant.targetScope,
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
      return [scope, detail] as const;
    }),
  );
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
    const servantDetails = calculateRankingCandidates(
      servant,
      master,
      profile,
      conditions,
      versions,
      includeDetails,
    );
    for (const detail of servantDetails.values()) {
      if (includeDetails) details[detail.entryId] = detail;
      const candidate = createRankingRow(servant, detail, profile);
      if ('status' in candidate) failures.push(candidate);
      else rows.push(candidate);
    }
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
