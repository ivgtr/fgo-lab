import { calculateNpDamage, classAttackRate } from '@fgo-lab/calc-core';
import {
  resolveAttackerSkills,
  resolveCraftEssenceEffects,
  resolveNpEffects,
  resolveServantPassives,
  resolveSupportTemplate,
  type ResolvedSupportTemplate,
} from '@fgo-lab/effect-resolver';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type {
  AttackerSkillSelection,
  CalcInput,
  CalculationSelection,
  CalculationShareSnapshot,
  ServantBuild,
  SupportTemplate,
  VersionContext,
} from '@fgo-lab/schema';

function includeResolution(
  result: ReturnType<typeof calculateNpDamage>,
  resolution: ResolvedSupportTemplate | undefined,
  traceStep: string,
) {
  if (!resolution) return result;
  return {
    ...result,
    precision:
      resolution.precision === 'unsupported'
        ? ('unsupported' as const)
        : resolution.precision === 'approximate' || result.precision === 'approximate'
          ? ('approximate' as const)
          : result.precision,
    warnings: [...result.warnings, ...resolution.warnings],
    trace: [
      ...result.trace,
      ...resolution.effects.map((effect) => ({
        step: traceStep,
        detail: `${effect.sourceId}:${effect.skillId}:${effect.effectId}:${effect.reason}`,
      })),
    ],
  };
}

export function calculateResolvedDamage(
  baseInput: CalcInput,
  selection: CalculationSelection,
  supportTemplate: SupportTemplate | undefined,
  master: MasterDataSnapshot,
  versions: VersionContext,
) {
  const attacker = master.servants.find((candidate) => candidate.id === baseInput.attackerId);
  const craftEssence = selection.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === selection.craftEssence?.craftEssenceId,
      )
    : undefined;
  const passive = resolveServantPassives(baseInput, attacker);
  const craftEssenceResolution = resolveCraftEssenceEffects(
    passive.input,
    craftEssence,
    selection.craftEssence?.limitBreak ?? 0,
    attacker?.traits ?? [],
  );
  const attackerSkills = resolveAttackerSkills(
    craftEssenceResolution.input,
    selection.attackerSkills ?? [],
    master.servants,
  );
  const support = supportTemplate
    ? resolveSupportTemplate(attackerSkills.input, supportTemplate, master.servants)
    : undefined;
  const np = resolveNpEffects(support?.input ?? attackerSkills.input, attacker);
  const resolutions = [
    ['passive-effect', passive],
    ['craft-essence-effect', craftEssenceResolution],
    ['attacker-effect', attackerSkills],
    ['support-effect', support],
    ['np-effect', np],
  ] as const;
  return {
    input: np.input,
    result: resolutions.reduce(
      (result, [traceStep, resolution]) => includeResolution(result, resolution, traceStep),
      calculateNpDamage(np.input, versions),
    ),
  };
}

export function createDefaultCalcInput(
  master: MasterDataSnapshot,
  build: ServantBuild | undefined,
  servant: ServantMaster = master.servants[0]!,
): CalcInput {
  return {
    attackerId: servant.id,
    attackerLevel: build?.level ?? 90,
    attackerAtk: servant.atkByLevel[String(build?.level ?? 90)] ?? servant.atkByLevel['90'] ?? 0,
    fouAtk: build?.fouAtk ?? 1000,
    craftEssenceId: null,
    craftEssenceAtk: 0,
    npLevel: Math.max(1, build?.npLevel ?? 1),
    overcharge: 1,
    npMultipliers: servant.npMultipliers,
    attackNpFunctionType: servant.attackNpFunctionType,
    cardType: servant.npCard,
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
    npSpecialMultiplier: 1,
    specialDamageBuff: 0,
    specialResistance: 0,
    flatDamage: 0,
    damageCut: 0,
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
    enabled: false,
  }));
}

export function selectionFromShare(shared: CalculationShareSnapshot): CalculationSelection {
  const craftEssence = shared.composition?.craftEssence;
  return {
    attackerSource: 'master',
    craftEssence: craftEssence ? { ...craftEssence, source: 'master', copyId: null } : null,
  };
}
