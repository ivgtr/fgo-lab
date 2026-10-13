import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ATLAS_EXPORT_KEYS,
  atlasExportUrl,
  atlasReferencedSkillUrl,
  sourceCertificateSchema,
} from '@fgo-lab/master-data';
import {
  fetchAtlasVerifiedBodies,
  fetchSourceCertificate,
  isAtlasTransportFailure,
} from './atlasSource';
import { ATLAS_CONTRACT_SHA256 } from './atlasContractFingerprint';

const encoder = new TextEncoder();
const hash = (body: string) => createHash('sha256').update(body).digest('hex');

function fixture(includeReference: boolean) {
  const bodies = new Map<string, string>();
  for (const key of ATLAS_EXPORT_KEYS)
    bodies.set(
      atlasExportUrl(key),
      key === 'nice_servant' && includeReference
        ? '[{"functions":[{"funcId":1,"svals":[{"SkillID":7}]}]}]'
        : '[]',
    );
  const skillBody = '{"id":7,"functions":[]}';
  if (includeReference) bodies.set(atlasReferencedSkillUrl(7), skillBody);
  const certificate = sourceCertificateSchema.parse({
    format: 'fgo-lab-atlas-source-v1',
    region: 'JP',
    generation: 1,
    publishedAt: '2026-10-13T04:10:00.000Z',
    observedAt: '2026-10-13T04:00:00.000Z',
    rawCommit: 'a'.repeat(40),
    rawCommittedAt: '2026-10-12T15:00:00.000Z',
    exporterCommit: 'b'.repeat(40),
    publisherCommit: 'c'.repeat(40),
    contractSha256: ATLAS_CONTRACT_SHA256,
    masterSchemaVersion: 57,
    canonicalSha256: 'e'.repeat(64),
    exports: ATLAS_EXPORT_KEYS.map((key) => {
      const body = bodies.get(atlasExportUrl(key))!;
      return { key, bytes: encoder.encode(body).byteLength, sha256: hash(body) };
    }),
    referencedSkills: includeReference
      ? [{ id: 7, bytes: encoder.encode(skillBody).byteLength, sha256: hash(skillBody) }]
      : [],
  });
  const certificateUrl = 'https://example.test/atlas/JP.json';
  const certificateBody = JSON.stringify(certificate);
  bodies.set(certificateUrl, certificateBody);
  const requests: string[] = [];
  const fetchBody: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    const body = bodies.get(url);
    return Promise.resolve(
      new Response(body ?? 'not found', {
        status: body === undefined ? 404 : 200,
        headers: {
          'content-type':
            body === undefined || url === certificateUrl ? 'text/plain' : 'application/json',
        },
      }),
    );
  };
  return { bodies, certificate, certificateUrl, fetchBody, requests };
}

describe('certified Atlas source', () => {
  it('skips large bodies for an unchanged certificate and verifies every reference on change', async () => {
    const input = fixture(true);
    const first = await fetchSourceCertificate(input.certificateUrl, null, input.fetchBody);
    expect(first.state).toBe('candidate');
    const second = await fetchSourceCertificate(
      input.certificateUrl,
      first.certificate.identity,
      input.fetchBody,
    );
    expect(second.state).toBe('unchanged');
    expect(input.requests).toEqual([input.certificateUrl, input.certificateUrl]);

    const verified = await fetchAtlasVerifiedBodies(input.certificate, input.fetchBody);
    expect(verified.exports.size).toBe(13);
    expect([...verified.referencedSkills.keys()]).toEqual([7]);
  });

  it('rejects a changed export and an unlisted reachable skill', async () => {
    const changed = fixture(false);
    changed.bodies.set(atlasExportUrl('nice_servant'), '{}');
    await expect(fetchAtlasVerifiedBodies(changed.certificate, changed.fetchBody)).rejects.toThrow(
      'export_digest_mismatch:nice_servant',
    );

    const missing = fixture(true);
    const withoutSkill = sourceCertificateSchema.parse({
      ...missing.certificate,
      referencedSkills: [],
    });
    await expect(fetchAtlasVerifiedBodies(withoutSkill, missing.fetchBody)).rejects.toThrow(
      'uncertified_reference:7',
    );
  });

  it('classifies transport refusal separately from an HTTP response', async () => {
    const input = fixture(false);
    const refused: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    let failure: unknown;
    try {
      await fetchSourceCertificate(input.certificateUrl, null, refused);
    } catch (cause) {
      failure = cause;
    }
    expect(isAtlasTransportFailure(failure)).toBe(true);
    input.bodies.delete(input.certificateUrl);
    await expect(
      fetchSourceCertificate(input.certificateUrl, null, input.fetchBody),
    ).rejects.toThrow('atlas_source:http_404:certificate');
  });
});
