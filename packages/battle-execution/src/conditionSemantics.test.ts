import { describe, expect, it } from 'vitest';
import type { ConditionExpression } from './contracts';
import { classifyContributionCondition, targetConditionWitnessSpace } from './conditionSemantics';

describe('target condition witness space', () => {
  it('simplifies nested intrinsic attack facts before classifying external dependencies', () => {
    const attack = {
      card: 'buster' as const,
      noblePhantasmVariant: {
        actorFormId: { actorId: '100300', limitCount: 0 },
        noblePhantasmId: '100301',
      },
    };
    expect(
      classifyContributionCondition(
        {
          kind: 'any',
          expressions: [
            { kind: 'card', card: 'buster' },
            { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
          ],
        },
        attack,
      ),
    ).toBe('intrinsicSatisfied');
    expect(
      classifyContributionCondition(
        {
          kind: 'all',
          expressions: [
            { kind: 'card', card: 'buster' },
            {
              kind: 'not',
              expression: { kind: 'noblePhantasmVariant', variant: attack.noblePhantasmVariant },
            },
          ],
        },
        attack,
      ),
    ).toBe('intrinsicUnsatisfied');
  });

  it('does not let boolean simplification hide unsupported semantics', () => {
    expect(
      classifyContributionCondition({
        kind: 'any',
        expressions: [{ kind: 'always' }, { kind: 'unsupported', reason: 'unresolvedRecipient' }],
      }),
    ).toBe('unsupported');
  });

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
