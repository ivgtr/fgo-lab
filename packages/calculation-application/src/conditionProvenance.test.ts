import type { ConditionExpression } from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { conditionFactRequirements } from './conditionProvenance';

describe('condition provenance scope ownership', () => {
  it.each([
    ['attacker', 'intrinsic'],
    ['attackerState', 'derivedOrExternalField'],
    ['target', 'target'],
    ['targetState', 'target'],
    ['field', 'derivedOrExternalField'],
  ] as const)('classifies trait and traitCount %s as %s', (scope, kind) => {
    const conditions: ConditionExpression[] = [
      { kind: 'trait', scope, trait: 'fixtureTrait', present: true },
      { kind: 'traitCount', scope, traits: ['fixtureTrait'], comparison: 'atLeast', count: 1 },
    ];
    expect(conditions.flatMap((condition) => conditionFactRequirements(condition))).toEqual([
      { kind, condition: conditions[0], negated: false },
      { kind, condition: conditions[1], negated: false },
    ]);
  });
});
