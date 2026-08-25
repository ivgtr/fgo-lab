import { applyNpDamageHandler, calculateDamageResolution } from '@fgo-lab/calculation-application';
import { classAttackRate } from '@fgo-lab/calc-core';
import {
  resolveAttackerSkills,
  resolveCraftEssenceEffects,
  resolveMysticCodeSkills,
  resolveNpEffects,
  resolveServantPassives,
  resolveSupportComposition,
  type ResolvedSupportEffect,
  type ResolvedEffectSet,
} from '@fgo-lab/effect-resolver';
import {
  deriveNpMultipliers,
  getPrimaryNoblePhantasm,
  getPrimaryNpDamage,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type {
  AttackerSkillSelection,
  DamageResolutionInput,
  CalculationEditorState,
  ServantBuild,
  CalculationResult,
  CalculationScenario,
  VersionContext,
} from '@fgo-lab/schema';

export interface ResolvedCalculationInput {
  input: DamageResolutionInput;
  precision: ResolvedEffectSet['precision'];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: ResolvedSupportEffect[];
}

function traitCounts(traits: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const trait of traits) counts[trait] = (counts[trait] ?? 0) + 1;
  return counts;
}

function applyDamageFunction(
  input: DamageResolutionInput,
  damage: Parameters<typeof applyNpDamageHandler>[1],
  attackerTraits: readonly string[],
): DamageResolutionInput {
  return applyNpDamageHandler(input, damage, {
    overcharge: input.overcharge,
    attackerTraitCounts: traitCounts(attackerTraits),
    targetTraitCounts: traitCounts(input.target.traits),
    targetStateTraitCounts: traitCounts(input.targetStateTraits),
    attackerHpPermille: input.attackerHpPermille,
    targetRarity: input.targetRarity,
    battlePointPhase: input.battlePointPhase,
  });
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
      warnings: [],
      trace: [{ step: 'input-mode', detail: 'manual_final_values' }],
      effects: [],
    };
  const attacker = master.servants.find((candidate) => candidate.id === baseInput.attackerId);
  const damage = attacker ? getPrimaryNpDamage(attacker) : undefined;
  const damageInput =
    attacker && damage ? applyDamageFunction(baseInput, damage, attacker.traits) : baseInput;
  const craftEssence = selection.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === selection.craftEssence?.craftEssenceId,
      )
    : undefined;
  const resolveOptions = { effectOverrides: selection.effectOverrides ?? {} };
  const passive = resolveServantPassives(damageInput, attacker, resolveOptions);
  const craftEssenceResolution = resolveCraftEssenceEffects(
    passive.input,
    craftEssence,
    selection.craftEssence?.limitBreak ?? 0,
    attacker?.traits ?? [],
    resolveOptions,
  );
  const attackerSkills = resolveAttackerSkills(
    craftEssenceResolution.input,
    selection.attackerSkills ?? [],
    master.servants,
    { ...resolveOptions, defaultEnabled: false },
  );
  const mysticCode = selection.mysticCode
    ? resolveMysticCodeSkills(
        attackerSkills.input,
        master.mysticCodes.find((candidate) => candidate.id === selection.mysticCode?.mysticCodeId),
        selection.mysticCode.skills,
        attacker?.traits ?? [],
        { ...resolveOptions, defaultEnabled: false },
      )
    : undefined;
  const support = selection.support
    ? resolveSupportComposition(
        mysticCode?.input ?? attackerSkills.input,
        selection.support.composition,
        master.servants,
        {},
      )
    : undefined;
  const np = resolveNpEffects(
    support?.input ?? mysticCode?.input ?? attackerSkills.input,
    attacker,
    resolveOptions,
  );
  const resolutions: [string, ResolvedEffectSet][] = [
    ['passive-effect', passive],
    ['craft-essence-effect', craftEssenceResolution],
    ['attacker-effect', attackerSkills],
  ];
  if (mysticCode) resolutions.push(['mystic-code-effect', mysticCode]);
  if (support) resolutions.push(['support-effect', support]);
  resolutions.push(['np-effect', np]);
  const npDamageBuffRate = Math.max(
    0,
    ...resolutions.map(([, resolution]) => resolution.npDamageBuffRate),
  );
  const resolvedInput =
    npDamageBuffRate > 0
      ? {
          ...np.input,
          npDamageBuff: np.input.npDamageBuff * (1 + npDamageBuffRate),
        }
      : np.input;
  return {
    input: resolvedInput,
    precision: resolutions.some(([, resolution]) => resolution.precision === 'unsupported')
      ? 'unsupported'
      : resolutions.some(([, resolution]) => resolution.precision === 'approximate')
        ? 'approximate'
        : 'exact',
    warnings: resolutions.flatMap(([, resolution]) => resolution.warnings),
    effects: resolutions.flatMap(([, resolution]) => resolution.effects),
    trace: resolutions.flatMap(([traceStep, resolution]) =>
      resolution.effects.map((effect) => ({
        step: traceStep,
        detail: `${effect.sourceId}:${effect.skillId}:${effect.effectId}:${effect.reason}`,
      })),
    ),
  };
}

