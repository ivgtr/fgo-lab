import { describe, expect, it } from 'vitest';
import {
  conditionRequiresTrait,
  planOperationActivations,
  resolveOperationActivation,
} from './activation';
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
  it('keeps an applied attacker action mutation independent from contribution decisions', () => {
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
      contributionScope: 'personal' as const,
      condition: { kind: 'always' as const },
      decisionPlan: { activation: 'automatic' as const, condition: 'evaluate' as const },
      sourceEnabled: true,
      enabledByDefault: true,
      gameActivation: 'skillUse' as const,
      proc: { kind: 'guaranteed' as const },
      procSelection: { kind: 'effectInclusion' as const },
      procRatePermille: 1_000,
      activation: { kind: 'sourceDefault' as const },
      evidence: { rawPath: 'test', functionId: '100' },
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
    expect(planned[0]?.activation).toEqual({ kind: 'sourceDefault' });
    expect(resolveOperationActivation(planned[0]!, new Map()).enabled).toBe(true);
    expect(
      resolveOperationActivation(
        planned[0]!,
        new Map([
          [
            'effect:modifier',
            {
              decisionKey: 'effect:modifier',
              operationEnabled: true,
              conditionSatisfaction: 'evaluate',
            },
          ],
        ]),
      ).enabled,
    ).toBe(true);
    expect(
      resolveOperationActivation({ ...planned[0]!, sourceEnabled: false }, new Map()).enabled,
    ).toBe(false);

    const automatic = {
      ...modifier,
      decisionPlan: { activation: 'automatic' as const, condition: 'evaluate' as const },
      activation: { kind: 'sourceDefault' as const },
    };
    expect(resolveOperationActivation(automatic, new Map()).enabled).toBe(true);
    expect(
      resolveOperationActivation(
        automatic,
        new Map([
          [
            'effect:modifier',
            {
              decisionKey: 'effect:modifier',
              operationEnabled: false,
              conditionSatisfaction: 'evaluate',
            },
          ],
        ]),
      ).enabled,
    ).toBe(false);
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
