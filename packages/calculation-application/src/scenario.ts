import {
  resolveScenarioEffects,
  type EffectResolution,
  type ResolvedEffect,
} from '@fgo-lab/effect-resolver';
import { classAttackRate } from '@fgo-lab/calc-core';
import {
  deriveCraftEssenceAtk,
  deriveNpMultipliers,
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  type MasterDataSnapshot,
  type NpDamageSpec,
  type ServantMaster,
  type TraitCondition,
} from '@fgo-lab/master-data';
import type {
  CalculationResult,
  CalculationScenario,
  DamageResolutionInput,
  ServantBuild,
  VersionContext,
} from '@fgo-lab/schema';
import { calculateDamageResolution } from './damageResolution';
import { evaluateCalculationEvidence } from './evidence';
import { applyNpDamageHandler } from './npDamageHandler';

export interface ResolvedCalculationInput {
  input: DamageResolutionInput;
  precision: EffectResolution['precision'];
  evidenceKeys: string[];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: ResolvedEffect[];
}

export interface CalculationExecution {
  scenario: CalculationScenario;
  scenarioInput: DamageResolutionInput;
  input: DamageResolutionInput;
  effects: ResolvedEffect[];
  effectWarnings: string[];
  result: CalculationResult;
}

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

interface NpConditionControl {
  effectKey: string;
  effectId: string;
  label: string;
  condition: TraitCondition;
  value: number;
  targetTraits: readonly string[];
  targetStateTraits: readonly string[];
  targetRarity: number | null;
}

function traitCounts(traits: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const trait of traits) counts[trait] = (counts[trait] ?? 0) + 1;
  return counts;
}

export function applyScenarioNpDamageFunction(
  input: DamageResolutionInput,
  damage: Parameters<typeof applyNpDamageHandler>[1],
  attackerTraits: readonly string[],
): DamageResolutionInput {
  return applyNpDamageHandler(input, damage, {
    overcharge: input.overcharge,
    attackerTraitCounts: traitCounts([...attackerTraits, ...input.attackerStateTraits]),
    targetTraitCounts: traitCounts(input.target.traits),
    targetCombinedTraitCounts: traitCounts([...input.target.traits, ...input.targetStateTraits]),
    targetStateTraitCounts: traitCounts(input.targetStateTraits),
    attackerHpPermille: input.attackerHpPermille,
    targetRarity: input.targetRarity,
    battlePointPhase: input.battlePointPhase,
  });
}

function npConditionControls(
  attacker: ServantMaster,
  damage: NpDamageSpec,
  input: DamageResolutionInput,
): NpConditionControl[] {
  const parameter = damage.parametersByOvercharge[input.overcharge - 1]?.[input.npLevel - 1];
  if (!parameter) return [];
  const makeControl = (
    suffix: string,
    label: string,
    condition: TraitCondition,
    value: number,
    patch: Pick<NpConditionControl, 'targetTraits' | 'targetStateTraits' | 'targetRarity'>,
  ): NpConditionControl => ({
    effectKey: `np-special:${attacker.id}:${damage.functionId}:${suffix}`,
    effectId: `np-special:${damage.functionId}:${suffix}`,
    label,
    condition,
    value,
    ...patch,
  });
  const multiplier = (parameter.correctionPermille ?? 1_000) / 1_000;
  if (damage.kind === 'trait' && parameter.targetTrait)
    return [
      makeControl(
        `trait:${parameter.targetTrait.name}`,
        '特攻宝具',
        { operator: 'all', traits: [{ name: parameter.targetTrait.name, negative: false }] },
        multiplier,
        { targetTraits: [parameter.targetTrait.name], targetStateTraits: [], targetRarity: null },
      ),
    ];
  if (damage.kind === 'stateTrait' && parameter.targetTrait)
    return [
      makeControl(
        `state-trait:${parameter.targetTrait.name}`,
        '特攻宝具',
        { operator: 'all', traits: [{ name: parameter.targetTrait.name, negative: false }] },
        multiplier,
        { targetTraits: [], targetStateTraits: [parameter.targetTrait.name], targetRarity: null },
      ),
    ];
  if (damage.kind === 'traitExpression' && parameter.andCheckTraits?.length)
    return [
      makeControl(
        `trait-expression:${parameter.andCheckTraits.map((trait) => trait.name).join('+')}`,
        '特攻宝具',
        {
          operator: 'all',
          traits: parameter.andCheckTraits.map((trait) => ({ name: trait.name, negative: false })),
        },
        multiplier,
        {
          targetTraits: parameter.andCheckTraits.map((trait) => trait.name),
          targetStateTraits: [],
          targetRarity: null,
        },
      ),
    ];
  if (damage.kind === 'targetRarity' && parameter.targetRarities?.length)
    return [
      makeControl(
        `rarity:${parameter.targetRarities.join('+')}`,
        'レアリティ特攻宝具',
        {
          operator: 'any',
          traits: parameter.targetRarities.map((rarity) => ({
            name: `rarity${String(rarity)}`,
            negative: false,
          })),
        },
        multiplier,
        { targetTraits: [], targetStateTraits: [], targetRarity: parameter.targetRarities[0]! },
      ),
    ];
  if (damage.kind === 'traitCount' && parameter.targetId === 1)
    return (parameter.targetTraits ?? []).map((trait) =>
      makeControl(
        `trait-count:${trait.name}`,
        '特攻宝具・対象特性数',
        { operator: 'all', traits: [{ name: trait.name, negative: false }] },
        1 + (parameter.correctionPermille ?? 0) / 1_000,
        { targetTraits: [trait.name], targetStateTraits: [], targetRarity: null },
      ),
    );
  return [];
}