export function calculateResolvedDamage(
  baseInput: DamageResolutionInput,
  selection: CalculationEditorState,
  master: MasterDataSnapshot,
  versions: VersionContext,
  options: { releaseValidated: boolean },
) {
  const resolved = resolveCalculationInput(baseInput, selection, master);
  const calculation = calculateDamageResolution(resolved.input, versions);
  const effects = resolved.effects.map((effect) => ({
    effectKey: effect.effectKey,
    state: effect.calculationSupported
      ? effect.applied
        ? ('applied' as const)
        : ('rejected' as const)
      : ('unsupported' as const),
    reasonCode: effect.reason,
  }));
  const resolutionIssues = resolved.warnings.map((warning) => ({ code: warning, detail: warning }));
  let result: CalculationResult;
  if (calculation.status === 'unsupported' || resolved.precision === 'unsupported')
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
      ],
      versions,
    };
  else
    result = {
      ...calculation,
      effects,
      precision:
        resolved.precision === 'approximate' || calculation.precision === 'approximate'
          ? 'approximate'
          : 'exact',
      issues: [...calculation.issues, ...resolutionIssues],
      trace: [...calculation.trace, ...resolved.trace],
    };
  if (!options.releaseValidated && result.status === 'calculated')
    result = {
      ...result,
      precision: 'approximate',
      issues: [
        ...result.issues,
        {
          code: 'diagnostic_fixture_not_release_validated',
          detail: 'diagnostic_fixture_not_release_validated',
        },
      ],
    };
  return {
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result,
  };
}

export function createDefaultDamageResolutionInput(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): DamageResolutionInput {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  return applyDamageFunction(
    {
      attackerId: servant.id,
      attackerLevel: build?.level ?? 90,
      attackerAtk: servant.atkByLevel[String(build?.level ?? 90)] ?? servant.atkByLevel['90'] ?? 0,
      fouAtk: build?.fouAtk ?? 1000,
      craftEssenceId: null,
      craftEssenceAtk: 0,
      npLevel: Math.max(1, build?.npLevel ?? 1),
      overcharge: 1,
      npMultipliers: deriveNpMultipliers(damage, 1),
      damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
      cardType: noblePhantasm.card,
      classAttackRate: classAttackRate(servant.classId),
      classAffinity: 2,
      attributeAffinity: 1,
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
      attackerHpPermille: null,
      targetRarity: null,
      targetStateTraits: [],
      battlePointPhase: null,
      target: { classId: 'affinity:2', attribute: 'unknown', traits: [] },
    },
    damage,
    servant.traits,
  );
}

export function scenarioFromDamageResolutionInput(
  input: DamageResolutionInput,
  selection: CalculationEditorState,
): CalculationScenario {
  const base = {
    attacker: {
      servantId: input.attackerId,
      source: selection.attackerSource,
      level: input.attackerLevel,
      npLevel: input.npLevel,
      fouAtk: input.fouAtk,
    },
    overcharge: input.overcharge,
    target: {
      classId: input.target.classId,
      attribute: input.target.attribute,
      traits: input.target.traits,
      stateTraits: input.targetStateTraits,
      rarity: input.targetRarity,
    },
    attackerHpPermille: input.attackerHpPermille,
    fieldTraits: input.fieldTraits,
    battleState: { battlePointPhase: input.battlePointPhase },
    assumptions: {
      classAffinity: input.classAffinity,
      attributeAffinity: input.attributeAffinity,
    },
  };
  if (selection.effectMode === 'manual') return { ...base, mode: 'manual', manual: input };
  const manualOverrides = new Set(selection.manualOverrides ?? []);
  return {
    ...base,
    mode: 'resolved',
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
    explicitOverrides: {
      ...(manualOverrides.has('attackerAtk') ? { attackerAtk: input.attackerAtk } : {}),
      ...(manualOverrides.has('fouAtk') ? { fouAtk: input.fouAtk } : {}),
      ...(manualOverrides.has('craftEssenceAtk') ? { craftEssenceAtk: input.craftEssenceAtk } : {}),
      ...(manualOverrides.has('classAttackRate') ? { classAttackRate: input.classAttackRate } : {}),
    },
  };
}

export function selectionFromScenario(scenario: CalculationScenario): CalculationEditorState {
  if (scenario.mode === 'manual')
    return { attackerSource: scenario.attacker.source, effectMode: 'manual', craftEssence: null };
  return {
    attackerSource: scenario.attacker.source,
    effectMode: 'resolved',
    attackerSkills: scenario.attackerSkills,
    mysticCode: scenario.mysticCode,
    effectOverrides: scenario.effectDecisions,
    support: scenario.support,
    manualOverrides: Object.keys(scenario.explicitOverrides) as NonNullable<
      CalculationEditorState['manualOverrides']
    >,
    craftEssence: scenario.craftEssence
      ? { ...scenario.craftEssence, source: 'master', copyId: null }
      : null,
  };
}

