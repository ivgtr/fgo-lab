import {
  COMBAT_ATTRIBUTE_IDS,
  COMBAT_CARD_IDS,
  COMBAT_CLASS_IDS,
  type RawCombatRules,
} from '@fgo-lab/data-pipeline';

export type NiceCombatRuleExports = {
  classAttackRate: unknown;
  classRelation: unknown;
  attributeRelation: unknown;
  card: unknown;
  constant: unknown;
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`combat_parity:expected_object:${path}`);
  return value as Record<string, unknown>;
}

function check(value: unknown, expected: number, path: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new TypeError(`combat_parity:invalid_cell:${path}`);
  const expectedPermille = Math.round(expected * 1000);
  if (value !== expectedPermille)
    throw new TypeError(`combat_parity:mismatch:${path}:${value}:${expectedPermille}`);
}

/** This proves only the 335 currently consumed numeric cells, not source completeness. */
export function compareCombatRules(
  raw: RawCombatRules,
  nice: NiceCombatRuleExports,
): { scope: 'combat-coefficients-only'; comparedCells: number } {
  const attack = object(nice.classAttackRate, 'NiceClassAttackRate');
  const classRelations = object(nice.classRelation, 'NiceClassRelation');
  const attributeRelations = object(nice.attributeRelation, 'NiceAttributeRelation');
  const cards = object(nice.card, 'NiceCard');
  const constants = object(nice.constant, 'NiceConstant');
  let comparedCells = 0;
  for (const name of Object.keys(COMBAT_CLASS_IDS) as (keyof typeof COMBAT_CLASS_IDS)[]) {
    check(attack[name], raw.classAttackRate[name], `NiceClassAttackRate.${name}`);
    comparedCells++;
    const relation = object(classRelations[name], `NiceClassRelation.${name}`);
    for (const target of Object.keys(COMBAT_CLASS_IDS) as (keyof typeof COMBAT_CLASS_IDS)[]) {
      check(
        relation[target],
        raw.classAffinity[name][target],
        `NiceClassRelation.${name}.${target}`,
      );
      comparedCells++;
    }
  }
  const atlasAttribute = {
    man: 'human',
    sky: 'sky',
    earth: 'earth',
    star: 'star',
    beast: 'beast',
  } as const;
  for (const name of Object.keys(COMBAT_ATTRIBUTE_IDS) as (keyof typeof COMBAT_ATTRIBUTE_IDS)[]) {
    const relation = object(
      attributeRelations[atlasAttribute[name]],
      `NiceAttributeRelation.${atlasAttribute[name]}`,
    );
    for (const target of Object.keys(
      COMBAT_ATTRIBUTE_IDS,
    ) as (keyof typeof COMBAT_ATTRIBUTE_IDS)[]) {
      check(
        relation[atlasAttribute[target]],
        raw.attributeAffinity[name][target],
        `NiceAttributeRelation.${atlasAttribute[name]}.${atlasAttribute[target]}`,
      );
      comparedCells++;
    }
  }
  for (const [name, id] of Object.entries(COMBAT_CARD_IDS) as [
    keyof typeof COMBAT_CARD_IDS,
    number,
  ][]) {
    const card = object(cards[String(id)], `NiceCard.${id}`);
    const first = object(card['1'], `NiceCard.${id}.1`);
    check(first.adjustAtk, raw.cardAttackRate[name], `NiceCard.${id}.1.adjustAtk`);
    comparedCells++;
  }
  check(constants.ATTACK_RATE, raw.damageConstant, 'NiceConstant.ATTACK_RATE');
  comparedCells++;
  return { scope: 'combat-coefficients-only', comparedCells };
}
