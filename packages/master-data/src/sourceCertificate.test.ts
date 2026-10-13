import { describe, expect, it } from 'vitest';
import { ATLAS_EXPORT_KEYS, sourceCertificateSchema } from './sourceCertificate';

const certificate = {
  format: 'fgo-lab-atlas-source-v1',
  region: 'JP',
  generation: 1,
  publishedAt: '2026-10-13T00:01:00.000Z',
  observedAt: '2026-10-13T00:00:00.000Z',
  rawCommit: 'a'.repeat(40),
  rawCommittedAt: '2026-10-12T23:00:00.000Z',
  exporterCommit: 'b'.repeat(40),
  publisherCommit: 'c'.repeat(40),
  contractSha256: 'd'.repeat(64),
  masterSchemaVersion: 57,
  canonicalSha256: 'e'.repeat(64),
  exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 10, sha256: 'f'.repeat(64) })),
  referencedSkills: [{ id: 10, bytes: 20, sha256: '0'.repeat(64) }],
};

describe('Atlas source certificate declaration boundary', () => {
  it('requires every known export and rejects unknown inputs', () => {
    expect(sourceCertificateSchema.parse(certificate).generation).toBe(1);
    expect(
      sourceCertificateSchema.safeParse({ ...certificate, exports: certificate.exports.slice(1) })
        .success,
    ).toBe(false);
    expect(sourceCertificateSchema.safeParse({ ...certificate, unknown: true }).success).toBe(
      false,
    );
    expect(
      sourceCertificateSchema.safeParse({
        ...certificate,
        exports: [...certificate.exports].reverse(),
      }).success,
    ).toBe(false);
  });

  it('rejects equivocal generations and reference lists', () => {
    expect(sourceCertificateSchema.safeParse({ ...certificate, generation: 0 }).success).toBe(
      false,
    );
    expect(
      sourceCertificateSchema.safeParse({
        ...certificate,
        referencedSkills: [certificate.referencedSkills[0], certificate.referencedSkills[0]],
      }).success,
    ).toBe(false);
    expect(
      sourceCertificateSchema.safeParse({
        ...certificate,
        publishedAt: '2026-10-12T23:59:00.000Z',
      }).success,
    ).toBe(false);
  });
});
