import { describe, expect, it } from 'vitest';
import { probeRawNiceMaterials } from './probeRawNiceMaterials';

function input() {
  return {
    rawServants: [{ id: 100, combineLimitId: 200, combineSkillId: 300 }],
    rawItems: [{ id: 7 }, { id: 8 }, { id: 7999 }],
    rawCombineLimits: [
      { id: 200, svtLimit: 0, itemIds: [7, 8], itemNums: [2, 3], qp: 10 },
      { id: 200, svtLimit: 4, itemIds: [7999], itemNums: [1], qp: 0 },
    ],
    rawCombineSkills: [{ id: 300, skillLv: 1, itemIds: [8], itemNums: [4], qp: 20 }],
    rawCombineAppendSkills: [
      { svtId: 100, num: 0, skillLv: 1, itemIds: [7], itemNums: [5], qp: 30 },
    ],
    niceServants: [
      {
        id: 100,
        ascensionMaterials: {
          '0': {
            items: [
              { item: { id: 7 }, amount: 2 },
              { item: { id: 8 }, amount: 3 },
            ],
            qp: 10,
          },
        },
        skillMaterials: { '1': { items: [{ item: { id: 8 }, amount: 4 }], qp: 20 } },
        appendSkillMaterials: { '1': { items: [{ item: { id: 7 }, amount: 5 }], qp: 30 } },
      },
    ],
  };
}

describe('raw/nice material feasibility probe', () => {
  it('compares every published item amount and QP with raw joins', () => {
    expect(probeRawNiceMaterials(input())).toEqual({
      scope: 'published-servant-material-steps-only',
      servants: 1,
      steps: 3,
    });
  });

  it('rejects a partial material table or altered amount', () => {
    const missing = input();
    missing.rawItems.pop();
    expect(() => probeRawNiceMaterials(missing)).toThrow('raw_materials:unknown_item');
    const changed = input();
    changed.niceServants[0]!.skillMaterials['1'].items[0]!.amount = 9;
    expect(() => probeRawNiceMaterials(changed)).toThrow(
      'materials_probe:mismatch:100:skillMaterials',
    );
  });
});
