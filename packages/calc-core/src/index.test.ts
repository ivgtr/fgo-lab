import { describe, expect, it } from 'vitest';
import type { CalcInput, VersionContext } from '@fgo-lab/schema';
import golden from '../../test-fixtures/golden/np-damage-v1.json';
import {
  calculateNpDamage,
  damageAtRandom,
  f32Add,
  matchTraits,
  ATTACK_NP_FUNCTION_TYPES,
  resolveAttackNpFunction,
} from './index';

const input: CalcInput = {
  attackerId: 'fixture-saber',
  attackerLevel: 90,
  attackerAtk: 10000,
  fouAtk: 1000,
  craftEssenceId: 'fixture-ce',
  craftEssenceAtk: 1000,
  npLevel: 1,
  overcharge: 1,
  npMultipliers: [300, 400, 450, 475, 500],
  cardType: 'buster',
  classAttackRate: 1,
  classAffinity: 2,
  attributeAffinity: 1,
  attackBuff: 0.2,
  cardBuff: 0.2,
  npDamageBuff: 0.2,
  powerMod: 0,
  npSpecialMultiplier: 1,
  specialResistance: 0,
  flatDamage: 0,
  target: { classId: 'lancer', attribute: 'earth', traits: ['dragon', 'male'] },
};
const versions: VersionContext = {
  schemaVersion: 1,
  masterDataVersion: 'fixture-1',
  engineVersion: '1.0.0',
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
};

describe('float32 NP damage kernel', () => {
  it('rounds at primitive boundaries', () =>
    expect(f32Add(0.1, 0.2)).toBe(Math.fround(Math.fround(0.1) + Math.fround(0.2))));
  it('evaluates all five levels and the exact random endpoints', () => {
    const result = calculateNpDamage(input, versions);
    expect(result.results).toHaveLength(5);
    expect(result.results[0]?.minimum).toBe(damageAtRandom(input, 1, 900));
    expect(result.results[0]?.maximum).toBe(damageAtRandom(input, 1, 1099));
    expect(result.results[4]!.average).toBeGreaterThan(result.results[0]!.average);
  });
  it('matches the independent neutral Arts formula at random 1000', () => {
    const neutral: CalcInput = {
      ...input,
      attackerAtk: 10_000,
      fouAtk: 0,
      craftEssenceAtk: 0,
      npMultipliers: [1000, 1000, 1000, 1000, 1000],
      cardType: 'arts',
      classAffinity: 1,
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
    };
    expect(damageAtRandom(neutral, 1, 1000)).toBe(golden.expectedDamage);
  });
  it('is deterministic', () =>
    expect(calculateNpDamage(input, versions)).toEqual(calculateNpDamage(input, versions)));
  it('fails closed for unknown functions', () =>
    expect(
      resolveAttackNpFunction('futureDamage', { baseMultiplier: 1, matchedTraitCount: 0 })
        .precision,
    ).toBe('unsupported'));
  it.each(ATTACK_NP_FUNCTION_TYPES)('classifies the registered %s handler', (type) => {
    const resolved = resolveAttackNpFunction(type, {
      baseMultiplier: 1,
      matchedTraitCount: 2,
      hpRatio: 0.5,
      battlePointPhase: 1,
    });
    expect(resolved.precision).not.toBe('unsupported');
    if (type === 'damageNp') expect(resolved.precision).toBe('exact');
    else expect(resolved.precision).toBe('approximate');
  });
  it('requires conditional inputs instead of silently using base damage', () => {
    expect(
      resolveAttackNpFunction('damageNpHpratioLow', {
        baseMultiplier: 1,
        matchedTraitCount: 0,
      }),
    ).toMatchObject({ precision: 'unsupported', warning: 'missing_hp_ratio' });
    expect(
      resolveAttackNpFunction('damageNpBattlePointPhase', {
        baseMultiplier: 1,
        matchedTraitCount: 0,
      }),
    ).toMatchObject({ precision: 'unsupported', warning: 'missing_battle_point_phase' });
  });
  it('evaluates AND/OR trait expressions', () =>
    expect(
      matchTraits(['dragon', 'male'], {
        type: 'and',
        items: [
          { type: 'trait', trait: 'dragon' },
          { type: 'trait', trait: 'male' },
        ],
      }).matches,
    ).toBe(true));
});
