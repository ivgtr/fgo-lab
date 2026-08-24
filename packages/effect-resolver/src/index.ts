import {
  deriveNpSpecialMultipliers,
  type CraftEssenceMaster,
  type MasterEffect,
  type ServantMaster,
  type TraitCondition,
} from '@fgo-lab/master-data';
import type { AttackerSkillSelection, CalcInput, SupportTemplate } from '@fgo-lab/schema';

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
  origin: 'attacker' | 'support' | 'craftEssence' | 'passive' | 'np';
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
  applied: boolean;
  reason: string;
}

export interface ResolvedSupportTemplate {
  input: CalcInput;
  effects: ResolvedSupportEffect[];
  precision: 'exact' | 'approximate' | 'unsupported';
  warnings: string[];
}

interface SkillSelection {
  sourceId: string;
  skillId: string;
  skillLevel: number;
  enabled: boolean;
  order: number;
}

const CARD_LABELS: Record<string, CalcInput['cardType']> = {
  バスターアップ: 'buster',
  アーツアップ: 'arts',
  クイックアップ: 'quick',
  バスター耐性ダウン: 'buster',
  アーツ耐性ダウン: 'arts',
  クイック耐性ダウン: 'quick',
};

const KNOWN_UNSUPPORTED_DAMAGE_LABELS = new Set([
  '宝具威力アップブースト',
  'イベント攻撃威力アップ',
]);

function buffKind(label: string): ResolvedBuffKind | null {
  if (label === '攻撃力アップ' || label === '防御力ダウン') return 'attackBuff';
  if (label === '宝具威力アップ' || label === '宝具耐性ダウン') return 'npDamageBuff';
  if (label === 'イベント攻撃威力アップ') return 'eventDamageBuff';
  if (label === '特殊威力アップ') return 'specialDamageBuff';
  if (label === 'アタックプラス') return 'flatDamage';
  if (label in CARD_LABELS) return 'cardBuff';
  return null;
}

function effectBuffKind(effect: MasterEffect): ResolvedBuffKind | null {
  if (effect.buffTypes?.includes('addDamage')) return 'flatDamage';
  if ((effect.buffTypes ?? []).some((type) => type.toLowerCase().startsWith('updamage')))
    return 'powerMod';
  return buffKind(effect.label);
}

function matchesTraitCondition(condition: TraitCondition | undefined, traits: readonly string[]) {
  if (!condition) return true;
  return (
    (condition.anyOf.length === 0 || condition.anyOf.some((trait) => traits.includes(trait))) &&
    condition.noneOf.every((trait) => !traits.includes(trait))
  );
}

const NON_NP_DAMAGE_BUFF_TYPES = new Set(['upCriticaldamage', 'upExtraattack']);

function isPotentiallyDamageRelevant(effect: MasterEffect): boolean {
  if ((effect.buffTypes ?? []).some((type) => NON_NP_DAMAGE_BUFF_TYPES.has(type))) return false;
  const { label } = effect;
  return (
    KNOWN_UNSUPPORTED_DAMAGE_LABELS.has(label) ||
    label.includes('威力アップ') ||
    label.includes('特攻') ||
    label.includes('防御力ダウン') ||
    label.includes('耐性ダウン')
  );
}

interface ResolvableEffect {
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effect: MasterEffect;
  rawValue: number | undefined;
  appliedReason: string;
}

