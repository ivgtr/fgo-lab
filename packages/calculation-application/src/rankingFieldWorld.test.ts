import { describe, expect, it } from 'vitest';
import {
  createRankingFieldFactCandidates,
  MAX_RANKING_FIELD_CANDIDATES,
} from './rankingFieldWorld';

describe('ranking field worlds', () => {
  it('does not materialize an external fact for inactive policy', () => {
    expect(createRankingFieldFactCandidates(['fieldShore'], false)).toEqual([
      { key: 'field:none', traits: [] },
    ]);
  });

  it('enumerates only relevant satisfiable field facts', () => {
    expect(
      createRankingFieldFactCandidates(['fieldHeaven', 'fieldHell', 'fieldShore'], true),
    ).toEqual([
      { key: 'field:fieldShore', traits: ['fieldShore'] },
      { key: 'field:fieldHell', traits: ['fieldHell'] },
      { key: 'field:fieldHell,fieldShore', traits: ['fieldHell', 'fieldShore'] },
      { key: 'field:fieldHeaven', traits: ['fieldHeaven'] },
      { key: 'field:fieldHeaven,fieldShore', traits: ['fieldHeaven', 'fieldShore'] },
    ]);
  });

  it('fails closed when the finite search bound would be exceeded', () => {
    const count = Math.log2(MAX_RANKING_FIELD_CANDIDATES + 1) + 1;
    const traits = Array.from({ length: Math.ceil(count) }, (_, index) => `field:${index}`);
    expect(() => createRankingFieldFactCandidates(traits, true)).toThrow(
      /ranking_field_candidate_limit/,
    );
  });
});
