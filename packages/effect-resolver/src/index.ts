import {
  getPrimaryNoblePhantasm,
  type MasterEffect,
  type MasterDataSnapshot,
  type ServantMaster,
  type TraitCondition,
} from '@fgo-lab/master-data';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';

export type ResolvedBuffKind =
  | 'attackBuff'
  | 'defenseBuff'
  | 'cardBuff'
  | 'cardResistance'
  | 'npDamageBuff'
  | 'npResistance'
  | 'ignoreDefense'
  | 'ignoreDamageCut'
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
  valuePermille: number | null;
  kind: ResolvedBuffKind | null;
  damageTraitCondition: DamageTraitCondition | null;
  requiredFieldTraits: readonly string[];
  contextChanges: MasterEffect['contextChanges'];
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

const NON_NP_DAMAGE_BUFF_TYPES = new Set([
  'changeCommandCardType',
  'downTolerance',
  'upCriticaldamage',
  'upExtraattack',
  'upTolerance',
  'upToleranceSubstate',
]);
const ATTACK_REDUCTION_BUFF_TYPES = new Set(['downAtk', 'downCommandall', 'downNpdamage']);
const DEFENSIVE_BUFF_TYPES = new Set([
  'subSelfdamage',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);
const UNSUPPORTED_NP_DAMAGE_BUFF_TYPES = new Set([
  'attackBeforeFunction',
  'addSelfdamage',
  'buffRate',
  'downAtk',
  'downCommandall',
  'downNpdamage',
  'fieldIndividuality',
  'fieldIndividualityChangedFunction',
  'npattackPrevBuff',
  'overwriteClassRelation',
  'subFieldIndividuality',
  'subIndividuality',
  'subSelfdamage',
  'tdTypeChange',
  'tdTypeChangeArts',
  'tdTypeChangeBuster',
  'tdTypeChangeQuick',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);
const RESOLVED_EFFECT_PARAMETER_KEYS = new Set([
  'AuraEffectId',
  'Count',
  'HideMiss',
  'HideNoEffect',
  'OnField',
  'Rate',
  'ShowQuestNoEffect',
  'ShowState',
  'Turn',
  'Value',
  'Value2',
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

type EffectRecipient = 'attacker' | 'target';

interface DamageEffectRoute {
  kind: ResolvedBuffKind;
  recipient: EffectRecipient;
  sign: 1 | -1;
}

function effectModifier(effect: MasterEffect): Omit<DamageEffectRoute, 'recipient'> | null {
  const buffTypes = effect.buffTypes ?? [];
  if (buffTypes.some((type) => NON_NP_DAMAGE_BUFF_TYPES.has(type))) return null;
  if (buffTypes.includes('pierceDefence')) return { kind: 'ignoreDefense', sign: 1 };
  if (buffTypes.includes('pierceSubdamage')) return { kind: 'ignoreDamageCut', sign: 1 };
  if (buffTypes.includes('addDamage')) return { kind: 'flatDamage', sign: 1 };
  if (
    buffTypes.some((type) =>
      ['upDamage', 'upDamageIndividuality', 'upDamageIndividualityActiveonly'].includes(type),
    )
  )
    return { kind: 'powerMod', sign: 1 };
  if (buffTypes.includes('upAtk')) return { kind: 'attackBuff', sign: 1 };
  if (buffTypes.includes('downAtk')) return { kind: 'attackBuff', sign: -1 };
  if (buffTypes.includes('downDefence')) return { kind: 'attackBuff', sign: 1 };
  if (buffTypes.includes('upDefence')) return { kind: 'defenseBuff', sign: 1 };
  if (buffTypes.includes('upNpdamage')) return { kind: 'npDamageBuff', sign: 1 };
  if (buffTypes.includes('downNpdamage')) return { kind: 'npDamageBuff', sign: -1 };
  if (buffTypes.includes('downDefenceNpdamage')) return { kind: 'npDamageBuff', sign: 1 };
  if (buffTypes.includes('upDefenceNpdamage')) return { kind: 'npResistance', sign: 1 };
  if (
    effect.cardTypes.length > 0 &&
    buffTypes.some((type) => ['upCommandall', 'upCommandatk'].includes(type))
  )
    return { kind: 'cardBuff', sign: 1 };
  if (effect.cardTypes.length > 0 && buffTypes.includes('downCommandall'))
    return { kind: 'cardBuff', sign: -1 };
  if (effect.cardTypes.length > 0 && buffTypes.includes('downDefencecommandall'))
    return { kind: 'cardBuff', sign: 1 };
  if (effect.cardTypes.length > 0 && buffTypes.includes('upDefencecommandall'))
    return { kind: 'cardResistance', sign: 1 };
  return null;
}

function targetRecipient(origin: ResolvedEffect['origin'], target: string): EffectRecipient | null {
  if (target.startsWith('enemy')) return 'target';
  if (target === 'self') return origin === 'support' || origin === 'mysticCode' ? null : 'attacker';
  if (target === 'ptOther' || target === 'ptOtherFull')
    return origin === 'support' ? 'attacker' : null;
  if (target === 'ptOne' || target === 'ptAll' || target === 'ptFull') return 'attacker';
  return null;
}

function expectedRecipient(kind: ResolvedBuffKind, buffTypes: readonly string[]): EffectRecipient {
  if (
    buffTypes.some((type) =>
      [
        'downDefence',
        'upDefence',
        'downDefencecommandall',
        'upDefencecommandall',
        'downDefenceNpdamage',
        'upDefenceNpdamage',
      ].includes(type),
    )
  )
    return 'target';
  return 'attacker';
}

function damageEffectRoute(
  effect: MasterEffect,
  origin: ResolvedEffect['origin'],
): DamageEffectRoute | null {
  const modifier = effectModifier(effect);
  if (!modifier) return null;
  const recipient = targetRecipient(origin, effect.target);
  if (!recipient || recipient !== expectedRecipient(modifier.kind, effect.buffTypes ?? []))
    return null;
  return { ...modifier, recipient };
}

function matchesTraitCondition(
  condition: TraitCondition,
  traits: readonly string[],
): boolean | null {
  if (condition.traits.length === 0) return true;
  if (condition.operator === 'partial') return null;
  const matches = condition.traits.map((trait) =>
    trait.negative ? !traits.includes(trait.name) : traits.includes(trait.name),
  );
  return condition.operator === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

function matchesTraitConditionGroups(
  conditions: readonly TraitCondition[],
  traits: readonly string[],
): boolean | null {
  if (conditions.length === 0) return true;
  const results = conditions.map((condition) => matchesTraitCondition(condition, traits));
  if (results.some((result) => result === true)) return true;
  return results.includes(null) ? null : false;
}

function isPotentiallyDamageRelevant(effect: MasterEffect): boolean {
  const buffTypes = effect.buffTypes ?? [];
  if (buffTypes.some((type) => NON_NP_DAMAGE_BUFF_TYPES.has(type))) return false;
  const targetsEnemy = effect.target.startsWith('enemy');
  if (targetsEnemy && buffTypes.some((type) => ATTACK_REDUCTION_BUFF_TYPES.has(type))) return false;
  if (!targetsEnemy && buffTypes.some((type) => DEFENSIVE_BUFF_TYPES.has(type))) return false;
  return buffTypes.some((type) => UNSUPPORTED_NP_DAMAGE_BUFF_TYPES.has(type));
}

export function isDamageEffectRoutable(
  effect: MasterEffect,
  origin: ResolvedEffect['origin'],
): boolean {
  return (
    damageEffectRoute(effect, origin) !== null ||
    Boolean(
      targetRecipient(origin, effect.target) === 'attacker' &&
      effect.buffTypes?.includes('buffRate') &&
      effect.buffRateTargets?.includes('buffNpDamageUp'),
    ) ||
    (targetRecipient(origin, effect.target) !== null && isPotentiallyDamageRelevant(effect))
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
  conditionAsserted?: boolean;
  attackerTraits: readonly string[];
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

interface BattleContext {
  attackerTraits: readonly string[];
  targetTraits: readonly string[];
  fieldTraits: readonly string[];
}

function baseBattleContext(baseInput: DamageResolutionInput, attackerTraits: readonly string[]) {
  return {
    attackerTraits: [
      ...attackerTraits,
      ...baseInput.attackerStateTraits,
      'cardNP',
      `card${baseInput.cardType[0]!.toUpperCase()}${baseInput.cardType.slice(1)}`,
    ],
    targetTraits: [...baseInput.target.traits, ...baseInput.targetStateTraits],
    fieldTraits: baseInput.fieldTraits,
  } satisfies BattleContext;
}

function effectConditionsMatch(
  baseInput: DamageResolutionInput,
  item: EffectSource,
  context: BattleContext,
  conditionAsserted: boolean,
): boolean | null {
  if (conditionAsserted) return true;
  const effect = item.effect;
  const route = damageEffectRoute(effect, item.origin);
  const recipient = route?.recipient ?? targetRecipient(item.origin, effect.target);
  const holderTraits = recipient === 'target' ? context.targetTraits : context.attackerTraits;
  const opponentTraits = recipient === 'target' ? context.attackerTraits : context.targetTraits;
  const results = [
    matchesTraitConditionGroups(effect.conditions.recipient, holderTraits),
    matchesTraitCondition(effect.conditions.holder, holderTraits),
    matchesTraitCondition(effect.conditions.opponent, opponentTraits),
    matchesTraitCondition(effect.conditions.field, context.fieldTraits),
  ];
  if (results.includes(null)) return null;
  return results.every(Boolean);
}

function resolveBattleContext(
  baseInput: DamageResolutionInput,
  items: readonly EffectSource[],
  options: ResolveEffectOptions,
): BattleContext {
  const initial = baseBattleContext(baseInput, items[0]?.attackerTraits ?? []);
  const attackerTraits = new Set(initial.attackerTraits);
  const targetTraits = new Set(initial.targetTraits);
  const fieldTraits = new Set(initial.fieldTraits);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      const changes = item.effect.contextChanges;
      if (changes.addedFieldTraits.length === 0 && changes.addedRecipientTraits.length === 0)
        continue;
      const override = options.effectOverrides?.[effectKey(item)];
      if (!(override ?? item.defaultEnabled)) continue;
      const conditionAsserted = override === true || item.conditionAsserted === true;
      const context = {
        attackerTraits: [...attackerTraits],
        targetTraits: [...targetTraits],
        fieldTraits: [...fieldTraits],
      };
      if (effectConditionsMatch(baseInput, item, context, conditionAsserted) !== true) continue;
      for (const trait of changes.addedFieldTraits)
        if (!fieldTraits.has(trait)) {
          fieldTraits.add(trait);
          changed = true;
        }
      const recipient = targetRecipient(item.origin, item.effect.target);
      const recipientTraits = recipient === 'target' ? targetTraits : attackerTraits;
      for (const trait of changes.addedRecipientTraits)
        if (!recipientTraits.has(trait)) {
          recipientTraits.add(trait);
          changed = true;
        }
    }
  }
  return {
    attackerTraits: [...attackerTraits],
    targetTraits: [...targetTraits],
    fieldTraits: [...fieldTraits],
  };
}

function directDamageRelevant(effect: MasterEffect, origin: ResolvedEffect['origin']) {
  const npDamageBuffRateEffect =
    effect.buffTypes?.includes('buffRate') && effect.buffRateTargets?.includes('buffNpDamageUp');
  return (
    damageEffectRoute(effect, origin) !== null ||
    Boolean(targetRecipient(origin, effect.target) === 'attacker' && npDamageBuffRateEffect) ||
    (targetRecipient(origin, effect.target) !== null && isPotentiallyDamageRelevant(effect))
  );
}

function consumedConditionTraits(items: readonly EffectSource[]) {
  const traits = new Set<string>();
  for (const item of items) {
    if (!directDamageRelevant(item.effect, item.origin)) continue;
    for (const condition of [
      ...item.effect.conditions.recipient,
      item.effect.conditions.holder,
      item.effect.conditions.opponent,
      item.effect.conditions.field,
    ])
      for (const trait of condition.traits) traits.add(trait.name);
  }
  return traits;
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
  const context = resolveBattleContext(baseInput, items, options);
  const consumedTraits = consumedConditionTraits(items);
  for (const item of items) {
    const { effect, rawValue } = item;
    const route = damageEffectRoute(effect, item.origin);
    const kind = route?.kind ?? null;
    const npDamageBuffRateEffect =
      effect.buffTypes?.includes('buffRate') && effect.buffRateTargets?.includes('buffNpDamageUp');
    const key = effectKey(item);
    const override = options.effectOverrides?.[key];
    const enabled = override ?? item.defaultEnabled;
    const conditionAsserted = override === true || item.conditionAsserted === true;
    const value =
      rawValue === undefined ? null : kind === 'flatDamage' ? rawValue : rawValue / 1000;
    const signedValue = value === null ? null : value * (route?.sign ?? 1);
    const directRelevant = directDamageRelevant(effect, item.origin);
    const contextRelevant = [
      ...effect.contextChanges.addedFieldTraits,
      ...effect.contextChanges.addedRecipientTraits,
    ].some((trait) => consumedTraits.has(trait));
    const routedDamageRelevant = directRelevant || contextRelevant;
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
      valuePermille:
        kind === 'flatDamage'
          ? null
          : rawValue === undefined
            ? null
            : rawValue * (route?.sign ?? 1),
      kind,
      damageTraitCondition:
        kind === 'powerMod' &&
        route?.recipient === 'attacker' &&
        effect.conditions.opponent.traits.length > 0
          ? ({
              kind: 'powerMod',
              condition: effect.conditions.opponent,
            } satisfies DamageTraitCondition)
          : null,
      requiredFieldTraits: effect.conditions.field.traits.map((trait) => trait.name),
      contextChanges: effect.contextChanges,
      damageRelevant: routedDamageRelevant,
    };
    if (kind === 'cardBuff' && !effect.cardTypes.includes(baseInput.cardType)) {
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'rejected',
        reason: 'card_type_mismatch',
      });
      continue;
    }
    if (!enabled) {
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'rejected',
        reason: 'calculation_effect_disabled',
      });
      continue;
    }
    if (!routedDamageRelevant) {
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'rejected',
        reason: 'not_np_damage_relevant',
      });
      continue;
    }
    const conditionResult = effectConditionsMatch(baseInput, item, context, conditionAsserted);
    if (conditionResult === null) {
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'unsupported',
        reason: 'trait_condition_operator_not_supported',
      });
      precision = 'unsupported';
      warnings.push(
        `${item.origin}_effect_condition_not_resolved:${item.sourceId}:${item.skillId}:${effect.id}`,
      );
      continue;
    }
    if (!conditionResult) {
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'rejected',
        reason: 'trait_condition_mismatch',
      });
      continue;
    }
    if (contextRelevant && !directRelevant) {
      effects.push({
        ...effectIdentity,
        value: null,
        state: 'applied',
        reason: 'battle_context_applied',
      });
      continue;
    }
    const requiresNumericValue =
      (kind !== null && kind !== 'ignoreDefense' && kind !== 'ignoreDamageCut') ||
      Boolean(npDamageBuffRateEffect);
    if (rawValue === undefined && directRelevant && requiresNumericValue) {
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
    const unresolvedParameterKeys = [
      ...new Set(
        effect.parameterSets.flatMap((parameters) =>
          parameters.flatMap((parameter) =>
            Object.keys(parameter).filter((key) => !RESOLVED_EFFECT_PARAMETER_KEYS.has(key)),
          ),
        ),
      ),
    ].sort();
    if (directRelevant && unresolvedParameterKeys.length > 0) {
      precision = 'unsupported';
      warnings.push(
        `${item.origin}_effect_parameter_semantics_not_resolved:${item.sourceId}:${item.skillId}:${effect.id}:${unresolvedParameterKeys.join(',')}`,
      );
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'unsupported',
        reason: 'effect_parameter_semantics_not_resolved',
      });
      continue;
    }
    const unresolvedMetadata =
      (effect.functionScript && Object.keys(effect.functionScript).length > 0) ||
      (effect.overwriteTargetValues?.length ?? 0) > 0;
    if (directRelevant && unresolvedMetadata) {
      precision = 'unsupported';
      warnings.push(
        `${item.origin}_effect_metadata_not_resolved:${item.sourceId}:${item.skillId}:${effect.id}`,
      );
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'unsupported',
        reason: 'effect_metadata_not_resolved',
      });
      continue;
    }
    if (npDamageBuffRateEffect && value !== null) {
      npDamageBuffRate = Math.max(npDamageBuffRate, value);
      effects.push({
        ...effectIdentity,
        value: signedValue,
        state: 'applied',
        reason: 'np_damage_buff_rate',
      });
      continue;
    }
    if (kind) {
      effects.push({
        ...effectIdentity,
        value: signedValue,
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
      value: signedValue,
      kind: null,
      state: damageRelevant ? 'unsupported' : 'rejected',
      reason: damageRelevant ? 'damage_effect_not_supported' : 'not_np_damage_relevant',
    });
  }

  const modifierPermilles: Record<Exclude<ResolvedBuffKind, 'flatDamage'>, number> = {
    attackBuff: 0,
    defenseBuff: 0,
    cardBuff: 0,
    cardResistance: 0,
    npDamageBuff: 0,
    npResistance: 0,
    ignoreDefense: 0,
    ignoreDamageCut: 0,
    eventDamageBuff: 0,
    specialDamageBuff: 0,
    powerMod: 0,
  };
  let flatDamage = 0;
  for (const effect of effects) {
    if (effect.state !== 'applied' || !effect.kind || effect.reason === 'np_damage_buff_rate')
      continue;
    if (effect.kind === 'flatDamage') flatDamage += effect.value ?? 0;
    else if (effect.kind === 'ignoreDefense') modifierPermilles.ignoreDefense = 1;
    else if (effect.kind === 'ignoreDamageCut') modifierPermilles.ignoreDamageCut = 1;
    else modifierPermilles[effect.kind] += effect.valuePermille ?? 0;
  }
  const aggregatedInput = {
    ...baseInput,
    fieldTraits: [...context.fieldTraits],
    attackBuff: baseInput.attackBuff + modifierPermilles.attackBuff / 1_000,
    defenseBuff: baseInput.defenseBuff + modifierPermilles.defenseBuff / 1_000,
    cardBuff: baseInput.cardBuff + modifierPermilles.cardBuff / 1_000,
    cardResistance: baseInput.cardResistance + modifierPermilles.cardResistance / 1_000,
    npDamageBuff: baseInput.npDamageBuff + modifierPermilles.npDamageBuff / 1_000,
    npResistance: baseInput.npResistance + modifierPermilles.npResistance / 1_000,
    eventDamageBuff: baseInput.eventDamageBuff + modifierPermilles.eventDamageBuff / 1_000,
    specialDamageBuff: baseInput.specialDamageBuff + modifierPermilles.specialDamageBuff / 1_000,
    powerMod: baseInput.powerMod + modifierPermilles.powerMod / 1_000,
    flatDamage: baseInput.flatDamage + flatDamage,
    ignoreDamageCut: baseInput.ignoreDamageCut || modifierPermilles.ignoreDamageCut > 0,
    damageFunction:
      baseInput.damageFunction.status === 'resolved' && modifierPermilles.ignoreDefense > 0
        ? { ...baseInput.damageFunction, ignoreDefense: true }
        : baseInput.damageFunction,
  };
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
  const attackerTraits = servantById.get(baseInput.attackerId)?.traits ?? [];
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
        conditionAsserted: selected.selectedEffectIds?.includes(effect.id) ?? false,
        attackerTraits,
      });
    }
  }

  return { items, warnings };
}

