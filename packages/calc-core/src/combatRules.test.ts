import { describe, expect, it } from 'vitest';
import { combatRulesSchema } from '@fgo-lab/master-data';
import type { DamageKernelInput } from '@fgo-lab/schema';
import {
  CANONICAL_TARGET_ATTRIBUTES,
  CANONICAL_TARGET_CLASS_IDS,
  availableTargetClassRelations,
  calculateDamagePoint,
  classAffinity,
  classAttackRate,
  targetClassCandidates,
} from './index';

const classes = CANONICAL_TARGET_CLASS_IDS;
const attributes = CANONICAL_TARGET_ATTRIBUTES;
const neutral = combatRulesSchema.parse({
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
const kernel: DamageKernelInput = {
  totalAtk: 12_000,
  npMultiplierPermille: 3_000,
  card: 'buster',
  classAttackRatePermille: 1_000,
  classAffinityPermille: 1_000,
  attributeAffinityPermille: 1_000,
  attackModifierPermille: 0,
  cardModifierPermille: 0,
  npPowerModifierPermille: 0,
  specialModifierPermille: 1_000,
  npSpecialMultiplierPermille: 1_000,
  flatDamage: 0,
  damageCut: 0,
  ignoreDamageCut: false,
  ignoreDefense: false,
};

describe('master-derived combat coefficients', () => {
  it('uses changed class cells for relative target candidates', () => {
    const changed = combatRulesSchema.parse({
      ...neutral,
      classAttackRate: { ...neutral.classAttackRate, saber: 1.25 },
      classAffinity: {
        ...neutral.classAffinity,
        saber: { ...neutral.classAffinity.saber, lancer: 2 },
      },
    });
    expect(classAttackRate('saber', changed)).toBe(1.25);
    expect(classAffinity('saber', 'lancer', changed)).toBe(2);
    expect(availableTargetClassRelations('saber', changed)).toContain('advantage2');
    expect(
      targetClassCandidates('saber', { kind: 'relative', relation: 'advantage2' }, changed),
    ).toContain('lancer');
    expect(() => classAttackRate('unknown', changed)).toThrow('unknown_class_attack_rate');
  });

  it('uses changed card and constant cells in the damage kernel', () => {
    const baseline = calculateDamagePoint(kernel, 1_000, neutral);
    const cardChanged = combatRulesSchema.parse({
      ...neutral,
      cardAttackRate: { ...neutral.cardAttackRate, buster: 2 },
    });
    const constantChanged = combatRulesSchema.parse({ ...neutral, damageConstant: 0.46 });
    expect(calculateDamagePoint(kernel, 1_000, cardChanged)).toBeGreaterThan(baseline);
    expect(calculateDamagePoint(kernel, 1_000, constantChanged)).toBeGreaterThan(baseline);
  });
});
