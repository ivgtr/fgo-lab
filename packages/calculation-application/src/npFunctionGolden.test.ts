import { describe, expect, it } from 'vitest';
import goldenDocument from '../../test-fixtures/golden/np-functions-v1.json';
import type { NpDamageSpec } from '@fgo-lab/master-data';
import { ENGINE_VERSION } from '@fgo-lab/schema';
import {
  evaluateNpDamageOperation,
  type NpDamageOperationContext,
} from '@fgo-lab/battle-execution';

interface GoldenParameter {
  Value: number;
  Value2?: number;
  Target?: number;
  Correction?: number;
  TargetList?: number[];
  ParamAddMaxCount?: number;
  TargetRarityList?: number[];
  AndCheckIndividualityList?: number[];
}
interface GoldenCase {
  caseId: string;
  kind: NpDamageSpec['kind'];
  rawFunctionType: NpDamageSpec['rawFunctionType'];
  maximumBattlePointPhase?: number;
  parameters: GoldenParameter[];
  context: {
    attackerStateTraits?: string[];
    targetTraits?: string[];
    targetStateTraits?: string[];
    attackerHpPermille?: number;
    targetRarity?: number;
    battlePointPhase?: number;
  };
  expected: {
    npMultipliers: number[];
    npSpecialMultipliers: number[];
    ignoreDefense: boolean;
  };
}
const golden = goldenDocument as unknown as {
  engineVersion: string;
  cases: GoldenCase[];
};

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function damageSpec(testCase: GoldenCase): NpDamageSpec {
  const conditionTrait =
    testCase.context.targetTraits?.[0] ??
    testCase.context.targetStateTraits?.[0] ??
    testCase.context.attackerStateTraits?.[0] ??
    'fixture-trait';
  const row = testCase.parameters.map((parameter) => ({
    ratePermille: 1_000,
    valuePermille: parameter.Value,
    ...(parameter.Value2 === undefined ? {} : { secondaryValuePermille: parameter.Value2 }),
    ...(parameter.Target === undefined ? {} : { targetId: parameter.Target }),
    ...(parameter.Correction === undefined ? {} : { correctionPermille: parameter.Correction }),
    ...(parameter.TargetList === undefined
      ? {}
      : {
          targetIds: parameter.TargetList,
          targetTraits: parameter.TargetList.map(() => ({
            kind: 'trait' as const,
            name: conditionTrait,
          })),
        }),
    ...(parameter.ParamAddMaxCount === undefined
      ? {}
      : { maximumTargetCount: parameter.ParamAddMaxCount }),
    ...(parameter.TargetRarityList === undefined
      ? {}
      : { targetRarities: parameter.TargetRarityList }),
    ...(parameter.AndCheckIndividualityList === undefined
      ? {}
      : {
          andCheckTraitIds: parameter.AndCheckIndividualityList,
          andCheckTraits: parameter.AndCheckIndividualityList.map((id, index) => ({
            kind: 'trait' as const,
            name: testCase.context.targetTraits?.[index] ?? `trait:${String(id)}`,
          })),
        }),
    ...(['trait', 'stateTrait'].includes(testCase.kind) && parameter.Target !== undefined
      ? { targetTrait: { kind: 'trait' as const, name: conditionTrait } }
      : {}),
  }));
  return {
    kind: testCase.kind,
    rawFunctionType: testCase.rawFunctionType,
    ...(testCase.maximumBattlePointPhase === undefined
      ? {}
      : { maximumBattlePointPhase: testCase.maximumBattlePointPhase }),
    functionId: testCase.caseId,
    target: 'single',
    parametersByOvercharge: Array.from({ length: 5 }, () => row),
    rawPath: `golden:${testCase.caseId}`,
  } as unknown as NpDamageSpec;
}

function context(testCase: GoldenCase): NpDamageOperationContext {
  const attackerTraits = testCase.context.attackerStateTraits ?? [];
  const targetTraits = testCase.context.targetTraits ?? [];
  const targetStateTraits = testCase.context.targetStateTraits ?? [];
  return {
    overcharge: 1,
    attackerTraitCounts: counts(attackerTraits),
    targetTraitCounts: counts(targetTraits),
    targetCombinedTraitCounts: counts([...targetTraits, ...targetStateTraits]),
    targetStateTraitCounts: counts(targetStateTraits),
    targetPredicateValues: new Map(),
    attackerHpPermille: testCase.context.attackerHpPermille ?? null,
    targetRarity: testCase.context.targetRarity ?? null,
    battlePointPhase: testCase.context.battlePointPhase ?? null,
  };
}

describe('NP Function golden matrix', () => {
  it('belongs to the current engine version', () => {
    expect(golden.engineVersion).toBe(ENGINE_VERSION);
  });

  for (const testCase of golden.cases) {
    it(testCase.caseId, () => {
      expect(evaluateNpDamageOperation(damageSpec(testCase), context(testCase))).toEqual({
        status: 'resolved',
        ...testCase.expected,
      });
    });
  }

  it('covers every registered NP Function kind', () => {
    expect(new Set(golden.cases.map((testCase) => testCase.kind))).toEqual(
      new Set([
        'standard',
        'defensePiercing',
        'trait',
        'traitCount',
        'stateTrait',
        'hpRatioLow',
        'battlePointPhase',
        'targetRarity',
        'traitExpression',
      ]),
    );
  });
});
