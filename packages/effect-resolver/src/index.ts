import {
  getPrimaryNoblePhantasm,
  type CraftEssenceMaster,
  type MasterEffect,
  type MysticCodeMaster,
  type ServantMaster,
  type TraitCondition,
} from '@fgo-lab/master-data';
import type {
  AttackerSkillSelection,
  DamageResolutionInput,
  SupportComposition,
} from '@fgo-lab/schema';

export type ResolvedBuffKind =
  | 'attackBuff'
  | 'cardBuff'
  | 'npDamageBuff'
  | 'eventDamageBuff'
  | 'specialDamageBuff'
  | 'powerMod'
  | 'flatDamage';

export interface DamageTraitCondition {
  kind: 'powerMod' | 'npSpecial';
  condition: TraitCondition;
}

export interface ResolvedSupportEffect {
  effectKey: string;
  sourceInstanceId: string;
  origin: 'attacker' | 'support' | 'craftEssence' | 'mysticCode' | 'passive' | 'np';
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effectId: string;
  label: string;
  value: number | null;
  kind: ResolvedBuffKind | null;
  damageTraitCondition: DamageTraitCondition | null;
  requiredFieldTraits: readonly string[];
  damageRelevant: boolean;
  calculationSupported: boolean;
  applied: boolean;
  reason: string;
}

export interface ResolvedEffectSet {
  input: DamageResolutionInput;
  effects: ResolvedSupportEffect[];
  npDamageBuffRate: number;
  precision: 'exact' | 'approximate' | 'unsupported';
  warnings: string[];
}

const NON_NP_DAMAGE_BUFF_TYPES = new Set(['upCriticaldamage', 'upExtraattack']);
const UNSUPPORTED_NP_DAMAGE_BUFF_TYPES = new Set([
  'addIndividuality',
  'addSelfdamage',
  'buffRate',
  'changeCommandCardType',
  'downAtk',
  'downCommandall',
  'downNpdamage',
  'downTolerance',
  'fieldIndividuality',
  'fieldIndividualityChangedFunction',
  'npattackPrevBuff',
  'overwriteClassRelation',
  'pierceDefence',
  'pierceSubdamage',
  'subFieldIndividuality',
  'subIndividuality',
  'subSelfdamage',
  'tdTypeChange',
  'tdTypeChangeArts',
  'tdTypeChangeBuster',
  'tdTypeChangeQuick',
  'toFieldChangeField',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
  'upTolerance',
  'upToleranceSubstate',
]);

interface SkillSelection {
  sourceInstanceId: string;
  sourceId: string;
  skillId: string;
  skillLevel: number;
  defaultEnabled: boolean;
  selectedEffectIds?: readonly string[];
  order: number;
}

function effectBuffKind(effect: MasterEffect): ResolvedBuffKind | null {
  const buffTypes = effect.buffTypes ?? [];
  if (buffTypes.some((type) => NON_NP_DAMAGE_BUFF_TYPES.has(type))) return null;
  if (buffTypes.includes('addDamage')) return 'flatDamage';
  if (
    buffTypes.some((type) =>
      ['upDamage', 'upDamageIndividuality', 'upDamageIndividualityActiveonly'].includes(type),
    )
  )
    return 'powerMod';
  if (buffTypes.some((type) => type === 'upAtk' || type === 'downDefence')) return 'attackBuff';
  if (buffTypes.some((type) => type === 'upNpdamage' || type === 'downDefenceNpdamage'))
    return 'npDamageBuff';
  if (
    effect.cardTypes.length > 0 &&
    buffTypes.some((type) =>
      ['upCommandall', 'upCommandatk', 'downDefencecommandall'].includes(type),
    )
  )
    return 'cardBuff';
  return null;
}

function matchesTraitCondition(condition: TraitCondition | undefined, traits: readonly string[]) {
  if (!condition) return true;
  return (
    (condition.anyOf.length === 0 || condition.anyOf.some((trait) => traits.includes(trait))) &&
    condition.noneOf.every((trait) => !traits.includes(trait))
  );
}

function isPotentiallyDamageRelevant(effect: MasterEffect): boolean {
  const buffTypes = effect.buffTypes ?? [];
  if (buffTypes.some((type) => NON_NP_DAMAGE_BUFF_TYPES.has(type))) return false;
  return buffTypes.some((type) => UNSUPPORTED_NP_DAMAGE_BUFF_TYPES.has(type));
}

