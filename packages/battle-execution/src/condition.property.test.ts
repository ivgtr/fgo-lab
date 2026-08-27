import { describe, expect, it } from 'vitest';
import {
  evaluateConditionExpression,
  type BattleState,
  type ConditionExpression,
  type EffectProjection,
  type TraitScope,
} from './index';
import { validateConstraintSet, type FixedConstraintFact } from './constraints';

function state(target: readonly string[] = [], targetState: readonly string[] = []): BattleState {
  return {
    card: 'buster',
    traits: {
      attacker: new Map(),
      attackerState: new Map(),
      target: new Map(target.map((trait) => [trait, true])),
      targetState: new Map(targetState.map((trait) => [trait, true])),
      field: new Map(),
    },
    traitCounts: {
      attacker: {},
      attackerState: {},
      target: Object.fromEntries(target.map((trait) => [trait, 1])),
      targetState: Object.fromEntries(targetState.map((trait) => [trait, 1])),
      field: {},
    },
    initialTraitSuppressions: { attacker: new Set(), target: new Set() },
    quantities: { attackerHpPermille: null, targetRarity: null, battlePointPhase: null },
    resolvedInputValues: {},
    modifiers: [],
    modifierRates: {},
    ignoreDefense: false,
    ignoreDamageCut: false,
    evidence: [],
    unresolved: [],
  };
}

