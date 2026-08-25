import type { DamageResolutionInput } from '@fgo-lab/schema';

export type CombatAttribute = DamageResolutionInput['target']['attribute'];

const CLASS_ORDER = [
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

export function classAttackRate(classId: string): number {
  return CLASS_ATTACK_RATES[classId] ?? 1;
}

export function classAffinity(attackerClassId: string, targetClassId: string): number {
  const targetIndex = CLASS_ORDER.indexOf(targetClassId as (typeof CLASS_ORDER)[number]);
  return targetIndex < 0 ? 1 : (CLASS_RELATIONS[attackerClassId]?.[targetIndex] ?? 1);
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
): number {
  if (attackerAttribute === 'unknown' || targetAttribute === 'unknown') return 1;
  return ATTRIBUTE_RELATIONS[attackerAttribute][targetAttribute];
}
