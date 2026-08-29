import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  ActivationContext,
  BattleExecutionResult,
  BattleExecutionState,
  BattleOperation,
  ConditionExpression,
  EffectDecision,
  EffectProjection,
  ExecutableBattleState,
  OperationResult,
  RejectedBattleState,
  WorldFactAssertion,
} from './index';
import { canonicalExclusiveGroup } from './index';
import { normalizeTraitCondition } from './condition';

describe('ordered battle execution contracts', () => {
  it('normalizes NP and command-card scopes for the NP execution path', () => {
    expect(
      normalizeTraitCondition(
        { operator: 'any', traits: [{ name: 'cardNP', negative: false, layer: 'combined' }] },
        'attacker',
      ),
    ).toEqual({ kind: 'always' });
    expect(
      normalizeTraitCondition(
        { operator: 'any', traits: [{ name: 'faceCard', negative: false, layer: 'combined' }] },
        'attacker',
      ),
    ).toEqual({ kind: 'not', expression: { kind: 'always' } });
  });

  it('keeps conditions, effect decisions, and world facts as separate contracts', () => {
    const condition: ConditionExpression = {
      kind: 'all',
      expressions: [
        { kind: 'card', card: 'buster' },
        {
          kind: 'any',
          expressions: [
            { kind: 'trait', scope: 'field', trait: 'milleniumCastle', present: true },
            {
              kind: 'not',
              expression: { kind: 'trait', scope: 'target', trait: 'divine', present: true },
            },
          ],
        },
      ],
    };
    const decision: EffectDecision = {
      decisionKey: 'np:field:milleniumCastle',
      operationEnabled: true,
      conditionSatisfaction: 'assumeSatisfied',
    };
    const assertion: WorldFactAssertion = {
      decisionKey: 'np:trait-count:milleniumCastle',
      fact: {
        kind: 'trait',
        scope: 'field',
        trait: 'milleniumCastle',
        present: true,
      },
    };
    expect(condition).toMatchObject({ kind: 'all' });
    expect(decision).toMatchObject({ conditionSatisfaction: 'assumeSatisfied' });
    expect(assertion.fact).toEqual({
      kind: 'trait',
      scope: 'field',
      trait: 'milleniumCastle',
      present: true,
    });
  });

  it('classifies mutually exclusive condition traits without effect identity', () => {
    expect(canonicalExclusiveGroup('target', 'attributeSky')).toBe('worldAttribute');
    expect(canonicalExclusiveGroup('target', 'attributeEarth')).toBe('worldAttribute');
    expect(canonicalExclusiveGroup('field', 'fieldHeaven')).toBe('fieldRealm');
    expect(canonicalExclusiveGroup('field', 'fieldHell')).toBe('fieldRealm');
    expect(canonicalExclusiveGroup('target', 'dragon')).toBeNull();
  });

  it('normalizes attacker card traits into the derived card predicate', () => {
    expect(
      normalizeTraitCondition(
        {
          operator: 'all',
          traits: [
            { name: 'cardArts', negative: false, layer: 'combined' },
            { name: 'cardBuster', negative: true, layer: 'combined' },
          ],
        },
        'attacker',
      ),
    ).toEqual({
      kind: 'all',
      expressions: [
        { kind: 'card', card: 'arts' },
        { kind: 'not', expression: { kind: 'card', card: 'buster' } },
      ],
    });
  });

  it('models every R1 operation as a discriminated union without servant identity', () => {
    expectTypeOf<BattleOperation['kind']>().toEqualTypeOf<
      | 'addTrait'
      | 'removeTrait'
      | 'suppressInitialTrait'
      | 'addQuantity'
      | 'addModifier'
      | 'changeModifierRate'
      | 'selectNoblePhantasmVariant'
      | 'transformActorForm'
      | 'ignoreDefense'
      | 'ignoreDamageCut'
      | 'executeNpDamage'
    >();
    expectTypeOf<BattleOperation>().not.toHaveProperty('servantId');
    expectTypeOf<ExecutableBattleState>().not.toHaveProperty('servantId');
  });

  it('keeps rejected activation state outside executable evaluator state', () => {
    expectTypeOf<ExecutableBattleState['activationContext']>().toEqualTypeOf<ActivationContext>();
    expectTypeOf<OperationResult['state']>().toEqualTypeOf<ExecutableBattleState>();
    expectTypeOf<BattleExecutionState>().toEqualTypeOf<
      ExecutableBattleState | RejectedBattleState
    >();
    expectTypeOf<BattleExecutionResult['state']>().toEqualTypeOf<BattleExecutionState>();
  });

  it('projects visibility and controls without parsing explanations', () => {
    expectTypeOf<EffectProjection['visibility']>().toEqualTypeOf<'visible' | 'hidden'>();
    expectTypeOf<EffectProjection['controllability']>().toEqualTypeOf<'automatic' | 'user'>();
    expectTypeOf<OperationResult['outcome']>().toEqualTypeOf<
      'applied' | 'notApplied' | 'notRelevant' | 'impossible' | 'unsupported'
    >();
  });
});
