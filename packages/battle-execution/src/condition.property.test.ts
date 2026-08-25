import { describe, expect, it } from 'vitest';
import {
  evaluateConditionExpression,
  type BattleState,
  type ConditionExpression,
  type EffectProjection,
} from './index';

function state(target: readonly string[] = [], targetState: readonly string[] = []): BattleState {
  return {
    card: 'buster',
    traits: {
      attacker: new Set(),
      attackerState: new Set(),
      target: new Set(target),
      targetState: new Set(targetState),
      field: new Set(),
    },
    traitCounts: {
      attacker: {},
      attackerState: {},
      target: Object.fromEntries(target.map((trait) => [trait, 1])),
      targetState: Object.fromEntries(targetState.map((trait) => [trait, 1])),
      field: {},
    },
    quantities: { attackerHpPermille: null, targetRarity: null, battlePointPhase: null },
    modifiers: [],
    modifierRates: {},
    ignoreDefense: false,
    ignoreDamageCut: false,
    evidence: [],
    unresolved: [],
  };
}

describe('condition expression properties', () => {
  it('is invariant to trait insertion order and unrelated traits', () => {
    const condition: ConditionExpression = {
      kind: 'all',
      expressions: [
        { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
        { kind: 'trait', scope: 'target', trait: 'divine', present: true },
      ],
    };
    const permutations = [
      ['dragon', 'divine'],
      ['divine', 'dragon'],
      ['unrelated', 'dragon', 'divine'],
      ['divine', 'unrelated', 'dragon'],
    ];
    for (const traits of permutations)
      expect(evaluateConditionExpression(condition, state(traits))).toBe(true);
  });

  it('keeps permanent and state traits distinct while combined target checks see both', () => {
    const permanent: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'confusion',
      present: true,
    };
    const stateOnly: ConditionExpression = { ...permanent, scope: 'targetState' };

    expect(evaluateConditionExpression(permanent, state([], ['confusion']))).toBe(true);
    expect(evaluateConditionExpression(stateOnly, state(['confusion']))).toBe(false);
    expect(evaluateConditionExpression(stateOnly, state([], ['confusion']))).toBe(true);
  });

  it('preserves unknown quantity truth through all/any/not expressions', () => {
    const unknown: ConditionExpression = {
      kind: 'quantity',
      quantity: 'targetRarity',
      comparison: 'equal',
      value: 5,
    };
    expect(evaluateConditionExpression({ kind: 'not', expression: unknown }, state())).toBeNull();
    expect(
      evaluateConditionExpression(
        { kind: 'all', expressions: [{ kind: 'always' }, unknown] },
        state(),
      ),
    ).toBeNull();
    expect(
      evaluateConditionExpression(
        {
          kind: 'any',
          expressions: [
            { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
            unknown,
          ],
        },
        state(),
      ),
    ).toBeNull();
  });

  it('keeps an all-condition as an effect-local decision without fabricating world facts', () => {
    const projection = {
      projectionKey: 'projection',
      operationId: 'operation',
      label: 'compound condition',
      sourceName: 'source',
      skillName: 'skill',
      valuePermille: 1_500,
      value: 1.5,
      modifier: 'npSpecial',
      source: {
        origin: 'np',
        sourceInstanceId: 'source',
        sourceId: 'source',
        skillId: 'skill',
        effectId: 'effect',
      },
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      decision: {
        state: 'enabled',
        decisionKey: 'projection',
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
      explanation: {
        code: 'conditionNotMet',
        condition: {
          kind: 'all',
          expressions: [
            { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
            { kind: 'trait', scope: 'targetState', trait: 'burning', present: true },
          ],
        },
      },
    } satisfies EffectProjection;

    expect(projection.explanation.condition).toMatchObject({ kind: 'all' });
    expect(projection.decision).toMatchObject({
      kind: 'effect',
      plan: { condition: 'userMayAssume' },
    });
  });
});
