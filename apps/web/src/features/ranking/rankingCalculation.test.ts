import { describe, expect, it } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { createDefaultDamageResolutionInput } from '../calculator/calculation';
import { calculateRanking, type RankingCandidate } from './rankingCalculation';

const master = masterSnapshotSchema.parse(fixture);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const candidate: RankingCandidate = {
  servantId: master.servants[0]!.id,
  name: master.servants[0]!.name,
  input: createDefaultDamageResolutionInput(master, undefined),
  resolutionUnsupported: false,
  resolutionEvidenceKeys: ['master:normalized-v5'],
  resolutionWarnings: [],
  classId: master.servants[0]!.classId,
  rarity: master.servants[0]!.rarity,
  npCard: master.servants[0]!.noblePhantasms[0]!.card,
  npTarget: master.servants[0]!.noblePhantasms[0]!.damage[0]!.target,
  owned: true,
};

describe('ranking calculation', () => {
  it('derives row precision from the same evidence registry as a single calculation', () => {
    const response = calculateRanking({ requestId: 'request', candidates: [candidate], versions });
    expect(response.unsupported).toEqual([]);
    expect(response.rows).toMatchObject([
      { servantId: candidate.servantId, precision: 'approximate' },
    ]);
  });

  it('fails closed when candidate resolution uses unregistered evidence', () => {
    const response = calculateRanking({
      requestId: 'request',
      candidates: [
        { ...candidate, resolutionEvidenceKeys: ['master:normalized-v5', 'unknown:evidence'] },
      ],
      versions,
    });
    expect(response.rows).toEqual([]);
    expect(response.unsupported).toEqual([
      { servantId: candidate.servantId, name: candidate.name, reason: 'unknown:evidence' },
    ]);
  });
});