function resolveScenarioNpDamage(
  input: DamageResolutionInput,
  damage: NpDamageSpec,
  attacker: ServantMaster,
  decisions: Readonly<Record<string, boolean>>,
): { input: DamageResolutionInput; effects: ResolvedEffect[] } {
  const controls = npConditionControls(attacker, damage, input);
  const selected = controls.filter((control) => decisions[control.effectKey] === true);
  const targetTraits = selected.flatMap((control) => control.targetTraits);
  const targetStateTraits = selected.flatMap((control) => control.targetStateTraits);
  const targetRarity = selected.find((control) => control.targetRarity !== null)?.targetRarity ?? -1;
  const resolvedInput = applyNpDamageHandler(input, damage, {
    overcharge: input.overcharge,
    attackerTraitCounts: traitCounts(attacker.traits),
    targetTraitCounts: traitCounts(targetTraits),
    targetCombinedTraitCounts: traitCounts([...targetTraits, ...targetStateTraits]),
    targetStateTraitCounts: traitCounts(targetStateTraits),
    attackerHpPermille: input.attackerHpPermille,
    targetRarity,
    battlePointPhase: input.battlePointPhase,
  });
  return {
    input: resolvedInput,
    effects: controls.map((control, order) => {
      const active = decisions[control.effectKey] === true;
      return {
        order,
        effectKey: control.effectKey,
        sourceInstanceId: `np:${attacker.id}`,
        origin: 'np',
        sourceId: attacker.id,
        sourceName: attacker.name,
        skillId: `np:${attacker.id}`,
        skillName: '特攻宝具',
        effectId: control.effectId,
        label: control.label,
        value: control.value,
        valuePermille: Math.round(control.value * 1_000),
        kind: null,
        damageTraitCondition: { kind: 'npSpecial', condition: control.condition },
        requiredFieldTraits: [],
        damageRelevant: true,
        state: active ? 'applied' : 'rejected',
        reason: active ? 'np_special_condition_asserted' : 'calculation_effect_disabled',
      } satisfies ResolvedEffect;
    }),
  };
}

export function createDefaultResolvedScenario(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): ResolvedCalculationScenario {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const level = build?.level ?? 90;
  return {
    mode: 'resolved',
    attacker: {
      servantId: servant.id,
      source: build?.npLevel ? 'owned' : 'master',
      level,
      npLevel: Math.max(1, build?.npLevel ?? 1),
      fouAtk: build?.fouAtk ?? 1000,
    },
    overcharge: 1,
    target: {
      classId: 'affinity:2',
      attribute: 'unknown',
    },
    attackerHpPermille: null,
    battleState: { battlePointPhase: null },
    assumptions: { classAffinity: 2, attributeAffinity: 1 },
    craftEssence: null,
    attackerSkills: servant.skills.slice(0, 3).map((skill, index) => ({
      skillId: skill.id,
      skillLevel: build?.npLevel ? (build.skills[String(index + 1)] ?? 1) : 10,
    })),
    mysticCode: null,
    support: null,
    effectDecisions: {},
    explicitOverrides: {},
  };
}

