import {
  getPrimaryNoblePhantasm,
  type MasterEffect,
  type MasterDataSnapshot,
  type ServantMaster,
  type TraitCondition,
} from '@fgo-lab/master-data';
import type { CalculationEditorState, DamageResolutionInput } from '@fgo-lab/schema';

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

export interface ResolvedEffect {
  order: number;
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
  state: 'applied' | 'rejected' | 'unsupported';
  reason: string;
}

export interface EffectResolution {
  input: DamageResolutionInput;
  effects: ResolvedEffect[];
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

export interface EffectSource {
  order: number;
  origin: ResolvedEffect['origin'];
  sourceInstanceId: string;
  sourceId: string;
  sourceName: string;
  skillId: string;
  skillName: string;
  effect: MasterEffect;
  rawValue: number | undefined;
  appliedReason: string;
  defaultEnabled: boolean;
  recipientTraits: readonly string[];
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

function effectKey(item: Pick<EffectSource, 'origin' | 'sourceInstanceId' | 'skillId' | 'effect'>) {
  return `${item.origin}:${item.sourceInstanceId}:${item.skillId}:${item.effect.id}`;
}

export function resolveEffectSources(
  baseInput: DamageResolutionInput,
  items: readonly EffectSource[],
  options: ResolveEffectOptions = {},
): EffectResolution {
  const effects: ResolvedEffect[] = [];
  const warnings: string[] = [];
  let npDamageBuffRate = 0;
  let precision: EffectResolution['precision'] = 'exact';
  const targetTraits = [...baseInput.target.traits, ...baseInput.targetStateTraits];

  for (const item of items) {
    const { effect, rawValue } = item;
    const kind = effectBuffKind(effect);
    const npDamageBuffRateEffect =
      effect.buffTypes?.includes('buffRate') && effect.buffRateTargets?.includes('buffNpDamageUp');
    const key = effectKey(item);
    const override = options.effectOverrides?.[key];
    const enabled = override ?? item.defaultEnabled;
    const effectIdentity = {
      effectKey: key,
      order: item.order,
      sourceInstanceId: item.sourceInstanceId,
      origin: item.origin,
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
    };
    if (rawValue === undefined && effectIdentity.damageRelevant) {
      precision = 'unsupported';
      warnings.push(
        `${item.origin}_effect_level_missing:${item.sourceId}:${item.skillId}:${effect.id}`,
      );
      effects.push({
        ...effectIdentity,
        value: null,
        state: 'unsupported',
        reason: 'level_value_missing',
      });
      continue;
    }
    if (rawValue === undefined) {
      effects.push({
        ...effectIdentity,
        value: null,
        state: 'rejected',
        reason: 'not_np_damage_relevant',
      });
      continue;
    }
    const value = kind === 'flatDamage' ? rawValue : rawValue / 1000;
    if (
      (effect.recipientTraits?.length ?? 0) > 0 &&
      !effect.recipientTraits?.some((trait) => item.recipientTraits.includes(trait))
    ) {
      effects.push({
        ...effectIdentity,
        value,
        state: 'rejected',
        reason: 'attacker_trait_mismatch',
      });
      continue;
    }
    if (kind === 'cardBuff' && !effect.cardTypes.includes(baseInput.cardType)) {
      effects.push({
        ...effectIdentity,
        value,
        state: 'rejected',
        reason: 'card_type_mismatch',
      });
      continue;
    }
    if (!enabled) {
      effects.push({
        ...effectIdentity,
        value,
        state: 'rejected',
        reason: 'calculation_effect_disabled',
      });
      continue;
    }
    if (!matchesTraitCondition(effect.targetCondition, targetTraits)) {
      effects.push({
        ...effectIdentity,
        value,
        state: 'rejected',
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
        state: 'rejected',
        reason: 'field_trait_mismatch',
      });
      continue;
    }
    const unresolvedMetadata =
      (effect.functionScript && Object.keys(effect.functionScript).length > 0) ||
      (effect.overwriteTargetValues?.length ?? 0) > 0;
    if (effectIdentity.damageRelevant && unresolvedMetadata) {
      precision = 'unsupported';
      warnings.push(
        `${item.origin}_effect_metadata_not_resolved:${item.sourceId}:${item.skillId}:${effect.id}`,
      );
      effects.push({
        ...effectIdentity,
        value,
        state: 'unsupported',
        reason: 'effect_metadata_not_resolved',
      });
      continue;
    }
    if (npDamageBuffRateEffect) {
      npDamageBuffRate = Math.max(npDamageBuffRate, value);
      effects.push({
        ...effectIdentity,
        value,
        state: 'applied',
        reason: 'np_damage_buff_rate',
      });
      continue;
    }
    if (kind) {
      effects.push({
        ...effectIdentity,
        value,
        state: 'applied',
        reason: item.appliedReason,
      });
      continue;
    }
    const damageRelevant = isPotentiallyDamageRelevant(effect);
    if (damageRelevant) {
      precision = 'unsupported';
      warnings.push(
        `${item.origin}_effect_not_resolved:${item.sourceId}:${item.skillId}:${effect.id}`,
      );
    }
    effects.push({
      ...effectIdentity,
      value,
      kind: null,
      state: damageRelevant ? 'unsupported' : 'rejected',
      reason: damageRelevant ? 'damage_effect_not_supported' : 'not_np_damage_relevant',
    });
  }

  const aggregatedInput = effects.reduce(
    (aggregated, effect) => {
      if (effect.state !== 'applied' || !effect.kind || effect.reason === 'np_damage_buff_rate')
        return aggregated;
      if (effect.kind === 'flatDamage') aggregated.flatDamage += effect.value ?? 0;
      else aggregated[effect.kind] += effect.value ?? 0;
      return aggregated;
    },
    { ...baseInput },
  );
  const input =
    npDamageBuffRate > 0
      ? {
          ...aggregatedInput,
          npDamageBuff: aggregatedInput.npDamageBuff * (1 + npDamageBuffRate),
        }
      : aggregatedInput;
  return { input, effects, npDamageBuffRate, precision, warnings };
}

function collectSkillSelections(
  baseInput: DamageResolutionInput,
  selectedSkills: readonly SkillSelection[],
  servants: readonly ServantMaster[],
  origin: ResolvedEffect['origin'],
): { items: EffectSource[]; warnings: string[] } {
  const warnings: string[] = [];
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  const recipientTraits = servantById.get(baseInput.attackerId)?.traits ?? [];
  const items: EffectSource[] = [];

  for (const selected of [...selectedSkills].sort((a, b) => a.order - b.order)) {
    const source = servantById.get(selected.sourceId);
    const skill = [...(source?.skills ?? []), ...(source?.passives ?? [])].find(
      (candidate) => candidate.id === selected.skillId,
    );
    if (!source || !skill) {
      warnings.push(`${origin}_effect_missing:${selected.sourceId}:${selected.skillId}`);
      continue;
    }
    for (const effect of skill.effects) {
      items.push({
        order: items.length,
        origin,
        sourceInstanceId: selected.sourceInstanceId,
        sourceId: source.id,
        sourceName: source.name,
        skillId: skill.id,
        skillName: skill.name,
        effect,
        rawValue: numericParameter(effect, 0, selected.skillLevel - 1),
        appliedReason: 'unconditional_attacker_buff',
        defaultEnabled: selected.selectedEffectIds?.includes(effect.id) ?? selected.defaultEnabled,
        recipientTraits,
      });
    }
  }

  return { items, warnings };
}

export interface ScenarioEffectResolution extends EffectResolution {
  trace: { step: string; detail: string }[];
}

export function resolveScenarioEffects(
  baseInput: DamageResolutionInput,
  selection: CalculationEditorState,
  master: MasterDataSnapshot,
): ScenarioEffectResolution {
  const attacker = master.servants.find((candidate) => candidate.id === baseInput.attackerId);
  const recipientTraits = attacker?.traits ?? [];
  const items: EffectSource[] = [];
  const warnings: string[] = [];
  const append = (collected: { items: EffectSource[]; warnings: string[] }) => {
    warnings.push(...collected.warnings);
    items.push(...collected.items);
  };
  if (!attacker) warnings.push('attacker_source_missing', 'np_source_missing');
  else {
    append(
      collectSkillSelections(
        baseInput,
        attacker.passives.map((skill, order) => ({
          sourceInstanceId: `passive:${attacker.id}`,
          sourceId: attacker.id,
          skillId: skill.id,
          skillLevel: 1,
          defaultEnabled: true,
          order,
        })),
        [attacker],
        'passive',
      ),
    );
  }
  if (selection.craftEssence) {
    const craftEssence = master.craftEssences.find(
      (candidate) => candidate.id === selection.craftEssence?.craftEssenceId,
    );
    if (!craftEssence)
      warnings.push(`craftEssence_source_missing:${selection.craftEssence.craftEssenceId}`);
    else
      items.push(
        ...craftEssence.effects.map((effect, order) => ({
          order,
          origin: 'craftEssence' as const,
          sourceInstanceId: `craftEssence:${craftEssence.id}`,
          sourceId: craftEssence.id,
          sourceName: craftEssence.name,
          skillId: `ce:${craftEssence.id}`,
          skillName: craftEssence.name,
          effect,
          rawValue: numericParameter(effect, 0, 0, selection.craftEssence?.limitBreak === 4),
          appliedReason:
            selection.craftEssence?.limitBreak === 4
              ? 'limit_break_effect'
              : 'craft_essence_effect',
          defaultEnabled: true,
          recipientTraits,
        })),
      );
  }
  append(
    collectSkillSelections(
      baseInput,
      (selection.attackerSkills ?? []).map((skill, order) => ({
        sourceInstanceId: `attacker:${baseInput.attackerId}`,
        sourceId: baseInput.attackerId,
        skillId: skill.skillId,
        skillLevel: skill.skillLevel,
        defaultEnabled: false,
        order,
      })),
      master.servants,
      'attacker',
    ),
  );
  if (selection.mysticCode) {
    const mysticCode = master.mysticCodes.find(
      (candidate) => candidate.id === selection.mysticCode?.mysticCodeId,
    );
    if (!mysticCode)
      warnings.push(`mysticCode_source_missing:${selection.mysticCode.mysticCodeId}`);
    else
      for (const selected of selection.mysticCode.skills) {
        const skill = mysticCode.skills.find((candidate) => candidate.id === selected.skillId);
        if (!skill) {
          warnings.push(`mysticCode_effect_missing:${mysticCode.id}:${selected.skillId}`);
          continue;
        }
        items.push(
          ...skill.effects.map((effect, order) => ({
            order,
            origin: 'mysticCode' as const,
            sourceInstanceId: `mysticCode:${mysticCode.id}`,
            sourceId: mysticCode.id,
            sourceName: mysticCode.name,
            skillId: skill.id,
            skillName: skill.name,
            effect,
            rawValue: numericParameter(effect, 0, selected.skillLevel - 1),
            appliedReason: 'mystic_code_buff',
            defaultEnabled: false,
            recipientTraits,
          })),
        );
      }
  }
  if (selection.support) {
    const composition = selection.support.composition;
    append(
      collectSkillSelections(
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
        master.servants,
        'support',
      ),
    );
  }
  if (attacker) {
    const noblePhantasm = getPrimaryNoblePhantasm(attacker);
    if (!noblePhantasm) warnings.push('np_source_missing');
    else
      items.push(
        ...noblePhantasm.effects
          .filter((effect) => effect.timing === 'beforeDamage')
          .map((effect, order) => ({
            order,
            origin: 'np' as const,
            sourceInstanceId: `np:${attacker.id}`,
            sourceId: attacker.id,
            sourceName: attacker.name,
            skillId: `np:${attacker.id}`,
            skillName: '宝具前効果',
            effect,
            rawValue: numericParameter(effect, baseInput.overcharge - 1, baseInput.npLevel - 1),
            appliedReason: 'np_before_damage',
            defaultEnabled: true,
            recipientTraits,
          })),
      );
  }
  const orderedItems = items.map((item, order) => ({ ...item, order }));
  const resolved = resolveEffectSources(baseInput, orderedItems, {
    effectOverrides: selection.effectOverrides ?? {},
  });
  warnings.push(...resolved.warnings);
  return {
    input: resolved.input,
    precision:
      warnings.length > 0 || resolved.precision === 'unsupported' ? 'unsupported' : 'exact',
    warnings,
    effects: resolved.effects,
    npDamageBuffRate: resolved.npDamageBuffRate,
    trace: resolved.effects.map((effect) => ({
      step: `${effect.origin}-effect`,
      detail: `${effect.order}:${effect.sourceId}:${effect.skillId}:${effect.effectId}:${effect.reason}`,
    })),
  };
}
