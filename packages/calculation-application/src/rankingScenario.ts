import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { EffectControlViewModel } from './effectControls';
import {
  contributesToAttackerDamage,
  contributesAreaSupport,
  isSpecialAttack,
} from './rankingContribution';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import {
  applyRankingExecutionPolicy,
  compileRankingExecutionPolicy,
} from './rankingExecutionPolicy';
import { materializeRankingAttackerFacts } from './rankingActorWorld';
import {
  createRankingFieldCandidates,
  materializeRankingField,
  type RankingFieldCandidate,
} from './rankingFieldWorld';
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
import { createRankingChoiceCandidates, type RankingChoiceWorld } from './rankingChoiceWorld';
export interface RankingExecutionPlan {
  baseScenario: ResolvedScenario;
  baseline: CalculationExecution;
  rankingScenarios: readonly ResolvedScenario[];
  withoutAreaScenarios: readonly ResolvedScenario[];
  worldCandidateCount: number;
}
interface RankingWorld {
  target: RankingWorldCandidate | null;
  field: RankingFieldCandidate;
  choices: RankingChoiceWorld;
}

export function selectedKeysForScope(
  controls: readonly EffectControlViewModel[],
  conditions: RankingConditions,
  scope: 'ranking' | 'withoutArea',
  candidate: RankingWorldCandidate | null,
  master: MasterDataSnapshot,
  choices: Readonly<Record<string, string>> = {},
): Set<string> {
  const selected = new Set<string>();
  for (const control of controls) {
    const contributes =
      contributesToAttackerDamage(control.projection) &&
      (scope === 'ranking' || !contributesAreaSupport(control.projection));
    if (!contributes || conditions.selfBuffs === 'excluded') continue;
    if (!isSpecialAttack(control.projection)) selected.add(control.key);
    else if (
      conditions.specialAttack === 'active' &&
      candidate &&
      effectMatchesRankingWorld(control, candidate, master)
    )
      selected.add(control.key);
  }
  return new Set(
    controls.flatMap((control) =>
      selected.has(control.key) &&
      control.projection.selectionGroups
        .filter(({ groupKey }) => groupKey.startsWith('choice:'))
        .every(
          (group) =>
            choices[group.groupKey] === undefined || choices[group.groupKey] === group.candidateKey,
        )
        ? [control.key]
        : [],
    ),
  );
}

function scenarioForPolicy(
  servant: ServantMaster,
  scenario: ResolvedScenario,
  baseline: CalculationExecution,
  conditions: RankingConditions,
  scope: 'ranking' | 'withoutArea',
  worldCandidate: RankingWorld,
  master: MasterDataSnapshot,
): ResolvedScenario {
  const targetWorld = worldCandidate.target
    ? materializeRankingWorld(scenario, worldCandidate.target)
    : scenario;
  const fieldWorld = materializeRankingField(targetWorld, worldCandidate.field);
  const world = materializeRankingAttackerFacts(fieldWorld, servant, baseline.effectControls);
  const policy = compileRankingExecutionPolicy(
    world.targetContext,
    baseline.effectControls,
    selectedKeysForScope(
      baseline.effectControls,
      conditions,
      scope,
      worldCandidate.target,
      master,
      worldCandidate.choices,
    ),
  );
  return applyRankingExecutionPolicy(
    world,
    policy,
    baseline.effectInputs,
    baseline.activationRequirements,
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
      isSpecialAttack(control.projection) && contributesToAttackerDamage(control.projection),
  );
  const candidates =
    conditions.specialAttack === 'active'
      ? createRankingWorldCandidates(servant, master, canonical, specialControls)
      : [];
  const targetWorlds = candidates.length > 0 ? candidates : [null];
  const fieldWorlds = createRankingFieldCandidates(
    baseline.effectControls,
    conditions.field === 'active',
  );
  const worlds: RankingWorld[] = targetWorlds.flatMap((target) =>
    fieldWorlds.flatMap((field) => {
      const selected = selectedKeysForScope(
        baseline.effectControls,
        conditions,
        'ranking',
        target,
        master,
      );
      return createRankingChoiceCandidates(baseline.effectControls, selected).map((choices) => ({
        target,
        field,
        choices,
      }));
    }),
  );
  const rankingScenarios = worlds.map((candidate) =>
    scenarioForPolicy(servant, canonical, baseline, conditions, 'ranking', candidate, master),
  );
  const hasArea = baseline.effectControls.some((control) =>
    contributesAreaSupport(control.projection),
  );
  const withoutAreaScenarios =
    conditions.selfBuffs === 'included' && hasArea
      ? worlds.map((candidate) =>
          scenarioForPolicy(
            servant,
            canonical,
            baseline,
            conditions,
            'withoutArea',
            candidate,
            master,
          ),
        )
      : [];
  return {
    baseScenario: canonical,
    baseline,
    rankingScenarios,
    withoutAreaScenarios,
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
        rankingExternalFieldFactCount(left.execution) -
          rankingExternalFieldFactCount(right.execution) ||
        rankingActivationFactCount(left.execution) - rankingActivationFactCount(right.execution) ||
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
  const executions = executeRankingScenarios(plan.rankingScenarios, master, versions);
  return executions[selectRankingExecutionIndex(executions, conditions.npLevel)]!
    .scenario as ResolvedScenario;
}
