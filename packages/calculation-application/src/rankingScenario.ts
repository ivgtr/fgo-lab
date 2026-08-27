import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import {
  naturalServantLevel,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario, ServantBuild, VersionContext } from '@fgo-lab/schema';
import { applyCanonicalInputCommand } from './canonicalInputs';
import { applyEffectControlPresentationDecision } from './effectDecision';
import type { EffectControlViewModel } from './effectControls';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import { STANDARD_RANKING_SCENARIO_POLICY } from './rankingContracts';
import {
  calculateScenario,
  createDefaultResolvedScenario,
  type CalculationExecution,
} from './scenario';
import { applyTargetContextCommand, createDefaultTargetContext } from './targetContext';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;
const MAX_SPECIAL_ATTACK_SCENARIOS = 4_096;

function ownedBuild(
  servant: ServantMaster,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ServantBuild | undefined {
  const build = profile.servantBuilds[servant.id];
  if (conditions.comparisonMode === 'owned' && (!build || build.npLevel === 0))
    throw new TypeError(`ranking_owned_build_missing:${servant.id}`);
  return build;
}

function baseScenario(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
): ResolvedScenario {
  const build = ownedBuild(servant, profile, conditions);
  const owned = conditions.comparisonMode === 'owned';
  const scenario = createDefaultResolvedScenario(master, owned ? build : undefined, servant);
  let targetContext = createDefaultTargetContext(servant.classId);
  targetContext = applyTargetContextCommand(targetContext, {
    kind: 'setClassRelation',
    relation:
      conditions.classAffinity === 'favorable'
        ? defaultTargetClassRelation(servant.classId)
        : 'neutral',
  });
  targetContext = applyTargetContextCommand(targetContext, {
    kind: 'setAttributeRelation',
    relation: STANDARD_RANKING_SCENARIO_POLICY.attributeRelation,
  });
  return {
    ...scenario,
    attacker: {
      servantId: servant.id,
      source: owned ? 'owned' : 'master',
      level: owned ? build!.level : naturalServantLevel(servant.rarity),
      npLevel: owned ? build!.npLevel : conditions.npLevel,
      fouAtk: owned ? build!.fouAtk : STANDARD_RANKING_SCENARIO_POLICY.fouAtk,
    },
    overcharge: STANDARD_RANKING_SCENARIO_POLICY.overcharge,
    targetContext,
    attackerHpPermille: STANDARD_RANKING_SCENARIO_POLICY.attackerHpPermille,
    battleState: { battlePointPhase: STANDARD_RANKING_SCENARIO_POLICY.battlePointPhase },
    craftEssence: null,
    attackerSkills: servant.skills.slice(0, 3).map((skill, index) => ({
      skillId: skill.id,
      skillLevel: owned
        ? (build!.skills[String(index + 1)] ?? 1)
        : STANDARD_RANKING_SCENARIO_POLICY.skillLevel,
    })),
    mysticCode: null,
    support: null,
    worldFactAssertions: [],
    canonicalInputValues: {},
  };
}

function isSelfEffect(control: EffectControlViewModel): boolean {
  return (
    control.projection.source.origin === 'attacker' ||
    control.projection.source.origin === 'passive' ||
    control.projection.source.origin === 'np'
  );
}

function isSpecialAttack(control: EffectControlViewModel): boolean {
  return control.projection.modifier === 'powerMod' || control.projection.modifier === 'npSpecial';
}

function applyControl(
  scenario: ResolvedScenario,
  calculation: CalculationExecution,
  control: EffectControlViewModel,
  enabled: boolean,
): ResolvedScenario {
  return applyEffectControlPresentationDecision(
    scenario,
    control,
    enabled,
    calculation.effects,
    calculation.effectInputs,
  );
}

function applySelfEffects(
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
  included: boolean,
): ResolvedScenario {
  let next = scenario;
  let calculation = calculateScenario(next, master, versions);
  for (const initialControl of calculation.effectControls) {
    if (!isSelfEffect(initialControl) || isSpecialAttack(initialControl)) continue;
    calculation = calculateScenario(next, master, versions);
    const control = calculation.effectControls.find(({ key }) => key === initialControl.key);
    if (!control || control.interaction === 'none') continue;
    next = applyControl(next, calculation, control, included);
  }
  return next;
}

function applyCanonicalMinimums(
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
): ResolvedScenario {
  const calculation = calculateScenario(scenario, master, versions);
  return calculation.inputDefinitions.reduce(
    (current, definition) =>
      applyCanonicalInputCommand(current, {
        kind: 'setCanonicalIntegerInput',
        key: definition.key,
        value: definition.kind === 'procSuccessCount' ? definition.maximum : definition.minimum,
      }),
    scenario,
  );
}

function excludeSpecialAttacks(
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
): ResolvedScenario {
  let next = scenario;
  let calculation = calculateScenario(next, master, versions);
  for (const initialControl of calculation.effectControls) {
    if (
      !isSpecialAttack(initialControl) ||
      initialControl.interaction === 'none' ||
      initialControl.projection.outcome !== 'applied'
    )
      continue;
    calculation = calculateScenario(next, master, versions);
    const control = calculation.effectControls.find(({ key }) => key === initialControl.key);
    if (control) next = applyControl(next, calculation, control, false);
  }
  return next;
}

function selectedAverage(execution: CalculationExecution): number | null {
  if (execution.result.status !== 'calculated' || execution.scenario.mode !== 'resolved')
    return null;
  return execution.result.rows[execution.scenario.attacker.npLevel - 1]?.average ?? null;
}

function maximizeSpecialAttacks(
  inactiveScenario: ResolvedScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
): ResolvedScenario {
  const initial = calculateScenario(inactiveScenario, master, versions);
  const keys = initial.effectControls.filter(isSpecialAttack).map(({ key }) => key);
  let candidates = [inactiveScenario];
  for (const key of keys) {
    const branched = candidates.flatMap((candidate) => {
      const calculation = calculateScenario(candidate, master, versions);
      const control = calculation.effectControls.find((item) => item.key === key);
      if (!control || control.interaction === 'none') return [candidate];
      const enabled = applyControl(candidate, calculation, control, true);
      const enabledResult = calculateScenario(enabled, master, versions);
      return enabledResult.result.status === 'calculated' ? [candidate, enabled] : [candidate];
    });
    if (branched.length > MAX_SPECIAL_ATTACK_SCENARIOS)
      throw new RangeError(`ranking_special_attack_search_limit:${branched.length}`);
    candidates = [
      ...new Map(branched.map((candidate) => [JSON.stringify(candidate), candidate])).values(),
    ];
  }
  return (
    candidates
      .flatMap((scenario) => {
        const execution = calculateScenario(scenario, master, versions);
        const average = selectedAverage(execution);
        return average === null ? [] : [{ scenario, average }];
      })
      .sort(
        (left, right) =>
          right.average - left.average ||
          JSON.stringify(left.scenario).localeCompare(JSON.stringify(right.scenario)),
      )[0]?.scenario ?? inactiveScenario
  );
}

export function createRankingScenarioFromPolicy(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): ResolvedScenario {
  let scenario = baseScenario(servant, master, profile, conditions);
  scenario = applySelfEffects(scenario, master, versions, conditions.selfBuffs === 'included');
  scenario = applyCanonicalMinimums(scenario, master, versions);
  const inactive = excludeSpecialAttacks(scenario, master, versions);
  return conditions.specialAttack === 'active'
    ? maximizeSpecialAttacks(inactive, master, versions)
    : inactive;
}
