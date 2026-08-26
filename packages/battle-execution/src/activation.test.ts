import { describe, expect, it } from 'vitest';
import { conditionRequiresTrait, planOperationActivations } from './activation';
import type { BattleOperation, ConditionExpression, OperationSource } from './contracts';

const sunlight: ConditionExpression = {
  kind: 'trait',
  scope: 'field',
  trait: 'fieldSunlight',
  present: true,
};
const shore: ConditionExpression = {
  kind: 'trait',
  scope: 'field',
  trait: 'fieldShore',
  present: true,
};

describe('attacker skill mutation activation planning', () => {
  it('returns a linked plan without mutating compiled operations', () => {
    const source: OperationSource = {
      origin: 'attacker',
      sourceInstanceId: 'attacker:1',
      sourceId: '1',
      skillId: '10',
      effectId: '100',
      effectOccurrenceId: '100:0',
    };
    const base = {
      order: 0,
      phase: 'attackerSkill' as const,
      source,
      condition: { kind: 'always' as const },
      decisionPlan: { activation: 'automatic' as const, condition: 'evaluate' as const },
      enabledByDefault: false,
      activation: { kind: 'sourceDefault' as const },
      evidence: { rawPath: 'test', functionId: '100', parameterKeys: [] },
      presentation: { label: 'test', sourceName: 'test', skillName: 'test' },
      inputDefinitions: [],
    };
    const mutation = {
      ...base,
      operationId: 'mutation',
      decisionKey: null,
      kind: 'addTrait' as const,
      scope: 'field' as const,
      trait: 'fieldSunlight',
    } satisfies BattleOperation;
    const modifier = {
      ...base,
      operationId: 'modifier',
      source: { ...source, effectId: '101', effectOccurrenceId: '101:0' },
      decisionKey: 'effect:modifier',
      decisionPlan: { activation: 'user' as const, condition: 'evaluate' as const },
      kind: 'addModifier' as const,
      modifier: 'attackBuff' as const,
      valuePermille: 300,
      valueExpression: null,
      card: null,
    } satisfies BattleOperation;
    const compiled = [mutation, modifier];

    const planned = planOperationActivations(compiled);

    expect(compiled[0]?.activation).toEqual({ kind: 'sourceDefault' });
    expect(planned[0]?.activation).toEqual({
      kind: 'linkedDecisions',
      links: [
        {
          decisionKey: 'effect:modifier',
          reason: 'sourceSkill',
          selection: 'operationEnabled',
        },
      ],
    });
    expect(planned[0]).not.toBe(compiled[0]);
  });

  it('requires a trait from an AND clause but not from only one OR branch', () => {
    expect(
      conditionRequiresTrait(
        { kind: 'all', expressions: [sunlight, shore] },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(true);
    expect(
      conditionRequiresTrait(
        { kind: 'any', expressions: [sunlight, shore] },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(false);
  });

  it('accepts an OR only when every satisfiable branch requires the same trait', () => {
    expect(
      conditionRequiresTrait(
        {
          kind: 'any',
          expressions: [sunlight, { kind: 'all', expressions: [sunlight, shore] }],
        },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(true);
  });

  it('preserves NOT polarity and combined actor scope semantics', () => {
    expect(
      conditionRequiresTrait(
        {
          kind: 'not',
          expression: { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: false },
        },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(true);
    expect(
      conditionRequiresTrait(
        { kind: 'trait', scope: 'target', trait: 'undead', present: true },
        'targetState',
        'undead',
        true,
      ),
    ).toBe(true);
    expect(
      conditionRequiresTrait(
        { kind: 'trait', scope: 'target', trait: 'undead', present: false },
        'targetState',
        'undead',
        false,
      ),
    ).toBe(false);
  });
});
