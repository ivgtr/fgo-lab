import { evaluateDamageRows, prepareDamageEvaluation } from '@fgo-lab/calc-core';
import type { CombatRules } from '@fgo-lab/master-data';
import {
  damageResolutionInputSchema,
  SCHEMA_VERSION,
  type CalculationResult,
  type DamageResolutionInput,
  type VersionContext,
} from '@fgo-lab/schema';
import { evaluateCalculationEvidence } from './evidence';

export type DamageResolutionValue =
  | Omit<Extract<CalculationResult, { status: 'calculated' }>, 'versions'>
  | Omit<Extract<CalculationResult, { status: 'unsupported' }>, 'versions'>;

export function calculateDamageResolutionValue(
  rawInput: DamageResolutionInput,
  rules?: CombatRules,
): DamageResolutionValue {
  const input = damageResolutionInputSchema.parse(rawInput);
  const functionKind = input.damageFunction.kind;
  const prepared = prepareDamageEvaluation(input);
  const evidence = evaluateCalculationEvidence([
    'kernel:np-damage-v1',
    `np-function:${functionKind}`,
  ]);
  const common = {
    effects: [],
    assumptions: ['random:900..1099', 'probability:only_guaranteed_effects'],
    issues: prepared.warning ? [{ code: prepared.warning, detail: functionKind }] : [],
    trace: [
      { step: 'validate', detail: `damage_resolution_schema_v${String(SCHEMA_VERSION)}` },
      { step: 'attack-np-function', detail: functionKind },
    ],
    evidence: evidence.evidence,
  };
  if (prepared.status === 'unsupported' || evidence.status === 'unsupported')
    return {
      ...common,
      status: 'unsupported',
      rows: [],
      missingEvidence: [
        ...(prepared.status === 'unsupported' ? [prepared.warning] : []),
        ...(evidence.status === 'unsupported' ? evidence.missingEvidence : []),
      ],
    };
  return {
    ...common,
    status: 'calculated',
    precision: evidence.precision,
    rows: evaluateDamageRows(prepared.kernelInputs, rules),
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

export function calculateDamageResolution(
  rawInput: DamageResolutionInput,
  versions: VersionContext,
): Extract<CalculationResult, { status: 'calculated' | 'unsupported' }> {
  return { ...calculateDamageResolutionValue(rawInput), versions };
}
