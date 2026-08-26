import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  BattleOperation,
  BattleState,
  ConditionExpression,
  EffectDecision,
  EffectProjection,
  OperationResult,
  WorldFactAssertion,
} from './index';
import { canonicalExclusiveGroup } from './index';
import { normalizeTraitCondition } from './condition';

describe('ordered battle execution contracts', () => {
  it('normalizes NP and command-card scopes for the NP execution path', () => {
    expect(
      normalizeTraitCondition(
        { operator: 'any', traits: [{ name: 'cardNP', negative: false }] },
        'attacker',
      ),
    ).toEqual({ kind: 'always' });
    expect(
      normalizeTraitCondition(
        { operator: 'any', traits: [{ name: 'faceCard', negative: false }] },
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

  it('preserves partial trait conditions without pretending they are a trait count', () => {
    const condition: ConditionExpression = {
      kind: 'partialTrait',
      scope: 'target',
      traits: [
        { trait: 'divine', present: true },
        { trait: 'undead', present: false },
      ],
    };
    expect(condition).toEqual({
      kind: 'partialTrait',
      scope: 'target',
      traits: [
        { trait: 'divine', present: true },
        { trait: 'undead', present: false },
      ],
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
            { name: 'cardArts', negative: false },
            { name: 'cardBuster', negative: true },
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
      | 'addModifier'
      | 'changeModifierRate'
      | 'changeCardType'
      | 'ignoreDefense'
      | 'ignoreDamageCut'
      | 'executeNpDamage'
    >();
    expectTypeOf<BattleOperation>().not.toHaveProperty('servantId');
    expectTypeOf<BattleState>().not.toHaveProperty('servantId');
  });

  it('projects visibility and controls without parsing explanations', () => {
    expectTypeOf<EffectProjection['visibility']>().toEqualTypeOf<'visible' | 'hidden'>();
    expectTypeOf<EffectProjection['controllability']>().toEqualTypeOf<'automatic' | 'user'>();
    expectTypeOf<OperationResult['outcome']>().toEqualTypeOf<
      'applied' | 'notApplied' | 'notRelevant' | 'impossible' | 'unsupported'
    >();
  });
});
