import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeRawCombatRules } from './rawCombatRules';

// Atlas raw JP commit 5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c,
// limited to the 17 currently meaningful classes and their 289 pairings.
type Fixture = {
  mstClass: (Record<string, unknown> & {
    id: number;
    attackRate: number;
    relationSvtIndividuality: number[];
  })[];
  mstClassRelation: (Record<string, unknown> & { attackRate: number })[];
  mstAttriRelation: Record<string, unknown>[];
  mstCard: Record<string, unknown>[];
  mstConstant: Record<string, unknown>[];
};
const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../test-fixtures/raw-combat-rules-5d3cbc.json', import.meta.url)),
    'utf8',
  ),
) as Fixture;

function changed(mutator: (value: Fixture) => void): Fixture {
  const value = structuredClone(fixture);
  mutator(value);
  return value;
}

describe('raw combat rule normalization', () => {
  it('reads the fixed Atlas numeric rules in their raw units', () => {
    const rules = normalizeRawCombatRules(fixture);
    expect(Object.keys(rules.classAttackRate)).toHaveLength(17);
    expect(Object.values(rules.classAffinity).flatMap(Object.values)).toHaveLength(289);
    expect(Object.values(rules.attributeAffinity).flatMap(Object.values)).toHaveLength(25);
    expect(rules.classAttackRate.lancer).toBe(1.05);
    expect(rules.classAttackRate.caster).toBe(0.9);
    expect(rules.classAffinity.saber.lancer).toBe(2);
    expect(rules.classAffinity.berserker.foreigner).toBe(0.5);
    expect(rules.classAffinity.beastEresh.ruler).toBe(1.5);
    expect(rules.attributeAffinity.earth.man).toBe(1.1);
    expect(rules.attributeAffinity.earth.sky).toBe(0.9);
    expect(rules.cardAttackRate).toEqual({ arts: 1, buster: 1.5, quick: 0.8 });
    expect(rules.damageConstant).toBe(0.23);
  });

  it('accepts a known value change without updating code', () => {
    const input = changed((value) => {
      value.mstClass.find((row) => row.id === 3)!.attackRate = 1060;
    });
    expect(normalizeRawCombatRules(input).classAttackRate.lancer).toBe(1.06);
  });

  it('rejects missing pairs, duplicate rows and unknown fields', () => {
    expect(() =>
      normalizeRawCombatRules(
        changed((value) => {
          value.mstClassRelation.pop();
        }),
      ),
    ).toThrow(/missing_key/);
    expect(() =>
      normalizeRawCombatRules(
        changed((value) => {
          value.mstCard.push(value.mstCard[0]!);
        }),
      ),
    ).toThrow(/duplicate_key/);
    expect(() =>
      normalizeRawCombatRules(
        changed((value) => {
          value.mstConstant[0]!.futureField = 1;
        }),
      ),
    ).toThrow(/unknown_field/);
    expect(() =>
      normalizeRawCombatRules(
        changed((value) => {
          (value.mstClass[0]! as Record<string, unknown>).relationSvtIndividuality = ['invalid'];
        }),
      ),
    ).toThrow(/invalid_integer_array/);
  });

  it('accepts new positive class and attribute coefficients', () => {
    const input = changed((value) => {
      value.mstClassRelation[0]!.attackRate = 1750;
      value.mstAttriRelation[0]!.attackRate = 1050;
    });
    const rules = normalizeRawCombatRules(input);
    expect(Object.values(rules.classAffinity).flatMap(Object.values)).toContain(1.75);
    expect(Object.values(rules.attributeAffinity).flatMap(Object.values)).toContain(1.05);
  });
});
