import { describe, expect, it } from 'vitest';
import {
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
    expect(
      createRankingFieldFactCandidates(['fieldHeaven', 'fieldHell', 'fieldShore'], true),
    ).toEqual([
      {
        key: 'field:fieldShore',
        traits: ['fieldShore'],
        facts: [
          { trait: 'fieldHeaven', present: false },
          { trait: 'fieldHell', present: false },
          { trait: 'fieldShore', present: true },
        ],
      },
      {
        key: 'field:fieldHell',
        traits: ['fieldHell'],
        facts: [
          { trait: 'fieldHeaven', present: false },
          { trait: 'fieldHell', present: true },
          { trait: 'fieldShore', present: false },
        ],
      },
      {
        key: 'field:fieldHell,fieldShore',
        traits: ['fieldHell', 'fieldShore'],
        facts: [
          { trait: 'fieldHeaven', present: false },
          { trait: 'fieldHell', present: true },
          { trait: 'fieldShore', present: true },
        ],
      },
      {
        key: 'field:fieldHeaven',
        traits: ['fieldHeaven'],
        facts: [
          { trait: 'fieldHeaven', present: true },
          { trait: 'fieldHell', present: false },
          { trait: 'fieldShore', present: false },
        ],
      },
      {
        key: 'field:fieldHeaven,fieldShore',
        traits: ['fieldHeaven', 'fieldShore'],
        facts: [
          { trait: 'fieldHeaven', present: true },
          { trait: 'fieldHell', present: false },
          { trait: 'fieldShore', present: true },
        ],
      },
    ]);
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
});
