import { describe, expect, it } from 'vitest';
import { probeRawNiceGrowth } from './probeRawNiceGrowth';

function input() {
  return {
    rawServants: [{ id: 900, type: 6, expType: 1 }],
    rawLimits: [
      {
        svtId: 900,
        limitCount: 0,
        rarity: 3,
        lvMax: 2,
        atkBase: 100,
        atkMax: 200,
        hpBase: 10,
        hpMax: 30,
      },
    ],
    rawExperience: [
      { type: 1, lv: 0, curve: 0 },
      { type: 1, lv: 1, curve: 250 },
      { type: 1, lv: 2, curve: 1000 },
    ],
    niceEnums: { NiceSvtType: { '6': 'servantEquip' } },
    niceServants: [],
    niceCraftEssences: [
      {
        id: 900,
        rarity: 3,
        lvMax: 2,
        atkBase: 100,
        atkMax: 200,
        hpBase: 10,
        hpMax: 30,
        atkGrowth: [125, 200],
        hpGrowth: [15, 30],
      },
    ],
  };
}

describe('raw/nice growth feasibility probe', () => {
  it('derives growth cells independently from raw curve and limit values', () => {
    expect(probeRawNiceGrowth(input())).toEqual({
      scope: 'published-servant-and-equip-growth-only',
      entities: 1,
      growthCells: 4,
    });
  });

  it('rejects changed growth values and missing source levels', () => {
    const changed = input();
    changed.niceCraftEssences[0]!.atkGrowth[1] = 201;
    expect(() => probeRawNiceGrowth(changed)).toThrow('growth_probe:mismatch:900:atkGrowth');
    const missing = input();
    missing.rawExperience.pop();
    expect(() => probeRawNiceGrowth(missing)).toThrow('raw_growth:missing_level:1:2');
  });
});
