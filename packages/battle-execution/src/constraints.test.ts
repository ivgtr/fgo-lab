import { describe, expect, it } from 'vitest';
import { QUANTITY_FACT_DOMAINS, type QuantityFactName } from '@fgo-lab/schema';
import type { ConditionExpression, TraitScope } from './index';
import { validateConstraintSet, type FixedConstraintFact } from './constraints';

const trait = (
  sourceKey: string,
  scope: TraitScope,
  name: string,
  present = true,
): FixedConstraintFact => ({
  sourceKey,
  fact: { kind: 'trait', scope, trait: name, present },
});

const condition = (sourceKey: string, expression: ConditionExpression) => ({
  sourceKey,
  expression,
});

const quantity = (
  sourceKey: string,
  name: QuantityFactName,
  value: number,
): FixedConstraintFact => ({
  sourceKey,
  fact: { kind: 'quantity', quantity: name, value },
});

describe('unified constraint validation', () => {
  it('detects canonical trait and field conflicts across fixed facts and conditions', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:sky', 'target', 'attributeSky')],
        expressions: [
          condition('effect:earth', {
            kind: 'trait',
            scope: 'target',
            trait: 'attributeEarth',
            present: true,
          }),
        ],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: { conflicts: [{ kind: 'exclusiveTrait', group: 'worldAttribute' }] },
    });
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:heaven', 'field', 'fieldHeaven')],
        expressions: [
          condition('effect:hell', {
            kind: 'trait',
            scope: 'field',
            trait: 'fieldHell',
            present: true,
          }),
        ],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: { conflicts: [{ kind: 'exclusiveTrait', group: 'fieldRealm' }] },
    });
  });

  it('keeps OR branches and accepts only a compatible branch', () => {
    const expression = (names: readonly string[]): ConditionExpression => ({
      kind: 'any',
      expressions: names.map((name) => ({
        kind: 'trait',
        scope: 'target',
        trait: name,
        present: true,
      })),
    });
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:sky', 'target', 'attributeSky')],
        expressions: [
          condition('effect:sky-or-earth', expression(['attributeSky', 'attributeEarth'])),
        ],
      }).status,
    ).toBe('satisfied');
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:sky', 'target', 'attributeSky')],
        expressions: [
          condition('effect:earth-or-human', expression(['attributeEarth', 'attributeHuman'])),
        ],
      }).status,
    ).toBe('conflict');
  });

  it('distinguishes initial negative, explicit state negative, and unknown traits', () => {
    const dragon = condition('effect:dragon', {
      kind: 'trait',
      scope: 'target',
      trait: 'dragon',
      present: true,
    });
    expect(
      validateConstraintSet({
        fixedFacts: [
          trait('world:not-dragon', 'target', 'dragon', false),
          trait('world:not-state-dragon', 'targetState', 'dragon', false),
        ],
        expressions: [dragon],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: { conflicts: [{ kind: 'traitPolarity', trait: 'dragon' }] },
    });
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:not-initial-dragon', 'target', 'dragon', false)],
        expressions: [dragon],
      }).status,
    ).toBe('satisfied');
    expect(validateConstraintSet({ fixedFacts: [], expressions: [dragon] }).status).toBe(
      'satisfied',
    );
  });

  it('intersects exact quantity facts and conditions', () => {
    const rarity = (sourceKey: string, value: number): FixedConstraintFact => ({
      sourceKey,
      fact: { kind: 'quantity', quantity: 'targetRarity', value },
    });
    const rarityCondition = (value: number) =>
      condition('effect:rarity', {
        kind: 'quantity',
        quantity: 'targetRarity',
        comparison: 'equal',
        value,
      });
    expect(
      validateConstraintSet({
        fixedFacts: [rarity('world:rarity', 5)],
        expressions: [rarityCondition(4)],
      }).status,
    ).toBe('conflict');
    expect(
      validateConstraintSet({
        fixedFacts: [rarity('world:rarity', 5)],
        expressions: [rarityCondition(5)],
      }).status,
    ).toBe('satisfied');
  });

  it('rejects fixed quantity facts outside their canonical domains', () => {
    for (const quantity of Object.keys(QUANTITY_FACT_DOMAINS) as QuantityFactName[]) {
      const domain = QUANTITY_FACT_DOMAINS[quantity];
      for (const value of [domain.min, domain.max])
        expect(
          validateConstraintSet({
            fixedFacts: [
              { sourceKey: `world:${quantity}`, fact: { kind: 'quantity', quantity, value } },
            ],
            expressions: [],
          }).status,
          `${quantity}:${String(value)}`,
        ).toBe('satisfied');
    }
    for (const [quantity, values] of [
      ['attackerHpPermille', [-1, 1_001]],
      ['targetRarity', [-1, 6]],
      ['battlePointPhase', [-1, 11]],
    ] as const)
      for (const value of values)
        expect(
          validateConstraintSet({
            fixedFacts: [
              { sourceKey: `world:${quantity}`, fact: { kind: 'quantity', quantity, value } },
            ],
            expressions: [],
          }),
          `${quantity}:${String(value)}`,
        ).toEqual({
          status: 'unsupported',
          issue: {
            kind: 'constraintValidationUnsupported',
            sourceKeys: [`world:${quantity}`],
            reason: 'quantityFactOutOfDomain',
          },
        });
  });

  it('uses canonical actor scope semantics for fixed facts and conditions', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:super-giant', 'targetState', 'superGiant')],
        expressions: [
          condition('effect:not-super-giant', {
            kind: 'trait',
            scope: 'target',
            trait: 'superGiant',
            present: false,
          }),
        ],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: { conflicts: [{ kind: 'traitPolarity', scope: 'target', trait: 'superGiant' }] },
    });
  });

  it('attributes an initial conflict to every selected condition constraint', () => {
    const earth = (sourceKey: string) =>
      condition(sourceKey, {
        kind: 'trait',
        scope: 'target',
        trait: 'attributeEarth',
        present: true,
      });
    const result = validateConstraintSet({
      fixedFacts: [trait('world:sky', 'target', 'attributeSky')],
      expressions: [earth('effect:earth:a'), earth('effect:earth:b')],
    });
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') throw new Error('constraint conflict expected');
    expect(result.issue.sourceKeys).toEqual(
      expect.arrayContaining(['world:sky', 'effect:earth:a', 'effect:earth:b']),
    );
  });

  it('normalizes integer quantity ranges through NOT and fails on an empty range', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [
          {
            sourceKey: 'world:rarity',
            fact: { kind: 'quantity', quantity: 'targetRarity', value: 5 },
          },
        ],
        expressions: [
          condition('effect:not-five', {
            kind: 'not',
            expression: {
              kind: 'quantity',
              quantity: 'targetRarity',
              comparison: 'equal',
              value: 5,
            },
          }),
        ],
      }),
    ).toMatchObject({ status: 'conflict', issue: { conflicts: [{ kind: 'quantityRange' }] } });
    expect(
      validateConstraintSet({
        fixedFacts: [
          {
            sourceKey: 'world:hp',
            fact: { kind: 'quantity', quantity: 'attackerHpPermille', value: 500 },
          },
        ],
        expressions: [
          condition('effect:hp-range', {
            kind: 'all',
            expressions: [
              {
                kind: 'quantity',
                quantity: 'attackerHpPermille',
                comparison: 'greaterThan',
                value: 499,
              },
              {
                kind: 'quantity',
                quantity: 'attackerHpPermille',
                comparison: 'atMost',
                value: 500,
              },
            ],
          }),
        ],
      }).status,
    ).toBe('satisfied');
  });

  it('fails typed-unsupported instead of truncating excessive OR alternatives', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [
          condition('effect:too-wide', {
            kind: 'any',
            expressions: Array.from({ length: 2_049 }, (_, index) => ({
              kind: 'trait' as const,
              scope: 'target' as const,
              trait: `trait-${String(index)}`,
              present: true,
            })),
          }),
        ],
      }),
    ).toEqual({
      status: 'unsupported',
      issue: {
        kind: 'constraintValidationUnsupported',
        sourceKeys: ['effect:too-wide'],
        reason: 'constraintComplexityExceeded',
      },
    });
  });

  it('detects conflicts across nested AND, OR, and NOT without choosing the first OR branch', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:sky', 'target', 'attributeSky')],
        expressions: [
          condition('effect:nested', {
            kind: 'all',
            expressions: [
              {
                kind: 'not',
                expression: {
                  kind: 'trait',
                  scope: 'target',
                  trait: 'attributeSky',
                  present: true,
                },
              },
              {
                kind: 'any',
                expressions: [
                  {
                    kind: 'trait',
                    scope: 'target',
                    trait: 'attributeEarth',
                    present: true,
                  },
                  {
                    kind: 'trait',
                    scope: 'target',
                    trait: 'attributeHuman',
                    present: true,
                  },
                ],
              },
            ],
          }),
        ],
      }).status,
    ).toBe('conflict');
  });

  it('does not equate a source-owned quantity with the current attacker quantity', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [quantity('world:bp', 'battlePointPhase', 10)],
        expressions: [
          condition('support:bp', {
            kind: 'quantity',
            quantity: 'battlePointPhase',
            subjectId: 'support-source',
            comparison: 'atMost',
            value: 1,
          }),
        ],
      }).status,
    ).toBe('satisfied');
  });

  it('allows the same action candidate and rejects different candidates atomically', () => {
    const choice = (sourceKey: string, candidate: string) =>
      condition(sourceKey, {
        kind: 'choice',
        group: 'source:skill:actSet',
        candidate,
      });
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [choice('effect:a', '1'), choice('effect:b', '1')],
      }).status,
    ).toBe('satisfied');
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [choice('effect:a', '1'), choice('effect:b', '2')],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: {
        sourceKeys: ['effect:a', 'effect:b'],
        conflicts: [{ kind: 'choiceConflict', candidates: ['1', '2'] }],
      },
    });
  });

  it('keeps a function-position trigger as an effect-local satisfiable constraint', () => {
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [
          condition('effect:position', {
            kind: 'operationTrigger',
            source: 'attacker:skill',
            position: 2,
          }),
        ],
      }),
    ).toEqual({ status: 'satisfied', alternativeCount: 1 });
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [
          condition('effect:negated-position', {
            kind: 'not',
            expression: {
              kind: 'operationTrigger',
              source: 'attacker:skill',
              position: 2,
            },
          }),
        ],
      }),
    ).toMatchObject({ status: 'unsupported' });
  });

  it('intersects source-owned quantity ranges without creating world facts', () => {
    const sourceRange = (sourceKey: string, comparison: 'atMost' | 'atLeast', value: number) =>
      condition(sourceKey, {
        kind: 'sourceQuantity',
        quantity: 'battlePointRate',
        subjectId: '705300',
        comparison,
        value,
      });
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [
          sourceRange('effect:min', 'atLeast', 0),
          sourceRange('effect:max', 'atMost', 999),
        ],
      }).status,
    ).toBe('satisfied');
    expect(
      validateConstraintSet({
        fixedFacts: [],
        expressions: [
          sourceRange('effect:min', 'atLeast', 1_000),
          sourceRange('effect:max', 'atMost', 999),
        ],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: {
        sourceKeys: ['effect:min', 'effect:max'],
        conflicts: [{ kind: 'quantityRange', quantity: 'battlePointRate' }],
      },
    });
  });
});