export function damageResolutionInputFromScenario(
  scenario: CalculationScenario,
  master: MasterDataSnapshot,
): DamageResolutionInput {
  if (scenario.mode === 'manual') return scenario.manual;
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const damage = getPrimaryNpDamage(servant);
  if (!damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const base = createDefaultDamageResolutionInput(master, undefined, servant);
  return applyDamageFunction(
    {
      ...base,
      attackerLevel: scenario.attacker.level,
      attackerAtk:
        scenario.explicitOverrides.attackerAtk ??
        servant.atkByLevel[String(scenario.attacker.level)] ??
        0,
      fouAtk: scenario.explicitOverrides.fouAtk ?? scenario.attacker.fouAtk,
      craftEssenceAtk: scenario.explicitOverrides.craftEssenceAtk ?? 0,
      npLevel: scenario.attacker.npLevel,
      overcharge: scenario.overcharge,
      npMultipliers: deriveNpMultipliers(damage, scenario.overcharge),
      classAttackRate: scenario.explicitOverrides.classAttackRate ?? base.classAttackRate,
      classAffinity: scenario.assumptions.classAffinity,
      attributeAffinity: scenario.assumptions.attributeAffinity,
      fieldTraits: scenario.fieldTraits,
      target: {
        classId: scenario.target.classId,
        attribute: scenario.target.attribute,
        traits: scenario.target.traits,
      },
      attackerHpPermille: scenario.attackerHpPermille,
      targetRarity: scenario.target.rarity,
      targetStateTraits: scenario.target.stateTraits,
      battlePointPhase: scenario.battleState.battlePointPhase,
    },
    damage,
    servant.traits,
  );
}

export function completeCalculationEditorState(
  selection: CalculationEditorState | undefined,
  servant: ServantMaster | undefined,
  build: ServantBuild | undefined,
): CalculationEditorState {
  const base =
    selection ??
    ({
      attackerSource: build?.npLevel ? 'owned' : 'master',
      effectMode: 'resolved',
      craftEssence: null,
    } satisfies CalculationEditorState);
  const attackerSkills =
    base.attackerSkills ?? createAttackerSkillSelection(servant, base.attackerSource, build);
  return { ...base, attackerSkills };
}

export function createAttackerSkillSelection(
  servant: ServantMaster | undefined,
  source: CalculationEditorState['attackerSource'],
  build: ServantBuild | undefined,
): AttackerSkillSelection[] {
  return (servant?.skills ?? []).slice(0, 3).map((skill, index) => ({
    skillId: skill.id,
    skillLevel: source === 'owned' ? (build?.skills[String(index + 1)] ?? 1) : 10,
  }));
}

export function selectCalculationAttacker(
  input: DamageResolutionInput,
  selection: CalculationEditorState,
  servant: ServantMaster,
  source: CalculationEditorState['attackerSource'],
  build: ServantBuild | undefined,
): { input: DamageResolutionInput; selection: CalculationEditorState } {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const manualOverrides = new Set(selection.manualOverrides ?? []);
  const level = build?.level ?? 90;
  const nextInput = applyDamageFunction(
    {
      ...input,
      attackerId: servant.id,
      attackerLevel: level,
      attackerAtk: manualOverrides.has('attackerAtk')
        ? input.attackerAtk
        : (servant.atkByLevel[String(level)] ?? servant.atkByLevel['90'] ?? input.attackerAtk),
      fouAtk: manualOverrides.has('fouAtk') ? input.fouAtk : (build?.fouAtk ?? 1000),
      npLevel: Math.max(1, build?.npLevel ?? 1),
      npMultipliers: deriveNpMultipliers(damage, input.overcharge),
      damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
      cardType: noblePhantasm.card,
      classAttackRate: manualOverrides.has('classAttackRate')
        ? input.classAttackRate
        : classAttackRate(servant.classId),
    },
    damage,
    servant.traits,
  );
  return {
    input: nextInput,
    selection: {
      ...selection,
      attackerSource: source,
      attackerSkills: createAttackerSkillSelection(servant, source, build),
      effectOverrides: {},
    },
  };
}

export function setCalculationEffectMode(
  input: DamageResolutionInput,
  selection: CalculationEditorState,
  effectMode: CalculationEditorState['effectMode'],
): { input: DamageResolutionInput; selection: CalculationEditorState } {
  if (effectMode === 'manual') return { input, selection: { ...selection, effectMode } };
  return {
    input: {
      ...input,
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
    },
    selection: { ...selection, effectMode },
  };
}
