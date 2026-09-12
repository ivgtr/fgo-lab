import { expect, it } from 'vitest';
import { isUnreferencedDefensiveMarker } from './defensiveMarkerNormalization';
import type { AtlasFunction } from './atlasContract';
const fn: AtlasFunction = {
  funcType: 'addState',
  funcTargetType: 'self',
  buffs: [{ type: 'addIndividuality', vals: [{ id: 3, name: 'defensive' }] }],
};
const rows = [[{ Rate: 1000, Value: 0, AddIndividualityEx: 10048, Count: 3, Turn: 3 }]];
const catalog = {
  stateOnlyTraits: new Set<string>(),
  attackReadTraits: new Set<string>(),
  populationReadTraits: new Set<string>(),
};
it('erases only an unreferenced zero-value defensive marker and retains unknown/readable branches', () => {
  expect(isUnreferencedDefensiveMarker(fn, rows, new Map(), catalog)).toBe(true);
  for (const trait of ['traitId:0', 'traitId:10048'])
    expect(
      isUnreferencedDefensiveMarker(fn, rows, new Map(), {
        ...catalog,
        attackReadTraits: new Set([trait]),
      }),
    ).toBe(false);
  expect(
    isUnreferencedDefensiveMarker(fn, rows, new Map(), {
      ...catalog,
      populationReadTraits: new Set(['defensive']),
    }),
  ).toBe(false);
  expect(
    isUnreferencedDefensiveMarker(fn, [[{ ...rows[0]![0]!, Future: 1 }]], new Map(), catalog),
  ).toBe(false);
  expect(
    isUnreferencedDefensiveMarker(fn, [[{ ...rows[0]![0]!, Value: 1 }]], new Map(), catalog),
  ).toBe(false);
});
