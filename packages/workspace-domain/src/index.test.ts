import { describe, expect, it } from 'vitest';
import { canonicalize, filterRanking } from './index';
describe('workspace derivations', () => {
  it('canonicalizes object key order', () =>
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 })));
  it('combines ranking filters as an intersection', () =>
    expect(
      filterRanking(
        [
          { name: 'A', classId: 'saber', rarity: 5, npCard: 'buster', npTarget: 'all' },
          { name: 'B', classId: 'archer', rarity: 4, npCard: 'arts', npTarget: 'single' },
        ],
        { text: '', classes: ['saber'], rarities: [5], cards: [], targets: ['all'] },
      ),
    ).toHaveLength(1));
});
