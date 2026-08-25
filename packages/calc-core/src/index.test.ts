import { describe, expect, it } from 'vitest';
import type { DamageKernelInput, DamageResolutionInput } from '@fgo-lab/schema';
import { damageKernelInputSchema } from '@fgo-lab/schema';
import golden from '../../test-fixtures/golden/np-damage-v1.json';
import {
  calculateDamagePoint,
  compileDamageKernelInput,
  evaluateDamageRows,
  prepareDamageEvaluation,
  attributeAffinity,
  classAffinity,
  classAttackRate,
  f32Add,
} from './index';

const evaluateForTest = (value: DamageResolutionInput) => {
  const prepared = prepareDamageEvaluation(value);
  if (prepared.status === 'unsupported')
    return {
      status: 'unsupported' as const,
      precision: 'unsupported' as const,
      rows: [] as const,
      issues: [{ code: prepared.warning }],
      missingEvidence: [prepared.warning],
    };
  return {
    status: 'calculated' as const,
    precision: prepared.precision,
    rows: evaluateDamageRows(prepared.kernelInputs),
    issues: prepared.warning ? [{ code: prepared.warning }] : [],
    missingEvidence: [],
  };
};

const resolvedDamagePoint = (
  value: DamageResolutionInput,
  npLevel: number,
  randomPermille: number,
) =>
  calculateDamagePoint(
    compileDamageKernelInput(
      value,
      npLevel,
      value.damageFunction.status === 'resolved' && value.damageFunction.ignoreDefense,
    ),
    randomPermille,
  );

