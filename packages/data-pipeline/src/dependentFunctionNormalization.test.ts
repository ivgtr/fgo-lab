import { describe, expect, it } from 'vitest';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
import {
  isPlainDependentFunction,
  parseDependentFunctionCell,
} from './dependentFunctionNormalization';

const child: AtlasFunction = {
  funcId: 41,
  funcType: 'lossNp',
  funcTargetType: 'ptOther',
  funcTargetTeam: 'player',
};

const cell: AtlasFunctionValue = {
  Rate: 1000,
  DependFuncId: 41,
  DependFunc: child,
  DependFuncVals: { Rate: 1000, Value: 2800, Value2: 1500 },
  HideMiss: 1,
};

describe('dependent function normalization boundary', () => {
  it('returns the shared typed envelope without assigning NP or HP meaning', () => {
    expect(parseDependentFunctionCell(cell)).toEqual({
      child,
      values: { Rate: 1000, Value: 2800, Value2: 1500 },
      cellRate: 1000,
    });
  });

  it('keeps the explicit plain-function metadata contract for parent script policies', () => {
    const parent: AtlasFunction = {
      funcType: 'gainHpFromTargets',
      funcTargetType: 'self',
      funcTargetTeam: 'player',
      svals: [cell],
    };
    expect(isPlainDependentFunction(parent)).toBe(true);
    expect(isPlainDependentFunction({ ...parent, svals: [] })).toBe(true);
    expect(
      isPlainDependentFunction(
        { ...parent, script: { funcIndividuality: [{ id: 1 }] } },
        'funcIndividualityOnly',
      ),
    ).toBe(true);
    expect(
      isPlainDependentFunction(
        { ...parent, script: { condition: { Value: 1 } } },
        'funcIndividualityOnly',
      ),
    ).toBe(false);
  });

  it('fails closed for unresolved identity, rates, nested writers, and unknown metadata', () => {
    for (const replacement of [
      { DependFuncId: 42 },
      { DependFunc: { ...child, funcId: undefined } },
      { Rate: -1 },
      { DependFuncVals: { Rate: 999, Value: 2800 } },
      { DependFuncVals: { Rate: 1000, Value: 2800, DependFunc: child } },
      { Future: 1 },
    ])
      expect(parseDependentFunctionCell({ ...cell, ...replacement })).toBeNull();
  });
});