export interface ScenarioEffectResolution extends EffectResolution {
  trace: { step: string; detail: string }[];
}

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function resolveScenarioEffects(
  baseInput: DamageResolutionInput,
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
): ScenarioEffectResolution {
  const attacker = master.servants.find((candidate) => candidate.id === baseInput.attackerId);
  const attackerTraits = attacker?.traits ?? [];
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
  if (scenario.craftEssence) {
    const craftEssence = master.craftEssences.find(
      (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
    );
    if (!craftEssence)
      warnings.push(`craftEssence_source_missing:${scenario.craftEssence.craftEssenceId}`);
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
          rawValue: numericParameter(effect, 0, 0, scenario.craftEssence?.limitBreak === 4),
          appliedReason:
            scenario.craftEssence?.limitBreak === 4 ? 'limit_break_effect' : 'craft_essence_effect',
          defaultEnabled: true,
          attackerTraits,
        })),
      );
  }
  append(
    collectSkillSelections(
      baseInput,
      scenario.attackerSkills.map((skill, order) => ({
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
  if (scenario.mysticCode) {
    const mysticCode = master.mysticCodes.find(
      (candidate) => candidate.id === scenario.mysticCode?.mysticCodeId,
    );
    if (!mysticCode) warnings.push(`mysticCode_source_missing:${scenario.mysticCode.mysticCodeId}`);
    else
      for (const selected of scenario.mysticCode.skills) {
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
            attackerTraits,
          })),
        );
      }
  }
  if (scenario.support) {
    const composition = scenario.support.composition;
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
            attackerTraits,
          })),
      );
  }
  const orderedItems = items.map((item, order) => ({ ...item, order }));
  const resolved = resolveEffectSources(baseInput, orderedItems, {
    effectOverrides: scenario.effectDecisions,
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
