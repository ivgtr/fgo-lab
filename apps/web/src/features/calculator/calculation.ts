import { calculateNpDamage, classAttackRate } from '@fgo-lab/calc-core';
import {
  resolveAttackerSkills,
  resolveCraftEssenceEffects,
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
  CalcInput,
  CalculationSelection,
  CalculationShareSnapshot,
  ServantBuild,
  VersionContext,
} from '@fgo-lab/schema';

export interface ResolvedCalculationInput {
  input: CalcInput;
  precision: ResolvedEffectSet['precision'];
  warnings: string[];
  trace: { step: string; detail: string }[];
  effects: ResolvedSupportEffect[];
}

export function resolveCalculationInput(
  baseInput: CalcInput,
  selection: CalculationSelection,
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
  const craftEssence = selection.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === selection.craftEssence?.craftEssenceId,
      )
    : undefined;
  const resolveOptions = { effectOverrides: selection.effectOverrides ?? {} };
  const passive = resolveServantPassives(baseInput, attacker, resolveOptions);
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
  const support = selection.support
    ? resolveSupportComposition(
        attackerSkills.input,
        selection.support.composition,
        master.servants,
        {},
      )
    : undefined;
  const np = resolveNpEffects(support?.input ?? attackerSkills.input, attacker, resolveOptions);
  const resolutions: [string, ResolvedEffectSet][] = [
    ['passive-effect', passive],
    ['craft-essence-effect', craftEssenceResolution],
    ['attacker-effect', attackerSkills],
  ];
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
  baseInput: CalcInput,
  selection: CalculationSelection,
  master: MasterDataSnapshot,
  versions: VersionContext,
  options: { releaseValidated: boolean },
) {
  const resolved = resolveCalculationInput(baseInput, selection, master);
  const calculation = calculateNpDamage(resolved.input, versions);
  const result = {
    ...calculation,
    precision:
      resolved.precision === 'unsupported'
        ? ('unsupported' as const)
        : resolved.precision === 'approximate' || calculation.precision === 'approximate'
          ? ('approximate' as const)
          : calculation.precision,
    warnings: [...calculation.warnings, ...resolved.warnings],
    trace: [...calculation.trace, ...resolved.trace],
  };
  return {
    input: resolved.input,
    effects: resolved.effects,
    effectWarnings: resolved.warnings,
    result: options.releaseValidated
      ? result
      : {
          ...result,
          precision:
            result.precision === 'unsupported' ? result.precision : ('approximate' as const),
          warnings: [...new Set([...result.warnings, 'diagnostic_fixture_not_release_validated'])],
        },
  };
}

export function createDefaultCalcInput(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): CalcInput {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  return {
    attackerId: servant.id,
    attackerLevel: build?.level ?? 90,
    attackerAtk: servant.atkByLevel[String(build?.level ?? 90)] ?? servant.atkByLevel['90'] ?? 0,
    fouAtk: build?.fouAtk ?? 1000,
    craftEssenceId: null,
    craftEssenceAtk: 0,
    npLevel: Math.max(1, build?.npLevel ?? 1),
    overcharge: 1,
    npMultipliers: deriveNpMultipliers(damage, 1),
    attackNpFunctionType: damage.rawFunctionType,
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
    target: { classId: 'affinity:2', attribute: 'unknown', traits: [] },
  };
}

export function completeCalculationSelection(
  selection: CalculationSelection | undefined,
  servant: ServantMaster | undefined,
  build: ServantBuild | undefined,
): CalculationSelection {
  const base =
    selection ??
    ({
      attackerSource: build?.npLevel ? 'owned' : 'master',
      effectMode: 'resolved',
      craftEssence: null,
    } satisfies CalculationSelection);
  const attackerSkills =
    base.attackerSkills ?? createAttackerSkillSelection(servant, base.attackerSource, build);
  return { ...base, attackerSkills };
}

export function createAttackerSkillSelection(
  servant: ServantMaster | undefined,
  source: CalculationSelection['attackerSource'],
  build: ServantBuild | undefined,
): AttackerSkillSelection[] {
  return (servant?.skills ?? []).slice(0, 3).map((skill, index) => ({
    skillId: skill.id,
    skillLevel: source === 'owned' ? (build?.skills[String(index + 1)] ?? 1) : 10,
  }));
}

export function selectCalculationAttacker(
  input: CalcInput,
  selection: CalculationSelection,
  servant: ServantMaster,
  source: CalculationSelection['attackerSource'],
  build: ServantBuild | undefined,
): { input: CalcInput; selection: CalculationSelection } {
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  const damage = getPrimaryNpDamage(servant);
  if (!noblePhantasm || !damage) throw new TypeError(`attack_np_missing:${servant.id}`);
  const manualOverrides = new Set(selection.manualOverrides ?? []);
  const level = build?.level ?? 90;
  return {
    input: {
      ...input,
      attackerId: servant.id,
      attackerLevel: level,
      attackerAtk: manualOverrides.has('attackerAtk')
        ? input.attackerAtk
        : (servant.atkByLevel[String(level)] ?? servant.atkByLevel['90'] ?? input.attackerAtk),
      fouAtk: manualOverrides.has('fouAtk') ? input.fouAtk : (build?.fouAtk ?? 1000),
      npLevel: Math.max(1, build?.npLevel ?? 1),
      npMultipliers: deriveNpMultipliers(damage, input.overcharge),
      attackNpFunctionType: damage.rawFunctionType,
      cardType: noblePhantasm.card,
      classAttackRate: manualOverrides.has('classAttackRate')
        ? input.classAttackRate
        : classAttackRate(servant.classId),
    },
    selection: {
      ...selection,
      attackerSource: source,
      attackerSkills: createAttackerSkillSelection(servant, source, build),
      effectOverrides: {},
    },
  };
}

export function setCalculationEffectMode(
  input: CalcInput,
  selection: CalculationSelection,
  effectMode: CalculationSelection['effectMode'],
): { input: CalcInput; selection: CalculationSelection } {
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

export function selectionFromShare(shared: CalculationShareSnapshot): CalculationSelection {
  const craftEssence = shared.composition?.craftEssence;
  return {
    attackerSource: 'master',
    effectMode: 'manual',
    craftEssence: craftEssence ? { ...craftEssence, source: 'master', copyId: null } : null,
  };
}