const input: DamageResolutionInput = {
  attackerId: 'fixture-saber',
  attackerLevel: 90,
  attackerAtk: 10000,
  fouAtk: 1000,
  craftEssenceId: 'fixture-ce',
  craftEssenceAtk: 1000,
  npLevel: 1,
  overcharge: 1,
  npMultipliers: [300, 400, 450, 475, 500],
  damageFunction: { status: 'resolved', kind: 'standard', ignoreDefense: false },
  cardType: 'buster',
  classAttackRate: 1,
  classAffinity: 2,
  attributeAffinity: 1,
  attackBuff: 0.2,
  defenseBuff: 0,
  cardBuff: 0.2,
  cardResistance: 0,
  npDamageBuff: 0.2,
  npResistance: 0,
  powerMod: 0,
  eventDamageBuff: 0,
  npSpecialMultipliers: [1, 1, 1, 1, 1],
  specialDamageBuff: 0,
  specialResistance: 0,
  flatDamage: 0,
  damageCut: 0,
  fieldTraits: [],
  attackerHpPermille: null,
  targetRarity: null,
  targetStateTraits: [],
  battlePointPhase: null,
  target: { classId: 'lancer', attribute: 'earth', traits: ['dragon', 'male'] },
};
describe('float32 NP damage kernel', () => {
  it('rounds at primitive boundaries', () =>
    expect(f32Add(0.1, 0.2)).toBe(Math.fround(Math.fround(0.1) + Math.fround(0.2))));
  it('accepts only one-level numeric kernel inputs', () => {
    const kernelInput: DamageKernelInput = {
      totalAtk: 10_000,
      npMultiplierPermille: 1_000,
      card: 'arts',
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
      ignoreDefense: false,
    };
    expect(calculateDamagePoint(kernelInput, 1_000)).toBe(golden.expectedDamage);
    expect(
      damageKernelInputSchema.safeParse({ ...kernelInput, attackerId: 'must-not-enter-kernel' })
        .success,
    ).toBe(false);
  });
  it('evaluates all five levels and the exact random endpoints', () => {
    const result = evaluateForTest(input);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]?.minimum).toBe(resolvedDamagePoint(input, 1, 900));
    expect(result.rows[0]?.maximum).toBe(resolvedDamagePoint(input, 1, 1099));
    expect(result.rows[4]!.average).toBeGreaterThan(result.rows[0]!.average);
  });
  it('matches the independent neutral Arts formula at random 1000', () => {
    const neutral: DamageResolutionInput = {
      ...input,
      attackerAtk: 10_000,
      fouAtk: 0,
      craftEssenceAtk: 0,
      npMultipliers: [100, 100, 100, 100, 100],
      cardType: 'arts',
      classAffinity: 1,
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
    };
    expect(resolvedDamagePoint(neutral, 1, 1000)).toBe(golden.expectedDamage);
  });
  it('uses percentage NP multipliers from normalized master data', () => {
    const artoriaLike = {
      ...input,
      attackerAtk: 11_221,
      fouAtk: 1_000,
      craftEssenceAtk: 0,
      npMultipliers: [400, 500, 550, 575, 600] as DamageResolutionInput['npMultipliers'],
      classAttackRate: classAttackRate('saber'),
      classAffinity: classAffinity('saber', 'lancer'),
      attributeAffinity: attributeAffinity('earth', 'earth'),
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0,
    };
    expect(evaluateForTest(artoriaLike).rows[0]).toEqual({
      npLevel: 1,
      minimum: 30_356,
      average: 33_712.6,
      maximum: 37_069,
    });
  });
  it('resolves Atlas class attack and affinity tables', () => {
    expect(classAttackRate('lancer')).toBe(1.05);
    expect(classAttackRate('caster')).toBe(0.9);
    expect(classAffinity('saber', 'lancer')).toBe(2);
    expect(classAffinity('berserker', 'foreigner')).toBe(0.5);
  });
  it('resolves Atlas attribute relations', () => {
    expect(attributeAffinity('earth', 'man')).toBe(1.1);
    expect(attributeAffinity('earth', 'sky')).toBe(0.9);
    expect(attributeAffinity('unknown', 'sky')).toBe(1);
  });
  it('is deterministic', () => expect(evaluateForTest(input)).toEqual(evaluateForTest(input)));
  it('ignores enemy defense for a defense-piercing NP', () => {
    const defended = { ...input, defenseBuff: 0.5 };
    const normal = evaluateForTest(defended).rows[0]!.average;
    const pierced = evaluateForTest({
      ...defended,
      damageFunction: { status: 'resolved', kind: 'defensePiercing', ignoreDefense: true },
    }).rows[0]!.average;
    expect(pierced / normal).toBeCloseTo(1.2 / 0.7, 2);
  });
  it('marks an unresolved special NP function as unsupported in the result', () => {
    expect(
      evaluateForTest({
        ...input,
        damageFunction: {
          status: 'unsupported',
          kind: 'hpRatioLow',
          missingEvidence: 'missing_attacker_hp_ratio',
        },
      }),
    ).toMatchObject({
      status: 'unsupported',
      rows: [],
      issues: [{ code: 'missing_attacker_hp_ratio' }],
      missingEvidence: ['missing_attacker_hp_ratio'],
    });
  });
  it('uses the special NP multiplier belonging to each result row', () => {
    const rowSpecific = {
      ...input,
      npMultipliers: [100, 100, 100, 100, 100] as DamageResolutionInput['npMultipliers'],
      npSpecialMultipliers: [1, 1.5, 2, 2.5, 3] as DamageResolutionInput['npSpecialMultipliers'],
    };
    const result = evaluateForTest(rowSpecific);
    expect(result.rows[1]!.average / result.rows[0]!.average).toBeCloseTo(1.5, 3);
    expect(result.rows[4]!.average / result.rows[0]!.average).toBeCloseTo(3, 3);
  });
  it('keeps additive and multiplicative modifier groups in the documented order', () => {
    const composed: DamageResolutionInput = {
      ...input,
      attackerAtk: 10_000,
      fouAtk: 0,
      craftEssenceAtk: 0,
      npMultipliers: [100, 100, 100, 100, 100],
      cardType: 'arts',
      classAttackRate: 1,
      classAffinity: 1,
      attributeAffinity: 1,
      attackBuff: 0.2,
      cardBuff: 0,
      npDamageBuff: 0.3,
      powerMod: 0.5,
      specialDamageBuff: 0.2,
      npSpecialMultipliers: [1.5, 1.5, 1.5, 1.5, 1.5],
      flatDamage: 175,
    };
    expect(resolvedDamagePoint(composed, 1, 1000)).toBe(9_117);
  });
  it('matches AppMedia random endpoints for the reported Water Lilith inputs', () => {
    const waterLilith: DamageResolutionInput = {
      ...input,
      attackerId: '405900',
      attackerAtk: 15_381,
      fouAtk: 3_000,
      craftEssenceAtk: 2_400,
      npLevel: 5,
      npMultipliers: [600, 800, 900, 950, 1_000],
      damageFunction: { status: 'resolved', kind: 'stateTrait', ignoreDefense: false },
      cardType: 'quick',
      classAttackRate: 1,
      classAffinity: 1,
      attributeAffinity: 1,
      attackBuff: 0,
      cardBuff: 0,
      npDamageBuff: 0.8,
      powerMod: 0,
      npSpecialMultipliers: [1, 1, 1, 1, 1],
      flatDamage: 0,
    };
    const result = evaluateForTest(waterLilith).rows[4]!;
    expect(result.minimum).toBe(61_944);
    expect(result.maximum).toBe(75_640);
  });
});
