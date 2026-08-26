import type {
  EffectExecutionOperation,
  MasterEffect,
  ModifierValueExpression,
} from '@fgo-lab/master-data';
import { describe, expect, it } from 'vitest';
import { compileEffect } from './operationCompiler';
import type { SourceEffect } from './sourceCollection';

const values = (
  value: number | null,
): [(number | null)[], number[], number[], number[], number[]] => [[value], [], [], [], []];
const expressions: [
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
  (ModifierValueExpression | null)[],
] = [[null], [], [], [], []];

function effect(execution: EffectExecutionOperation[]): MasterEffect {
  return {
    id: '1',
    occurrenceId: '1:0',
    label: '複合効果',
    availability: 'allLimitBreakStates',
    choice: null,
    triggerScope: null,
    operationTrigger: null,
    quantityConditions: [],
    sourceQuantityConditions: [],
    conditions: {
      recipient: [],
      holder: { operator: 'all', traits: [] },
      opponent: { operator: 'all', traits: [] },
      field: { operator: 'all', traits: [] },
    },
    conditionTargetPolicy: 'sourceSelf',
    execution,
    atlasEvidence: {
      functionType: 'test',
      target: 'self',
      parameterSets: [[], [], [], [], []],
      parameterSemantics: {
        value: [],
        lifecycle: [],
        presentation: [],
        condition: [],
        contextMutation: [],
        choice: [],
        valueExpression: [],
        buffIdentity: [],
        unresolved: [],
      },
      unresolvedSemanticKeys: [],
      buffTypes: [],
      buffRateTargets: [],
    },
  };
}

function source(execution: EffectExecutionOperation[]): SourceEffect {
  return {
    phase: 'craftEssence',
    origin: 'craftEssence',
    sourceInstanceId: 'craftEssence:1',
    sourceId: '1',
    sourceName: '礼装',
    skillId: 'ce:1',
    skillName: '礼装',
    effect: effect(execution),
    valueSetIndex: 0,
    valueIndex: 0,
    limitBreak: false,
    enabledByDefault: true,
  };
}

function modifier(
  kind: 'attackBuff' | 'npDamageBuff',
  value: number | null,
): EffectExecutionOperation {
  return {
    kind: 'damageModifier',
    targetPolicy: 'sourceSelf',
    expectedRecipient: 'attacker',
    targetMismatch: 'unsupported',
    semanticSupport: 'supported',
    modifier: kind,
    sign: 1,
    card: null,
    values: values(value),
    valueExpressions: expressions,
  };
}

describe('canonical operation compilation', () => {
  it('compiles every operation in canonical order', () => {
    const compiled = compileEffect(
      source([
        modifier('attackBuff', 100),
        {
          kind: 'contextMutation',
          mutation: 'addTrait',
          scope: 'field',
          targetPolicy: 'sourceSelf',
          trait: 'fieldSunlight',
          damageRelevant: true,
        },
        modifier('npDamageBuff', 200),
      ]),
      7,
    );
    expect(compiled.unsupported).toEqual([]);
    expect(compiled.operations).toMatchObject([
      { order: 7, kind: 'addModifier', modifier: 'attackBuff', valuePermille: 100 },
      { order: 8, kind: 'addTrait', scope: 'field', trait: 'fieldSunlight' },
      { order: 9, kind: 'addModifier', modifier: 'npDamageBuff', valuePermille: 200 },
    ]);
  });

  it('does not partially compile when any valued operation is missing', () => {
    const compiled = compileEffect(
      source([modifier('attackBuff', 100), modifier('npDamageBuff', null)]),
      0,
    );
    expect(compiled.operations).toEqual([]);
    expect(compiled.unsupported).toHaveLength(1);
  });

  it('does not partially compile when any operation semantics is unresolved', () => {
    const compiled = compileEffect(
      source([
        modifier('attackBuff', 100),
        {
          kind: 'unresolved',
          targetPolicy: 'sourceSelf',
          reason: 'operationSemantics',
          damageRelevant: true,
        },
      ]),
      0,
    );
    expect(compiled.operations).toEqual([]);
    expect(compiled.unsupported).toHaveLength(1);
  });

  it('assigns unique trace IDs to repeated operations without changing singleton IDs', () => {
    const compiled = compileEffect(
      source([modifier('attackBuff', 100), modifier('attackBuff', 200)]),
      0,
    );
    expect(compiled.operations.map((operation) => operation.operationId)).toEqual([
      'craftEssence:craftEssence:1:ce:1:1:0:modifier:attackBuff',
      'craftEssence:craftEssence:1:ce:1:1:0:modifier:attackBuff:1',
    ]);
  });
});
