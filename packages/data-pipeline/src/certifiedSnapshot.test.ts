import { describe, expect, it } from 'vitest';
import {
  ATLAS_EXPORT_KEYS,
  sourceCertificateSchema,
  type AtlasExportKey,
} from '@fgo-lab/master-data';
import { certifiedSourceVersion, normalizeCertifiedAtlasSnapshot } from './certifiedSnapshot';
import { normalizeAtlasSnapshot } from './snapshotNormalization';
import { portableSha256 } from './portableHash';
import {
  neutralCombatRules,
  neutralNiceCombatRuleExports,
} from '@fgo-lab/test-fixtures/combat-rules';

describe('certified canonical snapshot', () => {
  it('uses the same source identity and canonical digest for Node and browser inputs', () => {
    const certificate = sourceCertificateSchema.parse({
      format: 'fgo-lab-atlas-source-v1',
      region: 'JP',
      generation: 1,
      publishedAt: '2026-10-13T05:00:00.000Z',
      observedAt: '2026-10-13T04:00:00.000Z',
      rawCommit: 'a'.repeat(40),
      rawCommittedAt: '2026-10-12T15:00:00.000Z',
      exporterCommit: 'b'.repeat(40),
      publisherCommit: 'c'.repeat(40),
      contractSha256: 'd'.repeat(64),
      masterSchemaVersion: 57,
      canonicalSha256: '0'.repeat(64),
      exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 2, sha256: 'e'.repeat(64) })),
      referencedSkills: [],
    });
    const exports = new Map<AtlasExportKey, unknown>(ATLAS_EXPORT_KEYS.map((key) => [key, []]));
    for (const [key, value] of Object.entries(neutralNiceCombatRuleExports))
      exports.set(key as AtlasExportKey, value);
    const master = normalizeAtlasSnapshot({
      version: certifiedSourceVersion(certificate),
      combatRules: neutralCombatRules,
      servants: [],
      equips: [],
      mysticCodes: [],
      items: [],
      battlePoints: [],
    });
    const attested = {
      ...certificate,
      canonicalSha256: portableSha256(JSON.stringify(master)),
    };
    expect(
      certifiedSourceVersion({
        ...attested,
        rawCommit: 'f'.repeat(40),
        exporterCommit: '1'.repeat(40),
        observedAt: '2026-10-13T04:30:00.000Z',
      }),
    ).toBe(master.version);
    expect(
      certifiedSourceVersion({
        ...attested,
        exports: [
          { ...attested.exports[0]!, sha256: '2'.repeat(64) },
          ...attested.exports.slice(1),
        ],
      }),
    ).not.toBe(master.version);
    expect(
      normalizeCertifiedAtlasSnapshot({
        certificate: attested,
        exports,
        referencedSkills: new Map(),
      }),
    ).toEqual(master);
    expect(() =>
      normalizeCertifiedAtlasSnapshot({ certificate, exports, referencedSkills: new Map() }),
    ).toThrow('certified_snapshot:canonical_digest_mismatch');
  });
});
