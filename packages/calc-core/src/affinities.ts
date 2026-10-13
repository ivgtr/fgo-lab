import type {
  CanonicalTargetAttribute,
  CanonicalTargetClassId,
  TargetAttributeContext,
  TargetClassContext,
} from '@fgo-lab/schema';
import type { CombatRules } from '@fgo-lab/master-data';

export type CombatAttribute = CanonicalTargetAttribute | 'unknown';
export type RelativeTargetClassRelation = Extract<
  TargetClassContext,
  { kind: 'relative' }
>['relation'];
export type RelativeTargetAttributeRelation = Extract<
  TargetAttributeContext,
  { kind: 'relative' }
>['relation'];

const CLASS_AFFINITY_BY_RELATION = {
  advantage2: 2,
  advantage15: 1.5,
  neutral: 1,
  disadvantage: 0.5,
} as const satisfies Readonly<Record<RelativeTargetClassRelation, number>>;

const ATTRIBUTE_AFFINITY_BY_RELATION = {
  advantage: 1.1,
  neutral: 1,
  disadvantage: 0.9,
} as const satisfies Readonly<Record<RelativeTargetAttributeRelation, number>>;

export function classRelationFromMultiplier(value: number): RelativeTargetClassRelation {
  const entry = Object.entries(CLASS_AFFINITY_BY_RELATION).find(
    ([, multiplier]) => multiplier === value,
  );
  if (!entry) throw new RangeError(`invalid_class_affinity:${String(value)}`);
  return entry[0] as RelativeTargetClassRelation;
}

export function attributeRelationFromMultiplier(value: number): RelativeTargetAttributeRelation {
  const entry = Object.entries(ATTRIBUTE_AFFINITY_BY_RELATION).find(
    ([, multiplier]) => multiplier === value,
  );
  if (!entry) throw new RangeError(`invalid_attribute_affinity:${String(value)}`);
  return entry[0] as RelativeTargetAttributeRelation;
}

export const CANONICAL_TARGET_CLASS_IDS = [
  'saber',
  'archer',
  'lancer',
  'rider',
  'caster',
  'assassin',
  'berserker',
  'shielder',
  'ruler',
  'alterEgo',
  'avenger',
  'moonCancer',
  'foreigner',
  'pretender',
  'beast',
  'beastEresh',
  'unBeastOlgaMarie',
] as const;

const CLASS_ATTACK_RATES: Readonly<Record<string, number>> = {
  saber: 1,
  archer: 0.95,
  lancer: 1.05,
  rider: 1,
  caster: 0.9,
  assassin: 0.9,
  berserker: 1.1,
  shielder: 1,
  ruler: 1.1,
  alterEgo: 1,
  avenger: 1.1,
  moonCancer: 1,
  foreigner: 1,
  pretender: 1,
  beast: 1,
  beastEresh: 1,
  unBeastOlgaMarie: 1,
};

// Atlas Academy NiceClassRelation values, normalized from per-mille to ratios.
const CLASS_RELATIONS: Readonly<Record<string, readonly number[]>> = {
  saber: [1, 0.5, 2, 1, 1, 1, 2, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5],
  archer: [2, 1, 0.5, 1, 1, 1, 2, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5],
  lancer: [0.5, 2, 1, 1, 1, 1, 2, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5],
  rider: [1, 1, 1, 1, 2, 0.5, 2, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5],
  caster: [1, 1, 1, 0.5, 1, 2, 2, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5],
  assassin: [1, 1, 1, 2, 0.5, 1, 2, 1, 0.5, 1, 1, 1, 1, 1, 0.5, 1, 0.5],
  berserker: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 1.5, 1.5, 1.5, 1.5, 0.5, 1.5, 0.5, 1, 1.5],
  shielder: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ruler: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0.5, 2, 1, 1, 2, 0.5, 1],
  alterEgo: [0.5, 0.5, 0.5, 1.5, 1.5, 1.5, 2, 1, 1, 1, 1, 1, 2, 0.5, 2, 0.5, 1],
  avenger: [1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 0.5, 1, 1, 2, 2, 2],
  moonCancer: [1, 1, 1, 1, 1, 1, 2, 1, 0.5, 1, 2, 1, 1, 1, 2, 0.5, 0.5],
  foreigner: [1, 1, 1, 1, 1, 1, 2, 1, 1, 0.5, 1, 1, 2, 2, 2, 0.5, 2],
  pretender: [1.5, 1.5, 1.5, 0.5, 0.5, 0.5, 2, 1, 1, 2, 1, 1, 0.5, 1, 2, 0.5, 1],
  beast: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 2, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 1, 1],
  beastEresh: [1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1.5, 0.5, 1.5, 1.5, 1.5, 1, 1, 1],
  unBeastOlgaMarie: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0.5, 2, 2, 1, 1, 1, 1],
};

const ATTRIBUTE_RELATIONS: Readonly<
  Record<
    Exclude<CombatAttribute, 'unknown'>,
    Readonly<Record<Exclude<CombatAttribute, 'unknown'>, number>>
  >
