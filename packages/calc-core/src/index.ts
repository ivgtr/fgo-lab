import type { CalcInput, CalcResult, VersionContext } from '@fgo-lab/schema';
import { calcInputSchema } from '@fgo-lab/schema';
import { clamp, f32, f32Add, f32Div, f32Mul, floorDamage } from './float32';

export * from './float32';
export * from './handlers';
export * from './traits';

const CARD_RATE = { buster: 1.5, arts: 1, quick: 0.8 } as const;
const DAMAGE_CONSTANT = 0.23;

function boundedBuff(value: number): number {
  return clamp(value, -1, 5);
}

export function damageAtRandom(input: CalcInput, npLevel: number, randomPermille: number): number {
  const npMultiplier = input.npMultipliers[npLevel - 1];
  if (npMultiplier === undefined) throw new RangeError('NP level is outside 1..5');
  if (!Number.isInteger(randomPermille) || randomPermille < 900 || randomPermille > 1099) {
    throw new RangeError('random must be an integer in 900..1099');
  }

  let value = f32Add(f32Add(input.attackerAtk, input.fouAtk), input.craftEssenceAtk);
  value = f32Mul(value, f32Div(npMultiplier, 1000));
  value = f32Mul(
    value,
    f32Mul(CARD_RATE[input.cardType], Math.max(f32Add(1, boundedBuff(input.cardBuff)), 0)),
  );
  value = f32Mul(value, input.classAttackRate);
  value = f32Mul(value, input.classAffinity);
  value = f32Mul(value, input.attributeAffinity);
  value = f32Mul(value, f32Div(randomPermille, 1000));
  value = f32Mul(value, DAMAGE_CONSTANT);
  value = f32Mul(value, Math.max(f32Add(1, boundedBuff(input.attackBuff)), 0));
  value = f32Mul(value, Math.max(f32Add(1, -boundedBuff(input.specialResistance)), 0));
  const power = f32Add(boundedBuff(input.npDamageBuff), boundedBuff(input.powerMod));
  value = f32Mul(value, Math.max(f32Add(1, power), 0.001));
  value = f32Mul(value, Math.max(input.npSpecialMultiplier, 0.001));
  return floorDamage(f32Add(f32(value), input.flatDamage));
}

export function calculateNpDamage(rawInput: CalcInput, versions: VersionContext): CalcResult {
  const input = calcInputSchema.parse(rawInput);
  const results = ([1, 2, 3, 4, 5] as const).map((npLevel) => {
    const distribution = Array.from({ length: 200 }, (_, index) =>
      damageAtRandom(input, npLevel, 900 + index),
    );
    const total = distribution.reduce((sum, value) => sum + value, 0);
    return {
      npLevel,
      minimum: distribution[0]!,
      average: total / distribution.length,
      maximum: distribution[199]!,
    };
  });
  return {
    precision: 'exact',
    results,
    breakdown: [
      {
        key: 'totalAtk',
        labelKey: 'calc.breakdown.totalAtk',
        value: input.attackerAtk + input.fouAtk + input.craftEssenceAtk,
      },
      {
        key: 'classAffinity',
        labelKey: 'calc.breakdown.classAffinity',
        value: input.classAffinity,
      },
      {
        key: 'attributeAffinity',
        labelKey: 'calc.breakdown.attributeAffinity',
        value: input.attributeAffinity,
      },
    ],
    assumptions: ['random:900..1099', 'probability:only_guaranteed_effects'],
    warnings: [],
    trace: [
      { step: 'validate', detail: 'calc_input_schema_v1' },
      { step: 'random', detail: 'evaluated_200_final_floors' },
    ],
    versions,
  };
}