function resolveEffects(
  baseInput: CalcInput,
  items: readonly ResolvableEffect[],
  origin: ResolvedSupportEffect['origin'],
  recipientTraits: readonly string[] = [],
): ResolvedSupportTemplate {
  const nextInput = { ...baseInput };
  const effects: ResolvedSupportEffect[] = [];
  const warnings: string[] = [];
  let precision: ResolvedSupportTemplate['precision'] = 'exact';

  for (const item of items) {
    const { effect, rawValue } = item;
    const kind = effectBuffKind(effect);
    const effectIdentity = {
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
    };
    if (rawValue === undefined) {
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
    if (!matchesTraitCondition(effect.targetCondition, baseInput.target.traits)) {
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
    const cardType = CARD_LABELS[effect.label];
    if (kind === 'cardBuff' && cardType !== baseInput.cardType) {
      effects.push({
        ...effectIdentity,
        value,
        applied: false,
        reason: 'card_type_mismatch',
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
      if (precision === 'exact') precision = 'approximate';
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

  return { input: nextInput, effects, precision, warnings };
}

function resolveSkillSelections(
  baseInput: CalcInput,
  selectedSkills: readonly SkillSelection[],
  servants: readonly ServantMaster[],
  origin: ResolvedSupportEffect['origin'],
): ResolvedSupportTemplate {
  const warnings: string[] = [];
  let missing = false;
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  const recipientTraits = servantById.get(baseInput.attackerId)?.traits ?? [];
  const items: ResolvableEffect[] = [];

  for (const selected of [...selectedSkills].sort((a, b) => a.order - b.order)) {
    if (!selected.enabled) continue;
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
        sourceId: source.id,
        sourceName: source.name,
        skillId: skill.id,
        skillName: skill.name,
        effect,
        rawValue: effect.values[selected.skillLevel - 1],
        appliedReason: 'unconditional_attacker_buff',
      });
    }
  }

  const resolved = resolveEffects(baseInput, items, origin, recipientTraits);
  return {
    ...resolved,
    precision: missing ? 'unsupported' : resolved.precision,
    warnings: [...warnings, ...resolved.warnings],
  };
}

export function resolveServantPassives(
  baseInput: CalcInput,
  servant: ServantMaster | undefined,
): ResolvedSupportTemplate {
  if (!servant)
    return {
      input: baseInput,
      effects: [],
      precision: 'unsupported',
      warnings: ['passive_source_missing'],
    };
  return resolveSkillSelections(
    baseInput,
    servant.passives.map((skill, order) => ({
      sourceId: servant.id,
      skillId: skill.id,
      skillLevel: 1,
      enabled: true,
      order,
    })),
    [servant],
    'passive',
  );
}

export function resolveCraftEssenceEffects(
  baseInput: CalcInput,
  craftEssence: CraftEssenceMaster | undefined,
  limitBreak: number,
  recipientTraits: readonly string[] = [],
): ResolvedSupportTemplate {
  if (!craftEssence) return { input: baseInput, effects: [], precision: 'exact', warnings: [] };
  return resolveEffects(
    baseInput,
    craftEssence.effects.map((effect) => ({
      sourceId: craftEssence.id,
      sourceName: craftEssence.name,
      skillId: `ce:${craftEssence.id}`,
      skillName: craftEssence.name,
      effect,
      rawValue: effect.values[limitBreak === 4 ? 1 : 0],
      appliedReason: limitBreak === 4 ? 'limit_break_effect' : 'craft_essence_effect',
    })),
    'craftEssence',
    recipientTraits,
  );
}

export function resolveNpEffects(
  baseInput: CalcInput,
  servant: ServantMaster | undefined,
): ResolvedSupportTemplate {
  if (!servant)
    return {
      input: baseInput,
      effects: [],
      precision: 'unsupported',
      warnings: ['np_source_missing'],
    };
  const resolved = resolveEffects(
    baseInput,
    servant.npEffects
      .filter((effect) => effect.timing === 'beforeDamage')
      .map((effect) => ({
        sourceId: servant.id,
        sourceName: servant.name,
        skillId: `np:${servant.id}`,
        skillName: '宝具前効果',
        effect,
        rawValue: effect.values[baseInput.overcharge - 1],
        appliedReason: 'np_before_damage',
      })),
    'np',
    servant.traits,
  );
  const special = servant.npSpecialAttack;
  if (!special) return resolved;
  const multipliers = deriveNpSpecialMultipliers(servant, baseInput.overcharge);
  const selectedMultiplier = multipliers[baseInput.npLevel - 1] ?? 1;
  const matched = matchesTraitCondition(special.targetCondition, baseInput.target.traits);
  return {
    ...resolved,
    input: matched
      ? {
          ...resolved.input,
          npSpecialMultipliers: resolved.input.npSpecialMultipliers.map(
            (baseMultiplier, index) => baseMultiplier * (multipliers[index] ?? 1),
          ) as CalcInput['npSpecialMultipliers'],
        }
      : resolved.input,
    effects: [
      ...resolved.effects,
      {
        origin: 'np',
        sourceId: servant.id,
        sourceName: servant.name,
        skillId: `np:${servant.id}:special`,
        skillName: '特攻宝具',
        effectId: `np-special:${servant.id}`,
        label: '特攻宝具',
        value: selectedMultiplier,
        kind: null,
        damageTraitCondition: { kind: 'npSpecial', condition: special.targetCondition },
        requiredFieldTraits: [],
        applied: matched,
        reason: matched ? 'target_trait_matched' : 'target_trait_mismatch',
      },
    ],
  };
}

export function resolveSupportTemplate(
  baseInput: CalcInput,
  template: SupportTemplate,
  servants: readonly ServantMaster[],
): ResolvedSupportTemplate {
  return resolveSkillSelections(
    baseInput,
    template.effects.map((effect) => ({
      sourceId: effect.sourceId,
      skillId: effect.effectId,
      skillLevel: effect.skillLevel,
      enabled: effect.enabled,
      order: effect.order,
    })),
    servants,
    'support',
  );
}

export function resolveAttackerSkills(
  baseInput: CalcInput,
  selections: readonly AttackerSkillSelection[],
  servants: readonly ServantMaster[],
): ResolvedSupportTemplate {
  return resolveSkillSelections(
    baseInput,
    selections.map((selection, order) => ({
      sourceId: baseInput.attackerId,
      skillId: selection.skillId,
      skillLevel: selection.skillLevel,
      enabled: selection.enabled,
      order,
    })),
    servants,
    'attacker',
  );
}
