import { resolveAtlasSkillReferenceClosure } from '@fgo-lab/data-pipeline/browser';
import {
  ATLAS_EXPORT_KEYS,
  atlasExportUrl,
  atlasReferencedSkillUrl,
  atlasSourceCertificateUrl,
  sourceCertificateSchema,
  type AtlasExportKey,
  type SourceCertificate,
} from '@fgo-lab/master-data';
import { ATLAS_CONTRACT_SHA256 } from './atlasContractFingerprint';

const MAX_CERTIFICATE_BYTES = 1024 * 1024;
const MAX_SKILL_BYTES = 2 * 1024 * 1024;
const TRANSPORT_FAILURE = 'atlas_source:transport_failure';

export function isAtlasTransportFailure(cause: unknown): boolean {
  return cause instanceof Error && cause.message === TRANSPORT_FAILURE;
}

export type SourceCertificateIdentity = { generation: number; sha256: string };
export type CheckedSourceCertificate = {
  certificate: SourceCertificate;
  identity: SourceCertificateIdentity;
};

export type AtlasVerifiedBodies = {
  certificate: SourceCertificate;
  exports: ReadonlyMap<AtlasExportKey, unknown>;
  referencedSkills: ReadonlyMap<number, unknown>;
  bytesFetched: number;
};

export const ATLAS_CERTIFICATE_URL =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_FGO_LOCAL_CERTIFICATE === '1'
    ? '/api/atlas-dev-certificate'
    : atlasSourceCertificateUrl(ATLAS_CONTRACT_SHA256);

async function sha256(body: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(body)));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readJsonBody(
  response: Response,
  maxBytes: number,
  label: string,
  expectedContentType = 'application/json',
): Promise<{ body: Uint8Array; value: unknown }> {
  if (!response.ok) throw new TypeError(`atlas_source:http_${String(response.status)}:${label}`);
  if (!response.headers.get('content-type')?.startsWith(expectedContentType))
    throw new TypeError(`atlas_source:content_type:${label}`);
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new RangeError(`atlas_source:content_length:${label}`);
  if (!response.body) throw new TypeError(`atlas_source:missing_body:${label}`);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new RangeError(`atlas_source:body_size:${label}`);
      parts.push(chunk.value);
      chunk = await reader.read();
    }
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    if (cause instanceof RangeError) throw cause;
    throw new TypeError(TRANSPORT_FAILURE, { cause });
  } finally {
    reader.releaseLock();
  }
  if (bytes === 0) throw new RangeError(`atlas_source:empty_body:${label}`);
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return {
      body,
      value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown,
    };
  } catch {
    throw new TypeError(`atlas_source:invalid_json:${label}`);
  }
}

async function request(url: string, fetchBody: typeof fetch): Promise<Response> {
  try {
    return await fetchBody(url, {
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (cause) {
    throw new TypeError(TRANSPORT_FAILURE, { cause });
  }
}

export async function fetchSourceCertificate(
  url: string,
  previous: SourceCertificateIdentity | null,
  fetchBody: typeof fetch = fetch,
): Promise<
  | { state: 'unchanged'; certificate: CheckedSourceCertificate }
  | {
      state: 'candidate';
      certificate: CheckedSourceCertificate;
    }
> {
  const { value } = await readJsonBody(
    await request(url, fetchBody),
    MAX_CERTIFICATE_BYTES,
    'certificate',
    'text/plain',
  );
  const certificate = sourceCertificateSchema.parse(value);
  if (certificate.contractSha256 !== ATLAS_CONTRACT_SHA256)
    throw new TypeError('atlas_source:contract_mismatch');
  const identity = {
    generation: certificate.generation,
    sha256: await sha256(new TextEncoder().encode(JSON.stringify(certificate))),
  };
  if (previous && identity.generation < previous.generation)
    throw new TypeError('atlas_source:stale_certificate_generation');
  if (
    previous &&
    identity.generation === previous.generation &&
    identity.sha256 !== previous.sha256
  )
    throw new TypeError('atlas_source:mutated_certificate_generation');
  return {
    state: previous && identity.generation === previous.generation ? 'unchanged' : 'candidate',
    certificate: { certificate, identity },
  };
}

export async function fetchAtlasVerifiedBodies(
  certificate: SourceCertificate,
  fetchBody: typeof fetch = fetch,
): Promise<AtlasVerifiedBodies> {
  const exports = new Map<AtlasExportKey, unknown>();
  let bytesFetched = 0;
  for (const [index, key] of ATLAS_EXPORT_KEYS.entries()) {
    const expected = certificate.exports[index];
    if (!expected || expected.key !== key)
      throw new TypeError(`atlas_source:certificate_export_order:${key}`);
    const { body, value } = await readJsonBody(
      await request(atlasExportUrl(key), fetchBody),
      expected.bytes,
      key,
    );
    if (body.byteLength !== expected.bytes || (await sha256(body)) !== expected.sha256)
      throw new TypeError(`atlas_source:export_digest_mismatch:${key}`);
    bytesFetched += body.byteLength;
    exports.set(key, value);
  }

  const roots = [
    exports.get('nice_servant'),
    exports.get('nice_equip'),
    exports.get('nice_mystic_code'),
  ];
  const expectedSkills = new Map(certificate.referencedSkills.map((skill) => [skill.id, skill]));
  const skills = await resolveAtlasSkillReferenceClosure({
    documents: roots,
    fetchSkill: async (id) => {
      const expected = expectedSkills.get(id);
      if (!expected) throw new TypeError(`atlas_source:uncertified_reference:${String(id)}`);
      if (expected.bytes > MAX_SKILL_BYTES)
        throw new RangeError(`atlas_source:skill_size:${String(id)}`);
      const { body, value } = await readJsonBody(
        await request(atlasReferencedSkillUrl(id), fetchBody),
        expected.bytes,
        `skill:${String(id)}`,
      );
      if (body.byteLength !== expected.bytes || (await sha256(body)) !== expected.sha256)
        throw new TypeError(`atlas_source:reference_digest_mismatch:${String(id)}`);
      bytesFetched += body.byteLength;
      return value;
    },
  });
  if (skills.size !== expectedSkills.size)
    throw new TypeError('atlas_source:extra_certified_references');
  return { certificate, exports, referencedSkills: skills, bytesFetched };
}
