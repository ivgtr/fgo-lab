import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  BattleOperation,
  BattleState,
  ConditionExpression,
  EffectProjection,
  OperationResult,
  ScenarioAssumption,
} from './index';

describe('ordered battle execution contracts', () => {
  it('keeps conditions lossless and assumptions scoped to one state fact', () => {
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
    const assumption: ScenarioAssumption = {
      decisionKey: 'np:field:milleniumCastle',
      enabled: true,
      assertion: { kind: 'trait', scope: 'field', trait: 'milleniumCastle', present: true },
    };
    expect(condition).toMatchObject({ kind: 'all' });
    expect(assumption.assertion).toEqual({
      kind: 'trait',
      scope: 'field',
      trait: 'milleniumCastle',
      present: true,
    });
  });

  it('models every R1 operation as a discriminated union without servant identity', () => {
    expectTypeOf<BattleOperation['kind']>().toEqualTypeOf<
      | 'addTrait'
      | 'removeTrait'
      | 'addModifier'
      | 'changeModifierRate'
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
