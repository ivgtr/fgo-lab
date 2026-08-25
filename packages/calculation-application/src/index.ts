import { evaluateDamageRows, prepareDamageEvaluation } from '@fgo-lab/calc-core';
import {
  damageResolutionInputSchema,
  SCHEMA_VERSION,
  type CalculationResult,
  type DamageResolutionInput,
  type VersionContext,
} from '@fgo-lab/schema';

export * from './npDamageHandler';

export function calculateDamageResolution(
  rawInput: DamageResolutionInput,
  versions: VersionContext,
): CalculationResult {
  const input = damageResolutionInputSchema.parse(rawInput);
  const functionType = input.attackNpFunctionType ?? 'damageNp';
  const prepared = prepareDamageEvaluation(input);
  const common = {
    effects: [],
    assumptions: ['random:900..1099', 'probability:only_guaranteed_effects'],
    issues: prepared.warning ? [{ code: prepared.warning, detail: functionType }] : [],
    trace: [
      { step: 'validate', detail: `damage_resolution_schema_v${String(SCHEMA_VERSION)}` },
      { step: 'attack-np-function', detail: functionType },
    ],
    versions,
  };
  if (prepared.status === 'unsupported')
    return {
      ...common,
      status: 'unsupported',
      rows: [],
      missingEvidence: [prepared.warning],
    };
  return {
    ...common,
    status: 'calculated',
    precision: prepared.precision,
    rows: evaluateDamageRows(prepared.kernelInputs),
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
