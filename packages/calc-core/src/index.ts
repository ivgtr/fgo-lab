import type {
  CalculationResult,
  DamageKernelInput,
  DamageRow,
  VersionContext,
} from '@fgo-lab/schema';
import { damageKernelInputSchema, SCHEMA_VERSION } from '@fgo-lab/schema';
import { classifyAttackNpFunction } from './attackNpFunction';
import { damageAtRandom } from './formula';

export * from './float32';
export * from './formula';
export * from './attackNpFunction';
export * from './affinities';

export function calculateNpDamage(
  rawInput: DamageKernelInput,
  versions: VersionContext,
): CalculationResult {
  const input = damageKernelInputSchema.parse(rawInput);
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
  const rows = ([1, 2, 3, 4, 5] as const).map((npLevel) => {
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
  }) as [DamageRow, DamageRow, DamageRow, DamageRow, DamageRow];
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
