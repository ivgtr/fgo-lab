import { describe, it, expect } from 'vitest';
import { normalizeNpTransfer } from './npTransferNormalization';
import type { AtlasFunction, AtlasFunctionValue } from './atlasContract';
const fn: AtlasFunction = {
  funcType: 'gainNpFromTargets',
  funcTargetType: 'self',
  funcTargetTeam: 'player',
};
const child = {
  funcId: 1,
  funcType: 'lossNp',
  funcTargetType: 'ptOther',
  funcTargetTeam: 'player',
};
const cell: AtlasFunctionValue = {
  Rate: 1000,
  DependFuncId: 1,
  DependFunc: child,
  DependFuncVals: { Rate: 1000, Value: 2800 },
};
describe('NP transfer reference boundary', () => {
  it('retains every cost cell and separates player NP and enemy charge units', () => {
    expect(normalizeNpTransfer(fn, [[cell], [], [], [], []])?.operation).toMatchObject({
      amount: {
        donor: 'playerNp',
        costs: [[2800], [], [], [], []],
        values: [[2800], [], [], [], []],
      },
    });
    const charge = {
      ...cell,
      DependFunc: {
        ...child,
        funcType: 'delayNpturn',
        funcTargetType: 'enemyAll',
        funcTargetTeam: 'enemy',
      },
      DependFuncVals: { Rate: 1000, Value: 1, Value2: 1500 },
    };
    expect(normalizeNpTransfer(fn, [[charge], [], [], [], []])?.operation).toMatchObject({
      amount: {
        donor: 'enemyCharge',
        costs: [[1], [], [], [], []],
        values: [[1500], [], [], [], []],
      },
    });
    expect(normalizeNpTransfer(fn, [[charge]], true)).toBeNull();
  });
  it('fails closed for unknown child metadata, resistance, proc, condition, alias, or unresolved identity', () => {
    for (const patch of [
      { DependFunc: { ...child, funcTargetType: 'ptAll' } },
      { DependFunc: { ...child, functvals: [{ id: 99 }] } },
      { DependFunc: { ...child, script: { reactive: 1 } } },
      { DependFuncVals: { Rate: 999, Value: 2800 } },
      { DependFuncVals: { Rate: 1000, Value: 2800, Resistance: 0 } },
      { DependFuncVals: { Rate: 1000, Value: 2800, DependFunc: child } },
      { DependFuncId: 2 },
      { DependFuncId: undefined, DependFunc: { ...child, funcId: undefined } },
      { Rate: -1000 },
      { Future: 1 },
    ])
      expect(normalizeNpTransfer(fn, [[{ ...cell, ...patch }]])).toBeNull();
  });
});
