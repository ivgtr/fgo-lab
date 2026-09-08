import { describe, expect, it } from 'vitest';
import { readHpAtLevel } from './hpGrowth';

describe('canonical HP level lookup', () => {
  it('uses the exact level cell, including explicit zero, without interpolation', () => {
    expect(readHpAtLevel({ '1': 0, '2': 37, '4': 99 }, 2)).toBe(37);
    expect(readHpAtLevel({ '1': 0 }, 1)).toBe(0);
    expect(readHpAtLevel({ '1': 0, '4': 99 }, 3)).toBeNull();
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rejects an invalid level %s', (level) => {
    expect(readHpAtLevel({ '1': 20 }, level)).toBeNull();
  });
  it.each([-1, NaN, Infinity, 1.5])('rejects malformed HP %s', (hp) => {
    expect(readHpAtLevel({ '1': hp }, 1)).toBeNull();
  });
});
