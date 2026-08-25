import type {
  CalculationResult,
  DamageKernelInput,
  DamageResolutionInput,
  DamageRow,
  VersionContext,
} from '@fgo-lab/schema';
import { damageResolutionInputSchema, SCHEMA_VERSION } from '@fgo-lab/schema';
import { classifyAttackNpFunction } from './attackNpFunction';
import { calculateDamagePoint } from './formula';
import { clamp, f32Add, f32Mul } from './float32';

export * from './float32';
export * from './formula';
export * from './attackNpFunction';
export * from './affinities';

function boundedBuff(value: number): number {
  return clamp(value, -1, 5);
}

export function compileDamageKernelInput(
  input: DamageResolutionInput,
  npLevel: number,
  ignoreDefense: boolean,
): DamageKernelInput {
  const npMultiplier = input.npMultipliers[npLevel - 1];
  const npSpecialMultiplier = input.npSpecialMultipliers[npLevel - 1];
  if (npMultiplier === undefined || npSpecialMultiplier === undefined)
    throw new RangeError('NP level is outside 1..5');
  const specialResistanceFactor = Math.max(f32Add(1, -boundedBuff(input.specialResistance)), 0);
  const specialDamageFactor = Math.max(f32Add(1, input.specialDamageBuff), 0.001);
  return {
    totalAtk: input.attackerAtk + input.fouAtk + input.craftEssenceAtk,
    npMultiplierPermille: npMultiplier * 10,
    card: input.cardType,
    classAttackRatePermille: input.classAttackRate * 1000,
    classAffinityPermille: input.classAffinity * 1000,
    attributeAffinityPermille: input.attributeAffinity * 1000,
    attackModifierPermille:
      (input.attackBuff - (ignoreDefense ? 0 : input.defenseBuff)) * 1000,
    cardModifierPermille: (input.cardBuff - input.cardResistance) * 1000,
    npPowerModifierPermille:
      f32Add(
        boundedBuff(input.npDamageBuff - input.npResistance),
        boundedBuff(input.powerMod + input.eventDamageBuff),
      ) * 1000,
    specialModifierPermille:
      f32Mul(specialResistanceFactor, specialDamageFactor) * 1000,
    npSpecialMultiplierPermille: npSpecialMultiplier * 1000,
    flatDamage: input.flatDamage,
    damageCut: input.damageCut,
    ignoreDefense,
  };
}

export function evaluateDamageRows(
  inputs: readonly [
    DamageKernelInput,
    DamageKernelInput,
    DamageKernelInput,
    DamageKernelInput,
    DamageKernelInput,
  ],
): [DamageRow, DamageRow, DamageRow, DamageRow, DamageRow] {
  return inputs.map((input, index) => {
    const distribution = Array.from({ length: 200 }, (_, randomIndex) =>
      calculateDamagePoint(input, 900 + randomIndex),
    );
    return {
      npLevel: (index + 1) as 1 | 2 | 3 | 4 | 5,
      minimum: distribution[0]!,
      average: distribution.reduce((sum, value) => sum + value, 0) / distribution.length,
      maximum: distribution[199]!,
    };
  }) as [DamageRow, DamageRow, DamageRow, DamageRow, DamageRow];
}

export function calculateNpDamage(
  rawInput: DamageResolutionInput,
  versions: VersionContext,
): CalculationResult {
  const input = damageResolutionInputSchema.parse(rawInput);
  const attackFunction = classifyAttackNpFunction(input.attackNpFunctionType ?? 'damageNp');
  const common = {
    effects: [],
    assumptions: ['random:900..1099', 'probability:only_guaranteed_effects'],
    issues: attackFunction.warning
      ? [{ code: attackFunction.warning, detail: input.attackNpFunctionType ?? 'damageNp' }]
      : [],
    trace: [
      { step: 'validate', detail: `calc_input_schema_v${String(SCHEMA_VERSION)}` },
      { step: 'attack-np-function', detail: input.attackNpFunctionType ?? 'damageNp' },
    ],
    versions,
  };
  if (attackFunction.precision === 'unsupported')
    return {
      ...common,
      status: 'unsupported',
      rows: [],
      missingEvidence: attackFunction.warning ? [attackFunction.warning] : [],
    };
  const ignoreDefense = input.attackNpFunctionType === 'damageNpPierce';
  const kernelInputs = ([1, 2, 3, 4, 5] as const).map((npLevel) =>
    compileDamageKernelInput(input, npLevel, ignoreDefense),
  ) as [DamageKernelInput, DamageKernelInput, DamageKernelInput, DamageKernelInput, DamageKernelInput];
  const rows = evaluateDamageRows(kernelInputs);
  return {
    ...common,
    status: 'calculated',
    precision: attackFunction.precision,
    rows,
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
    trace: [...common.trace, { step: 'random', detail: 'evaluated_200_final_floors' }],
  };
}