export function isDamageRelevantEffect(effect: MasterEffect): boolean {
  return (
    effectBuffKind(effect) !== null ||
    Boolean(
      effect.buffTypes?.includes('buffRate') && effect.buffRateTargets?.includes('buffNpDamageUp'),
    ) ||
    isPotentiallyDamageRelevant(effect)
  );
}

interface ResolvableEffect {
  sourceInstanceId: string;
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effect: MasterEffect;
  rawValue: number | undefined;
  appliedReason: string;
  defaultEnabled: boolean;
}

function numericParameter(
  effect: MasterEffect,
  setIndex: number,
  valueIndex: number,
  useLimitBreakParameters = false,
): number | undefined {
  const sets =
    useLimitBreakParameters && effect.limitBreakParameterSets
      ? effect.limitBreakParameterSets
      : effect.parameterSets;
  const value = sets[setIndex]?.[valueIndex]?.['Value'];
  return typeof value === 'number' ? value : undefined;
}

export interface ResolveEffectOptions {
  effectOverrides?: Readonly<Record<string, boolean>>;
  defaultEnabled?: boolean;
}

function effectKey(
  origin: ResolvedSupportEffect['origin'],
  item: Pick<ResolvableEffect, 'sourceInstanceId' | 'skillId' | 'effect'>,
) {
  return `${origin}:${item.sourceInstanceId}:${item.skillId}:${item.effect.id}`;
}

function resolveEffects(
  baseInput: DamageResolutionInput,
  items: readonly ResolvableEffect[],
  origin: ResolvedSupportEffect['origin'],
  recipientTraits: readonly string[] = [],
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  const nextInput = { ...baseInput };
  const effects: ResolvedSupportEffect[] = [];
  const warnings: string[] = [];
  let npDamageBuffRate = 0;
  let precision: ResolvedEffectSet['precision'] = 'exact';
  const targetTraits = [...baseInput.target.traits, ...baseInput.targetStateTraits];

  for (const item of items) {
    const { effect, rawValue } = item;
    const kind = effectBuffKind(effect);
    const npDamageBuffRateEffect =
      effect.buffTypes?.includes('buffRate') && effect.buffRateTargets?.includes('buffNpDamageUp');
    const key = effectKey(origin, item);
    const override = options.effectOverrides?.[key];
    const enabled = override ?? item.defaultEnabled;
    const effectIdentity = {
      effectKey: key,
      sourceInstanceId: item.sourceInstanceId,
      origin,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      skillId: item.skillId,
      skillName: item.skillName,
      effectId: effect.id,
      label: effect.label,
      kind,
      damageTraitCondition:
        kind === 'powerMod' &&
        effect.targetCondition &&
        (effect.targetCondition.anyOf.length > 0 || effect.targetCondition.noneOf.length > 0)
          ? ({
              kind: 'powerMod',
              condition: effect.targetCondition,
            } satisfies DamageTraitCondition)
          : null,
      requiredFieldTraits: effect.requiredFieldTraits ?? [],
      damageRelevant:
        kind !== null || Boolean(npDamageBuffRateEffect) || isPotentiallyDamageRelevant(effect),
      calculationSupported: kind !== null || Boolean(npDamageBuffRateEffect),
    };
    if (rawValue === undefined && effectIdentity.damageRelevant) {
      precision = 'unsupported';
      warnings.push(`${origin}_effect_level_missing:${item.sourceId}:${item.skillId}:${effect.id}`);
      effects.push({
        ...effectIdentity,
        value: null,
        applied: false,
        reason: 'level_value_missing',
      });
      continue;
    }
    if (rawValue === undefined) {
      effects.push({
        ...effectIdentity,
        value: null,
        applied: false,
        reason: 'not_np_damage_relevant',
      });
      continue;
    }
    const value = kind === 'flatDamage' ? rawValue : rawValue / 1000;
    if (
      (effect.recipientTraits?.length ?? 0) > 0 &&
      !effect.recipientTraits?.some((trait) => recipientTraits.includes(trait))
    ) {
      effects.push({
        ...effectIdentity,
        value,
        applied: false,
        reason: 'attacker_trait_mismatch',
      });
      continue;
    }
    if (kind === 'cardBuff' && !effect.cardTypes.includes(baseInput.cardType)) {
      effects.push({
        ...effectIdentity,
        value,
        applied: false,
        reason: 'card_type_mismatch',
      });
      continue;
    }
    if (!enabled) {
      effects.push({
        ...effectIdentity,
        value,
        applied: false,
        reason: 'calculation_effect_disabled',
      });
      continue;
    }
    if (!matchesTraitCondition(effect.targetCondition, targetTraits)) {
      effects.push({
        ...effectIdentity,
        value,
        applied: false,
        reason: 'target_trait_mismatch',
      });
      continue;
    }
    if (
      (effect.requiredFieldTraits?.length ?? 0) > 0 &&
      !effect.requiredFieldTraits?.every((trait) => baseInput.fieldTraits.includes(trait))
    ) {
      effects.push({
        ...effectIdentity,
        value,
        applied: false,
        reason: 'field_trait_mismatch',
      });
      continue;
    }
    if (npDamageBuffRateEffect) {
      npDamageBuffRate = Math.max(npDamageBuffRate, value);
      effects.push({
        ...effectIdentity,
        value,
        applied: true,
        reason: 'np_damage_buff_rate',
      });
      continue;
    }
    if (kind) {
      if (kind === 'flatDamage') nextInput.flatDamage += rawValue;
      else nextInput[kind] += value;
      effects.push({
        ...effectIdentity,
        value,
        applied: true,
        reason: item.appliedReason,
      });
      continue;
    }
    const damageRelevant = isPotentiallyDamageRelevant(effect);
    if (damageRelevant) {
      precision = 'unsupported';
      warnings.push(`${origin}_effect_not_resolved:${item.sourceId}:${item.skillId}:${effect.id}`);
    }
    effects.push({
      ...effectIdentity,
      value,
      kind: null,
      applied: false,
      reason: damageRelevant ? 'damage_effect_not_supported' : 'not_np_damage_relevant',
    });
  }

  return { input: nextInput, effects, npDamageBuffRate, precision, warnings };
}

