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
  type ServantMaster,
} from '@fgo-lab/master-data';
import type {
  CalculationEditorState,
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
  input: DamageResolutionInput;
  effects: ResolvedEffect[];
  effectWarnings: string[];
  result: CalculationResult;
}

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

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
      stateTraits: [],
    },
    overcharge: 1,
    target: {
      classId: 'affinity:2',
      attribute: 'unknown',
      traits: [],
      stateTraits: [],
      rarity: null,
    },
    attackerHpPermille: null,
    fieldTraits: [],
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
  const servant = master.servants.find(
    (candidate) => candidate.id === scenario.attacker.servantId,
  );
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const craftEssence = scenario.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
      )
    : undefined;
  if (scenario.craftEssence && !craftEssence)
    throw new TypeError(`scenario_craft_essence_missing:${scenario.craftEssence.craftEssenceId}`);
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
    classAttackRate:
      scenario.explicitOverrides.classAttackRate ?? classAttackRate(servant.classId),
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
    fieldTraits: scenario.fieldTraits,
    attackerStateTraits: scenario.attacker.stateTraits,
    attackerHpPermille: scenario.attackerHpPermille,
    targetRarity: scenario.target.rarity,
    targetStateTraits: scenario.target.stateTraits,
    battlePointPhase: scenario.battleState.battlePointPhase,
    target: {
      classId: scenario.target.classId,
      attribute: scenario.target.attribute,
      traits: scenario.target.traits,
    },
  };
  return applyScenarioNpDamageFunction(input, damage, servant.traits);
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
  const resolved = resolveScenarioEffects(input, scenario, master);
  const effectEvidenceKeys = resolved.effects.flatMap((effect) => {
    if (effect.state !== 'applied') return [];
    if (effect.reason === 'np_damage_buff_rate') return ['effect-operation:npDamageBuffRate'];
    return effect.kind ? [`effect-operation:${effect.kind}`] : [];
  });
  return {
    input: resolved.input,
    precision: resolved.precision,
    evidenceKeys: ['master:normalized-v6', ...effectEvidenceKeys],
    warnings: resolved.warnings,
    effects: resolved.effects,
    trace: resolved.trace,
  };
}

function evaluateResolvedCalculation(
  scenario: CalculationScenario,
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
  return evaluateResolvedCalculation(scenario, resolveScenario(scenario, master), versions);
}

export function resolveCalculationInput(
  baseInput: DamageResolutionInput,
  selection: CalculationEditorState,
  master: MasterDataSnapshot,
): ResolvedCalculationInput {
  if (selection.effectMode === 'manual')
    return {
      input: baseInput,
      precision: 'exact',
      evidenceKeys: ['input:manual-final-modifiers'],
      warnings: [],
      trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
      effects: [],
    };
  const attacker = master.servants.find((candidate) => candidate.id === baseInput.attackerId);
  const damage = attacker ? getPrimaryNpDamage(attacker) : undefined;
  const damageInput =
    attacker && damage
      ? applyScenarioNpDamageFunction(baseInput, damage, attacker.traits)
      : baseInput;
  const resolved = resolveScenarioEffects(
    damageInput,
    {
      mode: 'resolved',
      attacker: {
        servantId: baseInput.attackerId,
        source: selection.attackerSource,
        level: baseInput.attackerLevel,
        npLevel: baseInput.npLevel,
        fouAtk: baseInput.fouAtk,
        stateTraits: baseInput.attackerStateTraits,
      },
      overcharge: baseInput.overcharge,
      target: {
        classId: baseInput.target.classId,
        attribute: baseInput.target.attribute,
        traits: baseInput.target.traits,
        stateTraits: baseInput.targetStateTraits,
        rarity: baseInput.targetRarity,
      },
      attackerHpPermille: baseInput.attackerHpPermille,
      fieldTraits: baseInput.fieldTraits,
      battleState: { battlePointPhase: baseInput.battlePointPhase },
      assumptions: {
        classAffinity: baseInput.classAffinity,
        attributeAffinity: baseInput.attributeAffinity,
      },
      craftEssence: selection.craftEssence
        ? {
            craftEssenceId: selection.craftEssence.craftEssenceId,
            level: selection.craftEssence.level,
            limitBreak: selection.craftEssence.limitBreak,
          }
        : null,
      attackerSkills: selection.attackerSkills ?? [],
      mysticCode: selection.mysticCode ?? null,
      support: selection.support ?? null,
      effectDecisions: selection.effectOverrides ?? {},
      explicitOverrides: {},
    },
    master,
  );
  const effectEvidenceKeys = resolved.effects.flatMap((effect) => {
    if (effect.state !== 'applied') return [];
    if (effect.reason === 'np_damage_buff_rate') return ['effect-operation:npDamageBuffRate'];
    return effect.kind ? [`effect-operation:${effect.kind}`] : [];
  });
  return {
    input: resolved.input,
    precision: resolved.precision,
    evidenceKeys: ['master:normalized-v6', ...effectEvidenceKeys],
    warnings: resolved.warnings,
    effects: resolved.effects,
    trace: resolved.trace,
  };
}

export function calculateResolvedDamage(
  baseInput: DamageResolutionInput,
  selection: CalculationEditorState,
  master: MasterDataSnapshot,
  versions: VersionContext,
) {
  const resolved = resolveCalculationInput(baseInput, selection, master);
  return evaluateResolvedCalculation(
    {
      ...createDefaultResolvedScenario(master, undefined),
      mode: 'manual',
      manual: baseInput,
    },
    resolved,
    versions,
  );
}
