import { describe, expect, it } from 'vitest';
import {
  createRankingFieldCandidatesForConditions,
  createRankingFieldFactCandidates,
  MAX_RANKING_FIELD_CANDIDATES,
} from './rankingFieldWorld';

describe('ranking field worlds', () => {
  it('does not materialize an external fact for inactive policy', () => {
    expect(createRankingFieldFactCandidates(['fieldShore'], false)).toEqual([
      { key: 'field:none', traits: [], facts: [] },
    ]);
  });

  it('enumerates only relevant satisfiable field facts', () => {
    const candidates = createRankingFieldFactCandidates(
      ['fieldHeaven', 'fieldHell', 'fieldShore'],
      true,
    );
    expect(candidates).toHaveLength(6);
    expect(candidates.some(({ traits }) => traits.length === 0)).toBe(true);
    expect(
      candidates.every(
        ({ traits }) => !(traits.includes('fieldHeaven') && traits.includes('fieldHell')),
      ),
    ).toBe(true);
    expect(
      candidates.every(({ facts }) =>
        ['fieldHeaven', 'fieldHell', 'fieldShore'].every((trait) =>
          facts.some((fact) => fact.trait === trait),
        ),
      ),
    ).toBe(true);
  });

  it('fails closed when the finite search bound would be exceeded', () => {
    const traits = Array.from(
      { length: Math.ceil(Math.log2(MAX_RANKING_FIELD_CANDIDATES + 1)) },
      (_, index) => `field:${index}`,
    );
    expect(() => createRankingFieldFactCandidates(traits, true)).toThrow(
      /ranking_field_candidate_limit/,
    );
  });

  it.each(['atLeast', 'atMost', 'equal'] as const)(
    'enumerates field traitCount %s facts including the all-absent witness',
    (comparison) => {
      const candidates = createRankingFieldCandidatesForConditions(
        [
          {
            kind: 'traitCount',
            scope: 'field',
            traits: ['fieldShore', 'fieldSunlight'],
            comparison,
            count: 1,
          },
        ],
        true,
      );
      expect(candidates).toHaveLength(4);
      expect(candidates.some(({ facts }) => facts.every(({ present }) => !present))).toBe(true);
    },
  );
});