function resolveSkillSelections(
  baseInput: DamageResolutionInput,
  selectedSkills: readonly SkillSelection[],
  servants: readonly ServantMaster[],
  origin: ResolvedSupportEffect['origin'],
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  const warnings: string[] = [];
  let missing = false;
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  const recipientTraits = servantById.get(baseInput.attackerId)?.traits ?? [];
  const items: ResolvableEffect[] = [];

  for (const selected of [...selectedSkills].sort((a, b) => a.order - b.order)) {
    const source = servantById.get(selected.sourceId);
    const skill = [...(source?.skills ?? []), ...(source?.passives ?? [])].find(
      (candidate) => candidate.id === selected.skillId,
    );
    if (!source || !skill) {
      missing = true;
      warnings.push(`${origin}_effect_missing:${selected.sourceId}:${selected.skillId}`);
      continue;
    }
    for (const effect of skill.effects) {
      items.push({
        sourceInstanceId: selected.sourceInstanceId,
        sourceId: source.id,
        sourceName: source.name,
        skillId: skill.id,
        skillName: skill.name,
        effect,
        rawValue: numericParameter(effect, 0, selected.skillLevel - 1),
        appliedReason: 'unconditional_attacker_buff',
        defaultEnabled: selected.selectedEffectIds?.includes(effect.id) ?? selected.defaultEnabled,
      });
    }
  }

  const resolved = resolveEffects(baseInput, items, origin, recipientTraits, options);
  return {
    ...resolved,
    precision: missing ? 'unsupported' : resolved.precision,
    warnings: [...warnings, ...resolved.warnings],
  };
}

export function resolveServantPassives(
  baseInput: DamageResolutionInput,
  servant: ServantMaster | undefined,
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  if (!servant)
    return {
      input: baseInput,
      effects: [],
      npDamageBuffRate: 0,
      precision: 'unsupported',
      warnings: ['passive_source_missing'],
    };
  return resolveSkillSelections(
    baseInput,
    servant.passives.map((skill, order) => ({
      sourceInstanceId: `passive:${servant.id}`,
      sourceId: servant.id,
      skillId: skill.id,
      skillLevel: 1,
      defaultEnabled: true,
      order,
    })),
    [servant],
    'passive',
    options,
  );
}

export function resolveCraftEssenceEffects(
  baseInput: DamageResolutionInput,
  craftEssence: CraftEssenceMaster | undefined,
  limitBreak: number,
  recipientTraits: readonly string[] = [],
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  if (!craftEssence)
    return {
      input: baseInput,
      effects: [],
      npDamageBuffRate: 0,
      precision: 'exact',
      warnings: [],
    };
  return resolveEffects(
    baseInput,
    craftEssence.effects.map((effect) => ({
      sourceInstanceId: `craftEssence:${craftEssence.id}`,
      sourceId: craftEssence.id,
      sourceName: craftEssence.name,
      skillId: `ce:${craftEssence.id}`,
      skillName: craftEssence.name,
      effect,
      rawValue: numericParameter(effect, 0, 0, limitBreak === 4),
      appliedReason: limitBreak === 4 ? 'limit_break_effect' : 'craft_essence_effect',
      defaultEnabled: true,
    })),
    'craftEssence',
    recipientTraits,
    options,
  );
}

