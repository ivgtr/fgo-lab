import type { DamageKernelInput } from '@fgo-lab/schema';
import { damageKernelInputSchema } from '@fgo-lab/schema';
import { clamp, f32, f32Add, f32Div, f32Mul, floorDamage } from './float32';

const CARD_RATE_PERMILLE = { buster: 1500, arts: 1000, quick: 800 } as const;
const DAMAGE_CONSTANT = 0.23;

function permilleRatio(value: number): number {
  return f32Div(value, 1000);
}

function modifierFactor(valuePermille: number, minimumPermille: number): number {
  return permilleRatio(Math.max(1000 + clamp(valuePermille, -1000, 5000), minimumPermille));
}

function calculateValidatedDamagePoint(input: DamageKernelInput, randomPermille: number): number {
  if (!Number.isInteger(randomPermille) || randomPermille < 900 || randomPermille > 1099)
    throw new RangeError('random must be an integer in 900..1099');

  let value = f32(input.totalAtk);
  value = f32Mul(value, permilleRatio(input.npMultiplierPermille));
  value = f32Mul(
    value,
    f32Mul(
      permilleRatio(CARD_RATE_PERMILLE[input.card]),
      modifierFactor(input.cardModifierPermille, 0),
    ),
  );
  value = f32Mul(value, permilleRatio(input.classAttackRatePermille));
  value = f32Mul(value, permilleRatio(input.classAffinityPermille));
  value = f32Mul(value, permilleRatio(input.attributeAffinityPermille));
  value = f32Mul(value, permilleRatio(randomPermille));
  value = f32Mul(value, DAMAGE_CONSTANT);
  value = f32Mul(value, modifierFactor(input.attackModifierPermille, 0));
  value = f32Mul(value, modifierFactor(input.npPowerModifierPermille, 1));
  value = f32Mul(value, permilleRatio(Math.max(input.specialModifierPermille, 1)));
  value = f32Mul(value, permilleRatio(Math.max(input.npSpecialMultiplierPermille, 1)));
  return floorDamage(
    f32Add(f32(value), input.flatDamage - (input.ignoreDamageCut ? 0 : input.damageCut)),
  );
}

export function calculateDamagePoint(rawInput: DamageKernelInput, randomPermille: number): number {
  return calculateValidatedDamagePoint(damageKernelInputSchema.parse(rawInput), randomPermille);
}

export function calculateDamageDistribution(rawInput: DamageKernelInput): readonly number[] {
  const input = damageKernelInputSchema.parse(rawInput);
  return Array.from({ length: 200 }, (_, randomIndex) =>
    calculateValidatedDamagePoint(input, 900 + randomIndex),
  );
}
