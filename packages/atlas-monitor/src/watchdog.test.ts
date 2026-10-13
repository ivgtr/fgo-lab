import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  ATLAS_AUDIT_STATUS_URL,
  ATLAS_EXPORT_KEYS,
  atlasSourceCertificateUrl,
  sourceCertificateSchema,
} from '@fgo-lab/master-data';
import { checkAtlasHeartbeat } from './watchdog';

it('distinguishes a fresh verified heartbeat from a stopped audit and stale certificate', async () => {
  const certificate = sourceCertificateSchema.parse({
    format: 'fgo-lab-atlas-source-v1',
    region: 'JP',
    generation: 2,
    publishedAt: '2026-10-13T05:00:00.000Z',
    observedAt: '2026-10-13T04:00:00.000Z',
    rawCommit: 'a'.repeat(40),
    rawCommittedAt: '2026-10-12T15:00:00.000Z',
    exporterCommit: 'b'.repeat(40),
    publisherCommit: 'c'.repeat(40),
    contractSha256: 'd'.repeat(64),
    masterSchemaVersion: 57,
    canonicalSha256: 'e'.repeat(64),
    exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 2, sha256: 'f'.repeat(64) })),
    referencedSkills: [],
  });
  const status = {
    format: 'fgo-lab-atlas-audit-status-v1',
    region: 'JP',
    auditedAt: '2026-10-13T06:00:00.000Z',
    observedAt: certificate.observedAt,
    rawCommit: certificate.rawCommit,
    exporterCommit: certificate.exporterCommit,
    publisherCommit: certificate.publisherCommit,
    contractSha256: certificate.contractSha256,
    certificateGeneration: certificate.generation,
    certificateSha256: createHash('sha256').update(JSON.stringify(certificate)).digest('hex'),
  };
  let servedCertificate = certificate;
  let requests = 0;
  const fetcher: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests++;
    if (
      url !== ATLAS_AUDIT_STATUS_URL &&
      url !== atlasSourceCertificateUrl(certificate.contractSha256)
    )
      throw new Error('unexpected_watchdog_url');
    return Promise.resolve(
      new Response(JSON.stringify(url === ATLAS_AUDIT_STATUS_URL ? status : servedCertificate), {
        headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' },
      }),
    );
  };
  expect(await checkAtlasHeartbeat(new Date('2026-10-13T07:00:00.000Z'), fetcher)).toMatchObject({
    status: 'healthy',
    generation: 2,
  });
  expect(await checkAtlasHeartbeat(new Date('2026-10-14T01:00:00.000Z'), fetcher)).toMatchObject({
    status: 'failed',
    reason: 'audit-stale',
  });
  expect(requests).toBe(3);
  servedCertificate = { ...certificate, generation: 1 };
  expect(await checkAtlasHeartbeat(new Date('2026-10-13T07:00:00.000Z'), fetcher)).toMatchObject({
    status: 'failed',
    reason: 'delivery-failed',
    details: 'atlas_watchdog:certificate_identity_mismatch',
  });
});
