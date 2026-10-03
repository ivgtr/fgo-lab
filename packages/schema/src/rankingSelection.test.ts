import { describe, expect, it } from 'vitest';
import { resolvedRankingBasisSchema } from './rankingSelection';

const common = {
  servantId: 'basis-fixture',
  growthBasis: 'common',
  level: 90,
  npLevel: 2,
  initialOvercharge: 2,
  levelSource: 'uniformLevel90',
  npSource: 'specified',
  fouAtk: 1000,
  skillLevels: { '1': 10, '2': 10 },
};
const saved = {
  ...common,
  growthBasis: 'saved',
  levelSource: 'ownedLevel',
  npSource: 'owned',
  fouAtk: 1234,
  skillLevels: { '1': 1, '2': 5, '3': 9 },
};

describe('resolved ranking growth basis identity', () => {
  it.each([common, saved])('retains every selected value without conversion', (basis) => {
    expect(resolvedRankingBasisSchema.parse(basis)).toEqual(basis);
  });

  it('keeps common owned Lv and NP selections with common Fou and skill levels', () => {
    const basis = { ...common, levelSource: 'ownedLevel', npSource: 'owned' };
    expect(resolvedRankingBasisSchema.parse(basis)).toEqual(basis);
  });

  it.each([
    { ...saved, levelSource: 'naturalLimit' },
    { ...saved, levelSource: 'uniformLevel90' },
    { ...saved, npSource: 'specified' },
    { ...common, fouAtk: 999 },
    { ...common, skillLevels: { '1': 9 } },
    { ...saved, skillLevels: { '1': 0 } },
    { ...saved, skillLevels: { '4': 10 } },
    { ...saved, fouAtk: 3001 },
    { ...saved, unknown: true },
  ])('rejects contradictory or unknown metadata', (basis) => {
    expect(resolvedRankingBasisSchema.safeParse(basis).success).toBe(false);
  });

  it.each([common, saved])('allows no-slot servants without inventing skill levels', (basis) => {
    const noSlots = { ...basis, skillLevels: {} };
    expect(resolvedRankingBasisSchema.parse(noSlots)).toEqual(noSlots);
  });

  it.each([0, 3000])('retains the saved Fou boundary %s', (fouAtk) => {
    expect(resolvedRankingBasisSchema.parse({ ...saved, fouAtk }).fouAtk).toBe(fouAtk);
  });

  it('rejects the old basis shape at the current boundary', () => {
    expect(
      resolvedRankingBasisSchema.safeParse({
        servantId: 'basis-fixture',
        level: 90,
        npLevel: 2,
        initialOvercharge: 2,
        levelSource: 'uniformLevel90',
        npSource: 'specified',
      }).success,
    ).toBe(false);
  });
});
