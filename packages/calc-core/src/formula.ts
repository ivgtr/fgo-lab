import type { DamageKernelInput } from '@fgo-lab/schema';
import { clamp, f32, f32Add, f32Div, f32Mul, floorDamage } from './float32';

const CARD_RATE = { buster: 1.5, arts: 1, quick: 0.8 } as const;
const DAMAGE_CONSTANT = 0.23;

function boundedBuff(value: number): number {
  return clamp(value, -1, 5);
}

export function damageAtRandom(
  input: DamageKernelInput,
  npLevel: number,
  randomPermille: number,
): number {
  const npMultiplier = input.npMultipliers[npLevel - 1];
  const npSpecialMultiplier = input.npSpecialMultipliers[npLevel - 1];
  if (npMultiplier === undefined || npSpecialMultiplier === undefined)
    throw new RangeError('NP level is outside 1..5');
  if (!Number.isInteger(randomPermille) || randomPermille < 900 || randomPermille > 1099)
    throw new RangeError('random must be an integer in 900..1099');

  let value = f32Add(f32Add(input.attackerAtk, input.fouAtk), input.craftEssenceAtk);
  value = f32Mul(value, f32Div(npMultiplier, 100));
  value = f32Mul(
    value,
    f32Mul(
      CARD_RATE[input.cardType],
      Math.max(f32Add(1, boundedBuff(input.cardBuff - input.cardResistance)), 0),
    ),
  );
  value = f32Mul(value, input.classAttackRate);
  value = f32Mul(value, input.classAffinity);
  value = f32Mul(value, input.attributeAffinity);
  value = f32Mul(value, f32Div(randomPermille, 1000));
  value = f32Mul(value, DAMAGE_CONSTANT);
  const effectiveDefense = input.attackNpFunctionType === 'damageNpPierce' ? 0 : input.defenseBuff;
  value = f32Mul(value, Math.max(f32Add(1, boundedBuff(input.attackBuff - effectiveDefense)), 0));
  value = f32Mul(value, Math.max(f32Add(1, -boundedBuff(input.specialResistance)), 0));
  const power = f32Add(
    boundedBuff(input.npDamageBuff - input.npResistance),
    boundedBuff(input.powerMod + input.eventDamageBuff),
  );
  value = f32Mul(value, Math.max(f32Add(1, power), 0.001));
  value = f32Mul(value, Math.max(f32Add(1, input.specialDamageBuff), 0.001));
  value = f32Mul(value, Math.max(npSpecialMultiplier, 0.001));
  return floorDamage(f32Add(f32(value), input.flatDamage - input.damageCut));
}
