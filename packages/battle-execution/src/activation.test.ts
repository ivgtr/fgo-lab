import { describe, expect, it } from 'vitest';
import { conditionRequiresTrait } from './activation';
import type { ConditionExpression } from './index';

const sunlight: ConditionExpression = {
  kind: 'trait',
  scope: 'field',
  trait: 'fieldSunlight',
  present: true,
};
const shore: ConditionExpression = {
  kind: 'trait',
  scope: 'field',
  trait: 'fieldShore',
  present: true,
};

describe('attacker skill mutation activation planning', () => {
  it('requires a trait from an AND clause but not from only one OR branch', () => {
    expect(
      conditionRequiresTrait(
        { kind: 'all', expressions: [sunlight, shore] },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(true);
    expect(
      conditionRequiresTrait(
        { kind: 'any', expressions: [sunlight, shore] },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(false);
  });

  it('accepts an OR only when every satisfiable branch requires the same trait', () => {
    expect(
      conditionRequiresTrait(
        {
          kind: 'any',
          expressions: [sunlight, { kind: 'all', expressions: [sunlight, shore] }],
        },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(true);
  });

  it('preserves NOT polarity and combined actor scope semantics', () => {
    expect(
      conditionRequiresTrait(
        {
          kind: 'not',
          expression: { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: false },
        },
        'field',
        'fieldSunlight',
        true,
      ),
    ).toBe(true);
    expect(
      conditionRequiresTrait(
        { kind: 'trait', scope: 'target', trait: 'undead', present: true },
        'targetState',
        'undead',
        true,
      ),
    ).toBe(true);
    expect(
      conditionRequiresTrait(
        { kind: 'trait', scope: 'target', trait: 'undead', present: false },
        'targetState',
        'undead',
        false,
      ),
    ).toBe(false);
  });
});
