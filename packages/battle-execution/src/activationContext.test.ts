import { describe, expect, it } from 'vitest';
import type { ActivationFact, ActivationSourceRef } from '@fgo-lab/schema';
import type { BattleOperation, ConditionExpression, EffectDecision } from './contracts';
import { evaluateActivationRequirement } from './activationCondition';
import { buildActivationContext } from './activationContext';

const source: ActivationSourceRef = {
  origin: 'attacker',
  sourceInstanceId: 'attacker:self',
  skillId: 'skill:1',
};

function operation(
  operationId: string,
  condition: ConditionExpression,
  decisionKey = 'effect:1',
): BattleOperation {
  return {
    operationId,
    order: 1,
    phase: 'attackerSkill',
    source: {
      ...source,
      sourceId: 'servant:1',
      skillId: source.skillId!,
      effectId: 'effect',
      effectOccurrenceId: 'effect:0',
    },
    contributionScope: 'personal',
    condition,
    decisionKey,
    decisionPlan: { activation: 'user', condition: 'userMayAssume' },
    sourceEnabled: true,
    enabledByDefault: false,
    gameActivation: 'skillUse',
    proc: { kind: 'guaranteed' },
    procSelection: { kind: 'effectInclusion' },
    procRatePermille: 1_000,
    activation: { kind: 'sourceDefault' },
    evidence: { rawPath: 'test', functionId: 'test' },
    presentation: { label: 'test', sourceName: 'test', skillName: 'test' },
    inputDefinitions: [],
    kind: 'addModifier',
    modifier: 'attackBuff',
    valuePermille: 100,
    valueExpression: null,
    card: null,
  };
}

const enabled = new Map<string, EffectDecision>([
  [
    'effect:1',
    {
      decisionKey: 'effect:1',
      operationEnabled: true,
      conditionSatisfaction: 'evaluate',
    },
  ],
]);

describe('canonical activation context', () => {
  it('rejects an all-expression when one of two required facts is missing', () => {
    const choice: ActivationFact = { kind: 'choice', source, family: 'mode', candidate: '1' };
    const trigger: ActivationFact = { kind: 'operationTrigger', source, position: 2 };
    const result = buildActivationContext(
      [choice],
      [operation('all', { kind: 'all', expressions: [choice, trigger] })],
      enabled,
    );
    expect(result).toMatchObject({
      status: 'invalid',
      issues: [{ kind: 'invalidActivationContext', detail: 'missingRequiredFact' }],
    });
  });

  it('does not invalidate an any-expression only because its activation branch is absent', () => {
    const choice: ActivationFact = { kind: 'choice', source, family: 'mode', candidate: '1' };
    const result = buildActivationContext(
      [],
      [
        operation('any', {
          kind: 'any',
          expressions: [
            choice,
            { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: true },
          ],
        }),
      ],
      enabled,
    );
    expect(result.status).toBe('valid');
  });

  it('distinguishes a selected sibling candidate from an absent selection', () => {
    const required: ActivationFact = { kind: 'choice', source, family: 'mode', candidate: '1' };
    const sibling: ActivationFact = { ...required, candidate: '2' };
    const selected = buildActivationContext(
      [sibling],
      [operation('choice', required), operation('sibling', sibling, 'effect:2')],
      new Map([
        ...enabled,
        [
          'effect:2',
          {
            decisionKey: 'effect:2',
            operationEnabled: true,
            conditionSatisfaction: 'evaluate' as const,
          },
        ],
      ]),
    );
    expect(selected.status).toBe('valid');
    if (selected.status !== 'valid') throw new Error('expected valid context');
    expect(evaluateActivationRequirement(required, selected.context)).toBe(false);
    expect(buildActivationContext([], [operation('choice', required)], enabled).status).toBe(
      'invalid',
    );
  });

  it('does not share a fact across distinct source instances with the same skill ID', () => {
    const required: ActivationFact = { kind: 'operationTrigger', source, position: 1 };
    const other: ActivationFact = {
      ...required,
      source: { ...source, sourceInstanceId: 'support:other' },
    };
    const result = buildActivationContext([other], [operation('source', required)], enabled);
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('expected invalid context');
    expect(
      result.issues.some(
        (issue) => issue.kind === 'invalidActivationContext' && issue.detail === 'unknownFact',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.kind === 'invalidActivationContext' && issue.detail === 'missingRequiredFact',
      ),
    ).toBe(true);
  });

  it('rejects conflicting source quantity ranges without mutating its inputs', () => {
    const atLeast: ActivationFact = {
      kind: 'sourceQuantity',
      source,
      quantity: 'battlePointRate',
      subjectId: 'subject',
      comparison: 'atLeast',
      value: 1_000,
    };
    const atMost: ActivationFact = { ...atLeast, comparison: 'atMost', value: 999 };
    const facts = Object.freeze([atLeast, atMost] as const);
    const result = buildActivationContext(
      facts,
      [operation('minimum', atLeast), operation('maximum', atMost)],
      enabled,
    );
    expect(result.status).toBe('invalid');
    if (result.status !== 'invalid') throw new Error('expected invalid context');
    expect(
      result.issues.some(
        (issue) =>
          issue.kind === 'invalidActivationContext' &&
          issue.detail === 'conflictingSourceQuantityRange',
      ),
    ).toBe(true);
    expect(facts).toEqual([atLeast, atMost]);
  });

  it('validates every operation under one decision independently', () => {
    const choice: ActivationFact = { kind: 'choice', source, family: 'mode', candidate: '1' };
    const trigger: ActivationFact = { kind: 'operationTrigger', source, position: 2 };
    const result = buildActivationContext(
      [choice],
      [operation('choice-operation', choice), operation('trigger-operation', trigger)],
      enabled,
    );
    expect(result).toMatchObject({
      status: 'invalid',
      issues: [
        {
          kind: 'invalidActivationContext',
          detail: 'missingRequiredFact',
          operationId: 'trigger-operation',
        },
      ],
    });
  });
});
