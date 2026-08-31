import { describe, expect, it } from 'vitest';
import type { ConditionExpression } from './contracts';
import { targetConditionWitnessSpace } from './conditionSemantics';

describe('target condition witness space', () => {
  it('expands combined target reads across initial and state facts through nested expressions', () => {
    const condition: ConditionExpression = {
      kind: 'not',
      expression: {
        kind: 'any',
        expressions: [
          { kind: 'trait', scope: 'target', trait: 'superGiant', present: false },
          {
            kind: 'all',
            expressions: [
              { kind: 'trait', scope: 'targetState', trait: 'burning', present: true },
              {
                kind: 'targetPredicate',
                scope: 'target',
                predicate: { kind: 'familyMembership', familyId: 'beast' },
                present: false,
              },
            ],
          },
        ],
      },
    };

    expect(targetConditionWitnessSpace(condition)).toEqual({
      traitFacts: [
        { scope: 'target', trait: 'superGiant' },
        { scope: 'targetState', trait: 'burning' },
        { scope: 'targetState', trait: 'superGiant' },
      ],
      predicates: [{ kind: 'familyMembership', familyId: 'beast' }],
    });
  });

  it.each(['atLeast', 'atMost', 'equal'] as const)(
    'exposes every physical trait read by target traitCount %s',
    (comparison) => {
      expect(
        targetConditionWitnessSpace({
          kind: 'traitCount',
          scope: 'target',
          traits: ['divine', 'dragon'],
          comparison,
          count: 1,
        }).traitFacts,
      ).toEqual([
        { scope: 'target', trait: 'divine' },
        { scope: 'target', trait: 'dragon' },
        { scope: 'targetState', trait: 'divine' },
        { scope: 'targetState', trait: 'dragon' },
      ]);
    },
  );
});