function resolvedScenarioInput(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
): DamageResolutionInput {
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const craftEssence = scenario.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
      )
    : undefined;
  const input: DamageResolutionInput = {
    attackerId: servant.id,
    attackerLevel: scenario.attacker.level,
    attackerAtk:
      scenario.explicitOverrides.attackerAtk ??
      servant.atkByLevel[String(scenario.attacker.level)] ??
      0,
    fouAtk: scenario.explicitOverrides.fouAtk ?? scenario.attacker.fouAtk,
    craftEssenceId: scenario.craftEssence?.craftEssenceId ?? null,
    craftEssenceAtk:
      scenario.explicitOverrides.craftEssenceAtk ??
      (craftEssence && scenario.craftEssence
        ? deriveCraftEssenceAtk(
            craftEssence,
            scenario.craftEssence.level,
            scenario.craftEssence.limitBreak,
          )
        : 0),
    npLevel: scenario.attacker.npLevel,
    overcharge: scenario.overcharge,
    npMultipliers: deriveNpMultipliers(damage, scenario.overcharge),
    damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
    cardType: noblePhantasm.card,
    classAttackRate: scenario.explicitOverrides.classAttackRate ?? classAttackRate(servant.classId),
    classAffinity: scenario.assumptions.classAffinity,
    attributeAffinity: scenario.assumptions.attributeAffinity,
    attackBuff: 0,
    defenseBuff: 0,
    cardBuff: 0,
    cardResistance: 0,
    npDamageBuff: 0,
    npResistance: 0,
    powerMod: 0,
    eventDamageBuff: 0,
    npSpecialMultipliers: [1, 1, 1, 1, 1],
    specialDamageBuff: 0,
    specialResistance: 0,
    flatDamage: 0,
    damageCut: 0,
    fieldTraits: [],
    attackerStateTraits: [],
    attackerHpPermille: scenario.attackerHpPermille,
    targetRarity: null,
    targetStateTraits: [],
    battlePointPhase: scenario.battleState.battlePointPhase,
    target: {
      classId: scenario.target.classId,
      attribute: scenario.target.attribute,
      traits: [],
    },
  };
  return resolveScenarioNpDamage(input, damage, servant, scenario.effectDecisions).input;
}

export function resolveScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): ResolvedCalculationInput {
  if (scenario.mode === 'manual')
    return {
      input: scenario.manual,
      precision: 'exact',
      evidenceKeys: ['input:manual-final-modifiers'],
      warnings: [],
      trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
      effects: [],
    };
  const input = resolvedScenarioInput(scenario, master);
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId)!;
  const damage = getPrimaryNpDamage(servant)!;
  const npDamage = resolveScenarioNpDamage(input, damage, servant, scenario.effectDecisions);
  const resolved = resolveScenarioEffects(npDamage.input, scenario, master);
  const effects = [...npDamage.effects, ...resolved.effects];
  const effectEvidenceKeys = effects.flatMap((effect) => {
    if (effect.state !== 'applied') return [];
    if (effect.reason === 'np_damage_buff_rate') return ['effect-operation:npDamageBuffRate'];
    return effect.kind ? [`effect-operation:${effect.kind}`] : [];
  });
  return {
    input: resolved.input,
    precision: resolved.precision,
    evidenceKeys: ['master:normalized-v6', ...effectEvidenceKeys],
    warnings: resolved.warnings,
    effects,
    trace: [
      ...npDamage.effects.map((effect) => ({
        step: 'np-special-effect',
        detail: `${effect.effectKey}:${effect.reason}`,
      })),
      ...resolved.trace,
    ],
  };
}

function evaluateResolvedCalculation(
  scenario: CalculationScenario,
  scenarioInput: DamageResolutionInput,
  resolved: ResolvedCalculationInput,
  versions: VersionContext,
): CalculationExecution {
  const calculation = calculateDamageResolution(resolved.input, versions);
  const evidence = evaluateCalculationEvidence([
    ...calculation.evidence.map((entry) => entry.key),
    ...resolved.evidenceKeys,
  ]);
  const effects = resolved.effects.map((effect) => ({
    effectKey: effect.effectKey,
    state: effect.state,
    reasonCode: effect.reason,
  }));
  const resolutionIssues = resolved.warnings.map((warning) => ({ code: warning, detail: warning }));
  let result: CalculationResult;
  if (
    calculation.status === 'unsupported' ||
    resolved.precision === 'unsupported' ||
    evidence.status === 'unsupported'
  )
    result = {
      status: 'unsupported',
      rows: [],
      effects,
      assumptions: calculation.assumptions,
      issues: [...calculation.issues, ...resolutionIssues],
      trace: [...calculation.trace, ...resolved.trace],
      missingEvidence: [
        ...(calculation.status === 'unsupported' ? calculation.missingEvidence : []),
        ...resolved.warnings,
        ...(evidence.status === 'unsupported' ? evidence.missingEvidence : []),
      ],
      versions,
      evidence: evidence.evidence,
    };
  else
    result = {
      ...calculation,
      effects,
      precision: evidence.precision,
      evidence: evidence.evidence,
      issues: [...calculation.issues, ...resolutionIssues],
      trace: [...calculation.trace, ...resolved.trace],
    };
  return {
    scenario,
    scenarioInput,
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result,
  };
}

export function calculateScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
  versions: VersionContext,
): CalculationExecution {
  const scenarioInput =
    scenario.mode === 'manual' ? scenario.manual : resolvedScenarioInput(scenario, master);
  return evaluateResolvedCalculation(
    scenario,
    scenarioInput,
    resolveScenario(scenario, master),
    versions,
  );
}
