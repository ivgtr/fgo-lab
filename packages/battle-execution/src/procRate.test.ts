import { describe, expect, it } from 'vitest';
import { effectiveProcRate } from './procRate';

describe('status application rate', () => {
  const proc = {
    kind: 'singleRoll' as const,
    ratePermille: [[1200], [], [], [], []] as [number[], number[], number[], number[], number[]],
    netAdjustmentInputKey: 'effect:statusApplicationAdjustment',
  };

  it('keeps Atlas base rate above 1000 until target adjustment is applied', () => {
    expect(effectiveProcRate(proc, 1200, -300)).toBe(901);
    expect(effectiveProcRate(proc, 1200, 0)).toBe(1000);
    expect(effectiveProcRate(proc, 700, -800)).toBe(0);
    expect(effectiveProcRate(proc, 0, 0)).toBe(1);
  });

  it('rejects absent adjustment and invalid rates', () => {
    expect(() => effectiveProcRate(proc, 1200, null)).toThrow(
      'invalid_status_application_adjustment',
    );
    expect(() => effectiveProcRate(proc, 5001, 0)).toThrow('invalid_source_proc_cell');
  });
});
