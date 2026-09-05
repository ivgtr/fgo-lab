import { describe, expect, it } from 'vitest';
import type { NpDamageSpec } from '@fgo-lab/master-data';
import { normalizeEffectStackInputs, normalizeNpStackQuantity } from './stackQuantityNormalization';

const cells = (maximum?: number) =>
  Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({
      ratePermille: 1000,
      valuePermille: 3000,
      targetId: 0,
      targetTraits: [{ kind: 'trait', name: 'fixture' }],
      maximumTargetCount: maximum,
    })),
  ) as NpDamageSpec['parametersByOvercharge'];

describe('stack quantity source normalization', () => {
  it('separates explicit maximum, finite matching traits and missing support', () => {
    expect(normalizeNpStackQuantity(cells(4))).toMatchObject({
      kind: 'stacks',
      inputs: [
        {
          maximum: 4,
          defaultValue: 0,
          quantitySource: { scope: 'attackerState', trait: 'fixture' },
        },
      ],
    });
    expect(normalizeNpStackQuantity(cells(0))).toEqual({ kind: 'finiteTraits' });
    expect(normalizeNpStackQuantity(cells())).toEqual({
      kind: 'unsupported',
      reason: 'missing_stack_maximum',
    });
    const varying = cells(4);
    varying[4][4].maximumTargetCount = 10;
    expect(normalizeNpStackQuantity(varying).kind).toBe('unsupported');
  });
  it('expands aggregate sources into shared physical identities and never fabricates six', () => {
    const names = new Map([
      [1, 'alpha'],
      [2, 'beta'],
    ]);
    const raw = { ParamAddSelfIndividuality: [1, 2], ParamAddMaxCount: 5 };
    const result = normalizeEffectStackInputs([raw], names);
    expect(result.inputs.map(({ key }) => key)).toEqual([
      'stack:attackerState:alpha',
      'stack:attackerState:beta',
    ]);
    expect(normalizeEffectStackInputs([{ ParamAddSelfIndividuality: [1] }], names)).toMatchObject({
      inputs: [],
      unsupported: 'missing_or_unsupported_stack_maximum',
    });
    expect(
      normalizeEffectStackInputs([{ ...raw, ParamAddSelfIndividuality: [-1] }], names).unsupported,
    ).toBeDefined();
  });
});
