import { describe, expect, it } from 'vitest';
import type { CanonicalOutcomeGroup, EffectProc } from '@fgo-lab/master-data';
import {
  executeStochasticPossibilities,
  selectBinaryStochasticPossibility,
  selectStochasticPossibility,
  stochasticGroupKey,
} from './stochasticPossibilities';

describe('concrete stochastic possibility execution', () => {
  it('keeps sibling reads of one group correlated and command clocks distinct', () => {
    const group: CanonicalOutcomeGroup = {
      kind: 'binary',
      key: 'group',
      defaultOutcome: 'failure',
    };
    const first = stochasticGroupKey('attacker', 'actor', 'skill', group, 'command:0');
    const second = stochasticGroupKey('attacker', 'actor', 'skill', group, 'command:1');
    const execution = executeStochasticPossibilities((selection) => [
      selectBinaryStochasticPossibility(first, 500, selection),
      selectBinaryStochasticPossibility(first, 500, selection),
      selectBinaryStochasticPossibility(second, 500, selection),
    ]);
    expect(execution.executions.map(({ value }) => value)).toEqual([
      ['failure', 'failure', 'failure'],
      ['failure', 'failure', 'success'],
      ['success', 'success', 'failure'],
      ['success', 'success', 'success'],
    ]);
    expect(execution.illegalWitnesses).toEqual([]);
    expect(execution.branching).toHaveLength(3);
  });

  it('uses actual rate cells and never invents a success at zero or failure at 1000', () => {
    const execution = executeStochasticPossibilities((selection) => [
      selectBinaryStochasticPossibility('zero', 0, selection),
      selectBinaryStochasticPossibility('full', 1000, selection),
    ]);
    expect(execution.executions.map(({ value }) => value)).toEqual([['failure', 'success']]);
    expect(execution.branching).toEqual([]);
    expect(execution.attemptedExecutionCount).toBe(1);
  });

  it('keeps chained success counts as prefixes rather than independent sibling booleans', () => {
    const group: CanonicalOutcomeGroup = {
      kind: 'successCount',
      key: 'chain',
      maximumSuccesses: 2,
      defaultOutcome: 'minimum',
    };
    const proc = (index: number): EffectProc => ({
      kind: 'chainedRolls',
      index,
      maximumSuccesses: 2,
      seriesKey: 'chain',
      ratePermille: [[500], [], [], [], []],
    });
    const execution = executeStochasticPossibilities((selection) => [
      selectStochasticPossibility('chain', proc(0), group, 500, selection),
      selectStochasticPossibility('chain', proc(1), group, 500, selection),
    ]);
    expect(execution.executions.map(({ value }) => value)).toEqual([
      ['failure', 'failure'],
      ['success', 'failure'],
      ['success', 'success'],
    ]);
  });

  it('propagates unknown execution failures and does not publish the partial branch', () => {
    const original = new TypeError('missing_physical_state');
    const prior = { gauge: 10000 };
    expect(() =>
      executeStochasticPossibilities((selection) => {
        const state = { ...prior };
        if (selectBinaryStochasticPossibility('charge', 500, selection) === 'success')
          state.gauge += 5000;
        throw original;
      }),
    ).toThrow(original);
    expect(prior).toEqual({ gauge: 10000 });
  });
});
