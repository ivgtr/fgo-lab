import {
  noblePhantasmVariantKey,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import {
  applyRankingCanonicalMinimums,
  createRankingBaseScenario,
  type ResolvedScenario,
} from './rankingPolicy';
import { compileRankingScenarioWorlds } from './rankingScenarioWorlds';
import { calculateScenario, type CalculationExecution } from './scenario';

export { selectedKeysForScope } from './rankingScenarioWorlds';

export interface RankingExecutionPlan {
  baseScenario: ResolvedScenario;
  baseline: CalculationExecution;
  rankingScenarios: readonly ResolvedScenario[];
  withoutAreaScenarios: readonly ResolvedScenario[];
  worldCandidateCount: number;
}

export function compileRankingExecutionPlan(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingExecutionPlan {
  const initial = createRankingBaseScenario(servant, master, profile, conditions);
  const baseline = calculateScenario(initial, master, versions);
  const canonical = applyRankingCanonicalMinimums(initial, baseline);
  const worlds = compileRankingScenarioWorlds({
    servant,
    master,
    conditions,
    versions,
    canonical,
    baseline,
  });
  return { baseScenario: canonical, baseline, ...worlds };
}

function selectedAverage(
  execution: CalculationExecution,
  npLevel: 1 | 2 | 3 | 4 | 5,
): number | null {
  if (execution.result.status !== 'calculated' || execution.scenario.mode !== 'resolved')
    return null;
  return execution.result.rows[npLevel - 1]?.average ?? null;
}

function rankingExternalFieldFactCount(execution: CalculationExecution): number {
  return execution.scenario.mode === 'resolved'
    ? execution.scenario.worldFactAssertions.filter(
        ({ decisionKey, fact }) =>
          decisionKey.startsWith('ranking:field:') && fact.kind === 'trait' && fact.present,
      ).length
    : 0;
}

const rankingActivationFactCount = (execution: CalculationExecution): number =>
  execution.scenario.mode === 'resolved' ? execution.scenario.activationFacts.length : 0;

export function executeRankingScenarios(
  scenarios: readonly ResolvedScenario[],
  master: MasterDataSnapshot,
  versions: VersionContext,
): CalculationExecution[] {
  return scenarios.map((scenario) => calculateScenario(scenario, master, versions));
}

export function selectRankingExecutionIndexes(
  executions: readonly CalculationExecution[],
  npLevel: 1 | 2 | 3 | 4 | 5,
): ReadonlyMap<'single' | 'all', number> {
  const candidates = executions
    .map((execution, index) => ({ execution, index, average: selectedAverage(execution, npLevel) }))
    .filter(
      (candidate): candidate is typeof candidate & { average: number } =>
        candidate.average !== null && candidate.execution.noblePhantasmVariant?.kind === 'attack',
    );
  const selected = new Map<'single' | 'all', number>();
  for (const scope of ['single', 'all'] as const) {
    const winner = candidates
      .filter(
        (candidate) =>
          candidate.execution.noblePhantasmVariant?.kind === 'attack' &&
          candidate.execution.noblePhantasmVariant.targetScope === scope,
      )
      .sort(
        (left, right) =>
          right.average - left.average ||
          rankingExternalFieldFactCount(left.execution) -
            rankingExternalFieldFactCount(right.execution) ||
          rankingActivationFactCount(left.execution) -
            rankingActivationFactCount(right.execution) ||
          noblePhantasmVariantKey(left.execution.noblePhantasmVariant!.ref).localeCompare(
            noblePhantasmVariantKey(right.execution.noblePhantasmVariant!.ref),
          ),
      )[0];
    if (winner) selected.set(scope, winner.index);
  }
  if (selected.size === 0) throw new TypeError('ranking_candidate_execution_missing');
  return selected;
}

export function createRankingScenarioFromPolicy(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  targetScope?: 'single' | 'all',
): ResolvedScenario {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const executions = executeRankingScenarios(plan.rankingScenarios, master, versions);
  const selected = selectRankingExecutionIndexes(executions, conditions.npLevel);
  const scope = targetScope ?? [...selected.keys()][0]!;
  const index = selected.get(scope);
  if (index === undefined) throw new TypeError(`ranking_scope_candidate_missing:${scope}`);
  return executions[index]!.scenario as ResolvedScenario;
}
