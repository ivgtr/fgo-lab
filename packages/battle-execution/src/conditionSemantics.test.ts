import { describe, expect, it } from 'vitest';
import { analyzeActivationFactSet, type ActivationFact } from '@fgo-lab/schema';
import type { ConditionExpression } from './contracts';
import {
  classifyContributionCondition,
  targetConditionWitnessSpace,
  traitConditionScopeSemantics,
} from './conditionSemantics';

describe('trait condition scope semantics', () => {
  it.each([
    ['attacker', 'attacker', 'combined', ['attacker', 'attackerState']],
    ['attackerState', 'attacker', 'state', ['attackerState']],
    ['target', 'target', 'combined', ['target', 'targetState']],
    ['targetState', 'target', 'state', ['targetState']],
    ['field', 'field', 'field', ['field']],
  ] as const)('classifies %s from the canonical scope table', (scope, actor, layer, readScopes) => {
    expect(traitConditionScopeSemantics(scope)).toMatchObject({ actor, layer, readScopes });
  });
});

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

  it('classifies nested card, variant, terminal trait, choice, and trigger facts together', () => {
    const source = {
      origin: 'attacker' as const,
      sourceInstanceId: 'attacker:fixture',
      skillId: 'skill',
    };
    const facts: ActivationFact[] = [
      { kind: 'choice', source, family: 'mode', candidate: 'selected' },
      { kind: 'operationTrigger', source, position: 7 },
    ];
    const activation = analyzeActivationFactSet(facts);
    if (activation.status !== 'valid') throw new Error(activation.status);
    const variant = {
      actorFormId: { actorId: 'fixture', limitCount: 0 },
      noblePhantasmId: 'np',
    };
    expect(
      classifyContributionCondition(
        {
          kind: 'all',
          expressions: [
            { kind: 'card', card: 'buster' },
            { kind: 'noblePhantasmVariant', variant },
            { kind: 'trait', scope: 'attacker', trait: 'alignmentEvil', present: true },
            { kind: 'choice', source, family: 'mode', candidate: 'selected' },
            {
              kind: 'any',
              expressions: [
                { kind: 'operationTrigger', source, position: 7 },
                { kind: 'card', card: 'arts' },
              ],
            },
          ],
        },
        {
          card: 'buster',
          noblePhantasmVariant: variant,
          attackerTraits: new Map([['alignmentEvil', true]]),
          activationFacts: activation.factSet,
        },
      ),
    ).toBe('intrinsicSatisfied');
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
