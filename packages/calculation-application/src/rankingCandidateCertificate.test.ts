import { describe, expect, it } from 'vitest';
import {
  assertRankingCandidateMaterialization,
  certifyRankingProgramDomain,
} from './rankingCandidateCertificate';

describe('ranking candidate certificate', () => {
  it('records raw world coverage separately from quotient representatives', () => {
    const certificate = certifyRankingProgramDomain({
      programKey: 'program',
      rawWorldCardinality: 5,
      worldEquivalenceClasses: 3,
      dimensions: [
        { key: 'target', values: [0, 1, 2] },
        { key: 'field', values: [0, 1] },
      ],
      remaining: 4_096,
    });
    expect(certificate).toEqual({
      programKey: 'program',
      rawWorldCardinality: 5,
      worldEquivalenceClasses: 3,
      dimensions: [
        { key: 'target', cardinality: 3 },
        { key: 'field', cardinality: 2 },
      ],
      upperBound: 6,
    });
  });

  it('fails closed when materialization does not match the certified bound', () => {
    expect(() =>
      assertRankingCandidateMaterialization(1, {
        supportedMaximum: 4_096,
        programBounds: [],
        completeUpperBound: 2,
      }),
    ).toThrow('ranking_candidate_space_materialization_mismatch:1:2');
  });
});
