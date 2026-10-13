import { combatRulesSchema, type CombatRules } from '@fgo-lab/master-data';
import { COMBAT_ATTRIBUTE_IDS, COMBAT_CARD_IDS, COMBAT_CLASS_IDS } from './rawCombatRules';

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`nice_combat_rules:expected_object:${path}`);
  return value as Record<string, unknown>;
}

function ratio(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 5000)
    throw new TypeError(`nice_combat_rules:invalid_ratio:${path}`);
  return value / 1000;
}

const atlasAttribute = {
  man: 'human',
  sky: 'sky',
  earth: 'earth',
  star: 'star',
  beast: 'beast',
} as const;

/** Only the known numeric identities that the current damage model can execute. */
export function normalizeNiceCombatRules(input: {
  classAttackRate: unknown;
  classRelation: unknown;
  attributeRelation: unknown;
  card: unknown;
  constant: unknown;
}): CombatRules {
  const attack = record(input.classAttackRate, 'NiceClassAttackRate');
  const classes = record(input.classRelation, 'NiceClassRelation');
  const attributes = record(input.attributeRelation, 'NiceAttributeRelation');
  const cards = record(input.card, 'NiceCard');
  const constants = record(input.constant, 'NiceConstant');
  const classNames = Object.keys(COMBAT_CLASS_IDS) as (keyof typeof COMBAT_CLASS_IDS)[];
  const attributeNames = Object.keys(COMBAT_ATTRIBUTE_IDS) as (keyof typeof COMBAT_ATTRIBUTE_IDS)[];
  return combatRulesSchema.parse({
    classAttackRate: Object.fromEntries(
      classNames.map((name) => [name, ratio(attack[name], `NiceClassAttackRate.${name}`)]),
    ),
    classAffinity: Object.fromEntries(
      classNames.map((name) => {
        const row = record(classes[name], `NiceClassRelation.${name}`);
        return [
          name,
          Object.fromEntries(
            classNames.map((target) => [
              target,
              ratio(row[target], `NiceClassRelation.${name}.${target}`),
            ]),
          ),
        ];
      }),
    ),
    attributeAffinity: Object.fromEntries(
      attributeNames.map((name) => {
        const row = record(attributes[atlasAttribute[name]], `NiceAttributeRelation.${name}`);
        return [
          name,
          Object.fromEntries(
            attributeNames.map((target) => [
              target,
              ratio(row[atlasAttribute[target]], `NiceAttributeRelation.${name}.${target}`),
            ]),
          ),
        ];
      }),
    ),
    cardAttackRate: Object.fromEntries(
      (Object.entries(COMBAT_CARD_IDS) as [keyof typeof COMBAT_CARD_IDS, number][]).map(
        ([name, id]) => {
          const card = record(cards[String(id)], `NiceCard.${String(id)}`);
          const first = record(card['1'], `NiceCard.${String(id)}.1`);
          return [name, ratio(first['adjustAtk'], `NiceCard.${String(id)}.1.adjustAtk`)];
        },
      ),
    ),
    damageConstant: ratio(constants['ATTACK_RATE'], 'NiceConstant.ATTACK_RATE'),
  });
}
