import { describe, expect, it } from 'vitest';
import type { ConditionExpression } from './index';
import { validateConstraintSet, type FixedConstraintFact } from './constraints';

const trait = (
  sourceKey: string,
  scope: 'target' | 'field',
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

  it('distinguishes explicit negative facts from unknown traits', () => {
    const dragon = condition('effect:dragon', {
      kind: 'trait',
      scope: 'target',
      trait: 'dragon',
      present: true,
    });
    expect(
      validateConstraintSet({
        fixedFacts: [trait('world:not-dragon', 'target', 'dragon', false)],
        expressions: [dragon],
      }),
    ).toMatchObject({
      status: 'conflict',
      issue: { conflicts: [{ kind: 'traitPolarity', trait: 'dragon' }] },
    });
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
});