> = {
  man: { man: 1, sky: 1.1, earth: 0.9, star: 1, beast: 1 },
  sky: { man: 0.9, sky: 1, earth: 1.1, star: 1, beast: 1 },
  earth: { man: 1.1, sky: 0.9, earth: 1, star: 1, beast: 1 },
  star: { man: 1, sky: 1, earth: 1, star: 1, beast: 1.1 },
  beast: { man: 1, sky: 1, earth: 1, star: 1.1, beast: 1 },
};

export function classAttackRate(classId: string, rules?: CombatRules): number {
  if (rules) {
    if (!Object.hasOwn(rules.classAttackRate, classId))
      throw new RangeError(`unknown_class_attack_rate:${classId}`);
    return rules.classAttackRate[classId as CanonicalTargetClassId];
  }
  return CLASS_ATTACK_RATES[classId] ?? 1;
}

export function classAffinity(
  attackerClassId: string,
  targetClassId: string,
  rules?: CombatRules,
): number {
  if (rules) {
    if (
      !Object.hasOwn(rules.classAffinity, attackerClassId) ||
      !Object.hasOwn(rules.classAffinity[attackerClassId as CanonicalTargetClassId], targetClassId)
    )
      throw new RangeError(`unknown_class_affinity:${attackerClassId}:${targetClassId}`);
    return rules.classAffinity[attackerClassId as CanonicalTargetClassId][
      targetClassId as CanonicalTargetClassId
    ];
  }
  const targetIndex = CANONICAL_TARGET_CLASS_IDS.indexOf(targetClassId as CanonicalTargetClassId);
  return targetIndex < 0 ? 1 : (CLASS_RELATIONS[attackerClassId]?.[targetIndex] ?? 1);
}

export function targetClassCandidates(
  attackerClassId: string,
  context: TargetClassContext,
  rules?: CombatRules,
): readonly CanonicalTargetClassId[] {
  if (context.kind === 'concrete') return [context.classId];
  const expected = CLASS_AFFINITY_BY_RELATION[context.relation];
  return CANONICAL_TARGET_CLASS_IDS.filter(
    (targetClassId) => classAffinity(attackerClassId, targetClassId, rules) === expected,
  );
}

export function availableTargetClassRelations(
  attackerClassId: string,
  rules?: CombatRules,
): readonly RelativeTargetClassRelation[] {
  const candidates = [
    ['advantage2', 2],
    ['advantage15', 1.5],
    ['neutral', 1],
    ['disadvantage', 0.5],
  ] as const;
  return candidates.flatMap(([relation, affinity]) =>
    CANONICAL_TARGET_CLASS_IDS.some(
      (targetClassId) => classAffinity(attackerClassId, targetClassId, rules) === affinity,
    )
      ? [relation]
      : [],
  );
}

export function defaultTargetClassRelation(
  attackerClassId: string,
  rules?: CombatRules,
): RelativeTargetClassRelation {
  const available = availableTargetClassRelations(attackerClassId, rules);
  if (available.includes('advantage2')) return 'advantage2';
  if (available.includes('advantage15')) return 'advantage15';
  return 'neutral';
}

export function resolveClassAffinity(
  attackerClassId: string,
  context: TargetClassContext,
  rules?: CombatRules,
): number {
  if (context.kind === 'concrete') return classAffinity(attackerClassId, context.classId, rules);
  return CLASS_AFFINITY_BY_RELATION[context.relation];
}

export function servantAttribute(traits: readonly string[]): CombatAttribute {
  if (traits.includes('attributeHuman')) return 'man';
  if (traits.includes('attributeEarth')) return 'earth';
  if (traits.includes('attributeSky')) return 'sky';
  if (traits.includes('attributeStar')) return 'star';
  if (traits.includes('attributeBeast')) return 'beast';
  return 'unknown';
}

export function attributeAffinity(
  attackerAttribute: CombatAttribute,
  targetAttribute: CombatAttribute,
  rules?: CombatRules,
): number {
  if (attackerAttribute === 'unknown' || targetAttribute === 'unknown') return 1;
  return rules
    ? rules.attributeAffinity[attackerAttribute][targetAttribute]
    : ATTRIBUTE_RELATIONS[attackerAttribute][targetAttribute];
}

export const CANONICAL_TARGET_ATTRIBUTES = [
  'man',
  'earth',
  'sky',
  'star',
  'beast',
] as const satisfies readonly CanonicalTargetAttribute[];

export function targetAttributeCandidates(
  attackerAttribute: CombatAttribute,
  context: TargetAttributeContext,
  rules?: CombatRules,
): readonly CanonicalTargetAttribute[] {
  if (context.kind === 'concrete') return [context.attribute];
  const expected = ATTRIBUTE_AFFINITY_BY_RELATION[context.relation];
  return CANONICAL_TARGET_ATTRIBUTES.filter(
    (attribute) => attributeAffinity(attackerAttribute, attribute, rules) === expected,
  );
}

export function resolveAttributeAffinity(
  attackerAttribute: CombatAttribute,
  context: TargetAttributeContext,
  rules?: CombatRules,
): number {
  if (context.kind === 'concrete')
    return attributeAffinity(attackerAttribute, context.attribute, rules);
  return ATTRIBUTE_AFFINITY_BY_RELATION[context.relation];
}
