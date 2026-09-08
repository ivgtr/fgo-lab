import { describe, expect, it } from 'vitest';
import { normalizeAtlasSnapshot } from './index';

function normalize(hpGrowth: number[] | undefined) {
  return normalizeAtlasSnapshot({
    version: 'hp-fixture',
    servants: [
      {
        id: 1,
        collectionNo: 1,
        type: 'normal',
        name: 'actor',
        className: 'saber',
        rarity: 5,
        atkGrowth: [900, 950, 990],
        hpGrowth,
      },
    ],
    equips: [
      { id: 2, collectionNo: 2, name: 'equip', lvMax: 3, atkBase: 100, atkMax: 900, hpGrowth },
    ],
    mysticCodes: [],
    items: [],
  });
}

describe('canonical HP normalization', () => {
  it('retains exact nonlinear HP cells independently of ATK', () => {
    const master = normalize([100, 137, 181]);
    expect(master.servants[0]?.hpByLevel).toEqual({ '1': 100, '2': 137, '3': 181 });
    expect(master.craftEssences[0]?.hpByLevel).toEqual({ '1': 100, '2': 137, '3': 181 });
  });
  it('retains missing growth as missing cells rather than synthesizing zero', () => {
    const master = normalize(undefined);
    expect(master.servants[0]?.hpByLevel).toEqual({});
    expect(master.craftEssences[0]?.hpByLevel).toEqual({});
  });
});
