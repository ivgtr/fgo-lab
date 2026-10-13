import { expect, it } from 'vitest';
import { ATLAS_EXPORT_KEYS, sourceCertificateSchema } from '@fgo-lab/master-data';
import { verifyCertificateDelivery } from './verifyCertificateDelivery';

it('requires the public CORS response to contain the exact certified generation', async () => {
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
  let calls = 0;
  let pauses = 0;
  const fetcher: typeof fetch = () => {
    calls++;
    const body =
      calls === 1
        ? `${JSON.stringify({ ...certificate, generation: 1 })}\n`
        : calls === 2
          ? `${JSON.stringify(certificate)} \n`
          : `${JSON.stringify(certificate)}\n`;
    return Promise.resolve(
      new Response(body, {
        headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' },
      }),
    );
  };
  await verifyCertificateDelivery(certificate, fetcher, () => {
    pauses++;
    return Promise.resolve();
  });
  expect({ calls, pauses }).toEqual({ calls: 3, pauses: 2 });
});
