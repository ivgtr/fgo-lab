import { combatRulesSchema } from '@fgo-lab/master-data';
import { canonicalTargetAttributeSchema, canonicalTargetClassIdSchema } from '@fgo-lab/schema';

const classes = canonicalTargetClassIdSchema.options;
const attributes = canonicalTargetAttributeSchema.options;

export const neutralCombatRules = combatRulesSchema.parse({
  classAttackRate: Object.fromEntries(classes.map((name) => [name, 1])),
  classAffinity: Object.fromEntries(
    classes.map((name) => [name, Object.fromEntries(classes.map((target) => [target, 1]))]),
  ),
  attributeAffinity: Object.fromEntries(
    attributes.map((name) => [name, Object.fromEntries(attributes.map((target) => [target, 1]))]),
  ),
  cardAttackRate: { arts: 1, buster: 1.5, quick: 0.8 },
  damageConstant: 0.23,
});

const attributeNames = {
  man: 'human',
  sky: 'sky',
  earth: 'earth',
  star: 'star',
  beast: 'beast',
} as const;
export const neutralNiceCombatRuleExports = {
  NiceClassAttackRate: Object.fromEntries(classes.map((name) => [name, 1000])),
  NiceClassRelation: Object.fromEntries(
    classes.map((name) => [name, Object.fromEntries(classes.map((target) => [target, 1000]))]),
  ),
  NiceAttributeRelation: Object.fromEntries(
    attributes.map((name) => [
      attributeNames[name],
      Object.fromEntries(attributes.map((target) => [attributeNames[target], 1000])),
    ]),
  ),
  NiceCard: {
    '1': { '1': { adjustAtk: 1000 } },
    '2': { '1': { adjustAtk: 1500 } },
    '3': { '1': { adjustAtk: 800 } },
  },
  NiceConstant: { ATTACK_RATE: 230 },
};