describe('condition expression properties', () => {
  it('does not infer provenance-sensitive traits from an unqualified scenario fact', () => {
    const expression: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'buffPoison',
      present: true,
      readPolicy: {
        stateSources: 'activeOnly',
        ignoredStateTraits: 'include',
        unremovableStateTraits: 'include',
      },
    };
    expect(evaluateConditionExpression(expression, state([], ['buffPoison']))).toBeNull();
  });

  it('keeps linked initial-trait suppression distinct from an absent state trait', () => {
    const current = state();
    (current.traits.attacker as Map<string, boolean>).set('alignmentChaotic', true);
    const expression: ConditionExpression = {
      kind: 'trait',
      scope: 'attacker',
      trait: 'alignmentChaotic',
      present: true,
    };
    expect(evaluateConditionExpression(expression, current)).toBe(true);
    current.initialTraitSuppressions.attacker = new Set(['alignmentChaotic']);
    expect(evaluateConditionExpression(expression, current)).toBe(false);
  });

  it('keeps evaluator and solver aligned across initial, state, and combined actor traits', () => {
    const values = [undefined, false, true] as const;
    for (const actor of ['attacker', 'target'] as const) {
      const stateScope: TraitScope = actor === 'attacker' ? 'attackerState' : 'targetState';
      for (const initial of values)
        for (const stateValue of values)
          for (const conditionScope of [actor, stateScope])
            for (const present of [false, true]) {
              const current = state();
              const initialTraits = current.traits[actor] as Map<string, boolean>;
              const stateTraits = current.traits[stateScope] as Map<string, boolean>;
              if (initial !== undefined) initialTraits.set('timedTrait', initial);
              if (stateValue !== undefined) stateTraits.set('timedTrait', stateValue);
              const expression: ConditionExpression = {
                kind: 'trait',
                scope: conditionScope,
                trait: 'timedTrait',
                present,
              };
              const evaluation = evaluateConditionExpression(expression, current);
              const fixedFacts: FixedConstraintFact[] = [
                ...(initial === undefined
                  ? []
                  : [
                      {
                        sourceKey: `${actor}:initial`,
                        fact: {
                          kind: 'trait' as const,
                          scope: actor,
                          trait: 'timedTrait',
                          present: initial,
                        },
                      },
                    ]),
                ...(stateValue === undefined
                  ? []
                  : [
                      {
                        sourceKey: `${actor}:state`,
                        fact: {
                          kind: 'trait' as const,
                          scope: stateScope,
                          trait: 'timedTrait',
                          present: stateValue,
                        },
                      },
                    ]),
              ];
              const validation = validateConstraintSet({
                fixedFacts,
                expressions: [{ sourceKey: `${conditionScope}:condition`, expression }],
              });
              expect(
                validation.status,
                `${conditionScope}:${String(initial)}:${String(stateValue)}:${present}`,
              ).toBe(evaluation === false ? 'conflict' : 'satisfied');
            }
    }
  });

  it('re-derives the combined actor trait after state grant and removal', () => {
    const combined: ConditionExpression = {
      kind: 'trait',
      scope: 'target',
      trait: 'undead',
      present: true,
    };
    const stateOnly: ConditionExpression = { ...combined, scope: 'targetState' };
    const before = state();
    (before.traits.target as Map<string, boolean>).set('undead', false);
    const granted = state();
    (granted.traits.target as Map<string, boolean>).set('undead', false);
    (granted.traits.targetState as Map<string, boolean>).set('undead', true);
    const removed = state();
    (removed.traits.target as Map<string, boolean>).set('undead', false);
    (removed.traits.targetState as Map<string, boolean>).set('undead', false);

    expect(evaluateConditionExpression(combined, before)).toBeNull();
    expect(evaluateConditionExpression(combined, granted)).toBe(true);
    expect(evaluateConditionExpression(stateOnly, granted)).toBe(true);
    expect(evaluateConditionExpression(combined, removed)).toBe(false);
    expect(evaluateConditionExpression(stateOnly, removed)).toBe(false);

    const validateSnapshot = (stateValue: boolean | undefined, expression: ConditionExpression) =>
      validateConstraintSet({
        fixedFacts: [
          {
            sourceKey: 'initial:not-undead',
            fact: { kind: 'trait', scope: 'target', trait: 'undead', present: false },
          },
          ...(stateValue === undefined
            ? []
            : [
                {
                  sourceKey: 'state:undead',
                  fact: {
                    kind: 'trait' as const,
                    scope: 'targetState' as const,
                    trait: 'undead',
                    present: stateValue,
                  },
                },
              ]),
        ],
        expressions: [{ sourceKey: 'condition:undead', expression }],
      }).status;
    expect(validateSnapshot(undefined, combined)).toBe('satisfied');
    expect(validateSnapshot(true, combined)).toBe('satisfied');
    expect(validateSnapshot(true, stateOnly)).toBe('satisfied');
    expect(validateSnapshot(false, combined)).toBe('conflict');
    expect(validateSnapshot(false, stateOnly)).toBe('conflict');
  });

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
    expect(evaluateConditionExpression(stateOnly, state(['confusion']))).toBeNull();
    expect(evaluateConditionExpression(stateOnly, state([], ['confusion']))).toBe(true);
    expect(
      evaluateConditionExpression(
        { kind: 'trait', scope: 'target', trait: 'confusion', present: false },
        state([], ['confusion']),
      ),
    ).toBe(false);
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
      gameActivation: 'npBeforeDamage',
      sourceActive: true,
      proc: { kind: 'guaranteed' },
      procRatePermille: 1_000,
      valuePermille: 1_500,
      value: 1.5,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'npSpecial',
      source: {
        origin: 'np',
        sourceInstanceId: 'source',
        sourceId: 'source',
        skillId: 'skill',
        effectId: 'effect',
        effectOccurrenceId: 'effect:0',
      },
      activationSources: [],
      executionSupport: 'supported',
      outcome: 'notApplied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: [],
      decision: {
        state: 'enabled',
        decisionKey: 'projection',
        kind: 'effect',
        plan: { activation: 'user', condition: 'userMayAssume' },
      },
      conditionDecision: 'evaluate',
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

  it('does not read the attacker quantity for another source owner', () => {
    const input = state();
    input.quantities.battlePointPhase = 10;
    expect(
      evaluateConditionExpression(
        {
          kind: 'quantity',
          quantity: 'battlePointPhase',
          subjectId: 'support-source',
          comparison: 'atMost',
          value: 1,
        },
        input,
      ),
    ).toBeNull();
  });
});
