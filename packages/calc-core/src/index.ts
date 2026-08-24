import type { CalcInput, CalcResult, VersionContext } from '@fgo-lab/schema';
import { calcInputSchema, SCHEMA_VERSION } from '@fgo-lab/schema';
import { classifyAttackNpFunction } from './attackNpFunction';
import { damageAtRandom } from './formula';

export * from './float32';
export * from './formula';
export * from './attackNpFunction';
export * from './affinities';

export function calculateNpDamage(rawInput: CalcInput, versions: VersionContext): CalcResult {
  const input = calcInputSchema.parse(rawInput);
  const attackFunction = classifyAttackNpFunction(input.attackNpFunctionType ?? 'damageNp');
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
    precision: attackFunction.precision,
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
    warnings: attackFunction.warning ? [attackFunction.warning] : [],
    trace: [
      { step: 'validate', detail: `calc_input_schema_v${String(SCHEMA_VERSION)}` },
      { step: 'random', detail: 'evaluated_200_final_floors' },
      {
        step: 'attack-np-function',
        detail: input.attackNpFunctionType ?? 'damageNp',
      },
    ],
    versions,
  };
}
