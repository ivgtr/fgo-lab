import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { applyEffectControlPolicy } from './effectDecision';
import type { EffectControlViewModel } from './effectControls';
import {
  contributesAreaSupport,
  contributesToPersonalDamage,
  isSpecialAttack,
} from './rankingContribution';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import {
  applyRankingCanonicalMinimums,
  createRankingBaseScenario,
  type ResolvedScenario,
} from './rankingPolicy';
import {
  createRankingWorldCandidates,
  effectMatchesRankingWorld,
  materializeRankingWorld,
  type RankingWorldCandidate,
} from './rankingWorld';
import { calculateScenario, type CalculationExecution } from './scenario';

export interface RankingExecutionPlan {
  baseScenario: ResolvedScenario;
  baseline: CalculationExecution;
  personalScenarios: readonly ResolvedScenario[];
  areaScenarios: readonly ResolvedScenario[];
  worldCandidateCount: number;
}

function selectedKeysForScope(
  controls: readonly EffectControlViewModel[],
  conditions: RankingConditions,
  scope: 'personal' | 'area',
  candidate: RankingWorldCandidate | null,
  master: MasterDataSnapshot,
): Set<string> {
  const selected = new Set<string>();
  for (const control of controls) {
    const contributes =
      scope === 'personal'
        ? contributesToPersonalDamage(control)
        : contributesToPersonalDamage(control) || contributesAreaSupport(control);
    if (!contributes || conditions.selfBuffs === 'excluded') continue;
    if (!isSpecialAttack(control)) selected.add(control.key);
    else if (
      conditions.specialAttack === 'active' &&
      candidate &&
      effectMatchesRankingWorld(control, candidate, master)
    )
      selected.add(control.key);
  }
  return selected;
}

function scenarioForPolicy(
  scenario: ResolvedScenario,
  baseline: CalculationExecution,
  conditions: RankingConditions,
  scope: 'personal' | 'area',
  candidate: RankingWorldCandidate | null,
  master: MasterDataSnapshot,
): ResolvedScenario {
  const world = candidate ? materializeRankingWorld(scenario, candidate) : scenario;
  return applyEffectControlPolicy(
    world,
    baseline.effectControls,
    selectedKeysForScope(baseline.effectControls, conditions, scope, candidate, master),
    baseline.effects,
    baseline.effectInputs,
  );
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
  const specialControls = baseline.effectControls.filter(
    (control) =>
      isSpecialAttack(control) &&
      (contributesToPersonalDamage(control) || contributesAreaSupport(control)),
  );
  const candidates =
    conditions.specialAttack === 'active'
      ? createRankingWorldCandidates(servant, master, canonical, specialControls)
      : [];
  const worlds = candidates.length > 0 ? candidates : [null];
  const personalScenarios = worlds.map((candidate) =>
    scenarioForPolicy(canonical, baseline, conditions, 'personal', candidate, master),
  );
  const hasArea = baseline.effectControls.some(contributesAreaSupport);
  const areaScenarios =
    conditions.selfBuffs === 'included' && hasArea
      ? worlds.map((candidate) =>
          scenarioForPolicy(canonical, baseline, conditions, 'area', candidate, master),
        )
      : [];
  return {
    baseScenario: canonical,
    baseline,
    personalScenarios,
    areaScenarios,
    worldCandidateCount: worlds.length,
  };
}

function selectedAverage(
  execution: CalculationExecution,
  npLevel: 1 | 2 | 3 | 4 | 5,
): number | null {
  if (execution.result.status !== 'calculated' || execution.scenario.mode !== 'resolved')
    return null;
  return execution.result.rows[npLevel - 1]?.average ?? null;
}

export function executeRankingScenarios(
  scenarios: readonly ResolvedScenario[],
  master: MasterDataSnapshot,
  versions: VersionContext,
): CalculationExecution[] {
  return scenarios.map((scenario) => calculateScenario(scenario, master, versions));
}

export function selectRankingExecutionIndex(
  executions: readonly CalculationExecution[],
  npLevel: 1 | 2 | 3 | 4 | 5,
): number {
  const selected = executions
    .map((execution, index) => ({ execution, index, average: selectedAverage(execution, npLevel) }))
    .filter(
      (candidate): candidate is typeof candidate & { average: number } =>
        candidate.average !== null,
    )
    .sort(
      (left, right) =>
        right.average - left.average ||
        JSON.stringify(left.execution.scenario).localeCompare(
          JSON.stringify(right.execution.scenario),
        ),
    )[0];
  if (!selected) throw new TypeError('ranking_candidate_execution_missing');
  return selected.index;
}

export function createRankingScenarioFromPolicy(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): ResolvedScenario {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const executions = executeRankingScenarios(plan.personalScenarios, master, versions);
  return executions[selectRankingExecutionIndex(executions, conditions.npLevel)]!
    .scenario as ResolvedScenario;
}