export function resolveNpEffects(
  baseInput: DamageResolutionInput,
  servant: ServantMaster | undefined,
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  if (!servant)
    return {
      input: baseInput,
      effects: [],
      npDamageBuffRate: 0,
      precision: 'unsupported',
      warnings: ['np_source_missing'],
    };
  const noblePhantasm = getPrimaryNoblePhantasm(servant);
  if (!noblePhantasm)
    return {
      input: baseInput,
      effects: [],
      npDamageBuffRate: 0,
      precision: 'unsupported',
      warnings: ['np_source_missing'],
    };
  return resolveEffects(
    baseInput,
    noblePhantasm.effects
      .filter((effect) => effect.timing === 'beforeDamage')
      .map((effect) => ({
        sourceInstanceId: `np:${servant.id}`,
        sourceId: servant.id,
        sourceName: servant.name,
        skillId: `np:${servant.id}`,
        skillName: '宝具前効果',
        effect,
        rawValue: numericParameter(effect, baseInput.overcharge - 1, baseInput.npLevel - 1),
        appliedReason: 'np_before_damage',
        defaultEnabled: true,
      })),
    'np',
    servant.traits,
    options,
  );
}

export function resolveSupportComposition(
  baseInput: DamageResolutionInput,
  composition: SupportComposition,
  servants: readonly ServantMaster[],
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  return resolveSkillSelections(
    baseInput,
    composition.sources.flatMap((source, sourceOrder) =>
      source.skills.map((skill, skillOrder) => ({
        sourceInstanceId: source.sourceInstanceId,
        sourceId: source.servantId,
        skillId: skill.skillId,
        skillLevel: skill.skillLevel,
        defaultEnabled: false,
        selectedEffectIds: composition.selectedEffects
          .filter(
            (effect) =>
              effect.sourceInstanceId === source.sourceInstanceId &&
              effect.skillId === skill.skillId,
          )
          .map((effect) => effect.effectId),
        order: sourceOrder * 20 + skillOrder,
      })),
    ),
    servants,
    'support',
    options,
  );
}

export function resolveAttackerSkills(
  baseInput: DamageResolutionInput,
  selections: readonly AttackerSkillSelection[],
  servants: readonly ServantMaster[],
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  return resolveSkillSelections(
    baseInput,
    selections.map((selection, order) => ({
      sourceInstanceId: `attacker:${baseInput.attackerId}`,
      sourceId: baseInput.attackerId,
      skillId: selection.skillId,
      skillLevel: selection.skillLevel,
      defaultEnabled: options.defaultEnabled ?? true,
      order,
    })),
    servants,
    'attacker',
    options,
  );
}

export function resolveMysticCodeSkills(
  baseInput: DamageResolutionInput,
  mysticCode: MysticCodeMaster | undefined,
  selections: readonly AttackerSkillSelection[],
  recipientTraits: readonly string[],
  options: ResolveEffectOptions = {},
): ResolvedEffectSet {
  if (!mysticCode)
    return {
      input: baseInput,
      effects: [],
      npDamageBuffRate: 0,
      precision: 'unsupported',
      warnings: ['mysticCode_source_missing'],
    };
  const warnings: string[] = [];
  const items: ResolvableEffect[] = [];
  for (const selection of selections) {
    const skill = mysticCode.skills.find((candidate) => candidate.id === selection.skillId);
    if (!skill) {
      warnings.push(`mysticCode_effect_missing:${mysticCode.id}:${selection.skillId}`);
      continue;
    }
    for (const effect of skill.effects)
      items.push({
        sourceInstanceId: `mysticCode:${mysticCode.id}`,
        sourceId: mysticCode.id,
        sourceName: mysticCode.name,
        skillId: skill.id,
        skillName: skill.name,
        effect,
        rawValue: numericParameter(effect, 0, selection.skillLevel - 1),
        appliedReason: 'mystic_code_buff',
        defaultEnabled: options.defaultEnabled ?? true,
      });
  }
  const resolved = resolveEffects(baseInput, items, 'mysticCode', recipientTraits, options);
  return {
    ...resolved,
    precision: warnings.length > 0 ? 'unsupported' : resolved.precision,
    warnings: [...warnings, ...resolved.warnings],
  };
}
