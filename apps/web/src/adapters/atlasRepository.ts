import { z } from 'zod';
import {
  masterManifestSchema,
  certifiedMasterSnapshotSchema,
  sourceCertificateSchema,
  validateMasterSnapshot,
  type CertifiedMasterDataSnapshot,
  type MasterDataSnapshot,
  type SourceCertificate,
} from '@fgo-lab/master-data';
import { certifiedSourceVersion } from '@fgo-lab/data-pipeline/browser';
import type { CheckedSourceCertificate, SourceCertificateIdentity } from './atlasSource';
import { labDatabase } from './labDatabase';

const ACTIVE_PREFIX = 'atlas-active:';
const activeKey = (contractSha256: string) => `${ACTIVE_PREFIX}${contractSha256}`;
const storedSchema = z.strictObject({
  format: z.literal('fgo-lab-atlas-active-v1'),
  certificate: sourceCertificateSchema,
  certificateSha256: z.string().regex(/^[0-9a-f]{64}$/),
  snapshotBytes: z.instanceof(ArrayBuffer),
  activatedAt: z.iso.datetime(),
});

function sameBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface AtlasActiveMaster {
  certificate: SourceCertificate;
  identity: SourceCertificateIdentity;
  snapshot: CertifiedMasterDataSnapshot;
  activatedAt: string;
}

export type AtlasActiveLoad =
  | { state: 'empty' }
  | { state: 'invalid'; reason: 'record' | 'contract' | 'digest' | 'canonical' }
  | { state: 'ready'; active: AtlasActiveMaster };

export async function loadActiveAtlasMaster(contractSha256: string): Promise<AtlasActiveLoad> {
  const value = await (await labDatabase()).get('master', activeKey(contractSha256));
  if (value === undefined) return { state: 'empty' };
  const parsed = storedSchema.safeParse(value);
  if (!parsed.success) return { state: 'invalid', reason: 'record' };
  const stored = parsed.data;
  if (stored.certificate.contractSha256 !== contractSha256)
    return { state: 'invalid', reason: 'contract' };
  if ((await sha256(JSON.stringify(stored.certificate))) !== stored.certificateSha256)
    return { state: 'invalid', reason: 'digest' };
  let candidate: unknown;
  let storedJson: string;
  try {
    storedJson = new TextDecoder('utf-8', { fatal: true }).decode(stored.snapshotBytes);
    candidate = JSON.parse(storedJson) as unknown;
  } catch {
    return { state: 'invalid', reason: 'canonical' };
  }
  const snapshot = certifiedMasterSnapshotSchema.safeParse(candidate);
  if (
    !snapshot.success ||
    JSON.stringify(snapshot.data) !== storedJson ||
    snapshot.data.version !== certifiedSourceVersion(stored.certificate) ||
    (await sha256(storedJson)) !== stored.certificate.canonicalSha256 ||
    !validateMasterSnapshot(snapshot.data).valid
  )
    return { state: 'invalid', reason: 'canonical' };
  return {
    state: 'ready',
    active: {
      certificate: stored.certificate,
      identity: { generation: stored.certificate.generation, sha256: stored.certificateSha256 },
      snapshot: snapshot.data,
      activatedAt: stored.activatedAt,
    },
  };
}

export type AtlasActivationResult =
  | { status: 'committed'; active: AtlasActiveMaster }
  | { status: 'unchanged' | 'stale' | 'conflict' };

export async function activateAtlasMaster(input: {
  checked: CheckedSourceCertificate;
  snapshot: MasterDataSnapshot | ArrayBuffer;
  contractSha256: string;
  now: Date;
}): Promise<AtlasActivationResult> {
  const certificate = sourceCertificateSchema.parse(input.checked.certificate);
  const identity = input.checked.identity;
  if (
    certificate.contractSha256 !== input.contractSha256 ||
    identity.generation !== certificate.generation ||
    (await sha256(JSON.stringify(certificate))) !== identity.sha256
  )
    throw new TypeError('atlas_active:certificate_identity_mismatch');
  const source =
    input.snapshot instanceof ArrayBuffer
      ? (JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.snapshot)) as unknown)
      : input.snapshot;
  const snapshot = certifiedMasterSnapshotSchema.parse(source);
  const canonicalJson = JSON.stringify(snapshot);
  if (
    JSON.stringify(source) !== canonicalJson ||
    snapshot.version !== certifiedSourceVersion(certificate) ||
    (await sha256(canonicalJson)) !== certificate.canonicalSha256 ||
    !validateMasterSnapshot(snapshot).valid
  )
    throw new TypeError('atlas_active:canonical_mismatch');
  const activatedAt = input.now.toISOString();
  const snapshotBytes =
    input.snapshot instanceof ArrayBuffer
      ? input.snapshot
      : new TextEncoder().encode(canonicalJson).buffer;
  if ((await sha256(new TextDecoder().decode(snapshotBytes))) !== certificate.canonicalSha256)
    throw new TypeError('atlas_active:noncanonical_bytes');
  const db = await labDatabase();
  const tx = db.transaction(['master', 'staging'], 'readwrite');
  void tx.done.catch(() => undefined);
  const store = tx.objectStore('master');
  const key = activeKey(input.contractSha256);
  const previous = await store.get(key);
  if (previous !== undefined) {
    const current = storedSchema.safeParse(previous);
    if (current.success) {
      const priorGeneration = current.data.certificate.generation;
      if (priorGeneration > identity.generation) {
        await tx.done;
        return { status: 'stale' };
      }
      if (priorGeneration === identity.generation) {
        if (current.data.certificateSha256 !== identity.sha256) {
          await tx.done;
          return { status: 'conflict' };
        }
        if (
          JSON.stringify(current.data.certificate) === JSON.stringify(certificate) &&
          sameBytes(current.data.snapshotBytes, snapshotBytes)
        ) {
          await tx.done;
          return { status: 'unchanged' };
        }
      }
    }
  }
  await store.put(
    {
      format: 'fgo-lab-atlas-active-v1',
      certificate,
      certificateSha256: identity.sha256,
      snapshotBytes,
      activatedAt,
    },
    key,
  );
  const legacy = await store.get('active');
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    const record = legacy as Record<string, unknown>;
    const manifest = masterManifestSchema.safeParse(record['manifest']);
    const validation = record['validation'];
    if (
      manifest.success &&
      validation &&
      typeof validation === 'object' &&
      (validation as Record<string, unknown>)['contract'] === 'master-snapshot-v43.1' &&
      (validation as Record<string, unknown>)['masterDataVersion'] ===
        manifest.data.masterDataVersion
    ) {
      await tx.objectStore('staging').delete(manifest.data.masterDataVersion);
      await store.delete('active');
    }
  }
  for (const existingKey of await store.getAllKeys())
    if (existingKey.startsWith(ACTIVE_PREFIX) && existingKey !== key)
      await store.delete(existingKey);
  await tx.done;
  return {
    status: 'committed',
    active: { certificate, identity, snapshot, activatedAt },
  };
}
