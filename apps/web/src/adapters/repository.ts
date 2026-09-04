import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MasterDataSnapshot, MasterManifest } from '@fgo-lab/master-data';
import {
  masterManifestSchema,
  masterSnapshotSchema,
  validateMasterSnapshot,
} from '@fgo-lab/master-data';
import type { ProfileCollection } from '@fgo-lab/schema';
import { parseStoredProfileCollection, profileCollectionSchema } from '@fgo-lab/schema';
import type { ProfileRepository } from '@fgo-lab/profile-domain';

interface LabDb extends DBSchema {
  meta: { key: string; value: unknown };
  master: { key: string; value: unknown };
  staging: { key: string; value: unknown };
  user: { key: string; value: unknown };
}
let databasePromise: Promise<IDBPDatabase<LabDb>> | undefined;
function database() {
  return (databasePromise ??= openDB<LabDb>('fgo-lab', 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('master');
      db.createObjectStore('staging');
      db.createObjectStore('user');
    },
  }));
}
export class IndexedDbProfileRepository implements ProfileRepository {
  async load() {
    const db = await database();
    const value = await db.get('user', 'profiles');
    if (value === undefined) return { state: 'empty' as const };
    const stored = (() => {
      try {
        return parseStoredProfileCollection(value);
      } catch {
        return null;
      }
    })();
    if (!stored) return { state: 'invalid' as const, reason: 'profile_parse_failed' as const };
    if (stored.upgraded)
      await db.put('user', profileCollectionSchema.parse(stored.collection), 'profiles');
    return {
      state: 'ready' as const,
      collection: stored.collection,
      discardedCalculationSnapshots: stored.discardedCalculationSnapshots,
    };
  }
  async replace(collection: ProfileCollection) {
    await (await database()).put('user', profileCollectionSchema.parse(collection), 'profiles');
  }
}
export interface ActiveMaster {
  manifest: MasterManifest;
  snapshot: MasterDataSnapshot;
  activatedAt: string;
}
interface ActiveMasterValidation {
  version: 1;
  contract: 'master-snapshot-v43.1';
  masterSchemaVersion: MasterManifest['schemaVersion'];
  masterDataVersion: string;
  artifactSha256: string;
  snapshotSha256: string;
}
interface StoredActiveMaster {
  manifest: MasterManifest;
  snapshotBytes: ArrayBuffer;
  activatedAt: string;
  validation: ActiveMasterValidation;
}
export type ActiveMasterLoadResult =
  | { state: 'empty' }
  | { state: 'ready'; active: ActiveMaster }
  | {
      state: 'discarded';
      reason: 'invalid_record' | 'invalid_schema' | 'version_mismatch';
    };
async function sha256(value: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', value));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function fetchMasterCandidate(
  baseUrl: string,
): Promise<{ manifest: MasterManifest; snapshotBytes: ArrayBuffer; fromOfflineCache: boolean }> {
  const manifestCandidate = await fetchMasterManifest(baseUrl);
  const snapshotCandidate = await fetchMasterSnapshot(baseUrl, manifestCandidate.manifest);
  return {
    manifest: manifestCandidate.manifest,
    snapshotBytes: snapshotCandidate.snapshotBytes,
    fromOfflineCache: manifestCandidate.fromOfflineCache || snapshotCandidate.fromOfflineCache,
  };
}
export async function fetchMasterManifest(
  baseUrl: string,
): Promise<{ manifest: MasterManifest; fromOfflineCache: boolean }> {
  const manifestResponse = await fetch(`${baseUrl}master/manifest.json`, { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error('master_manifest_download_failed');
  const manifest = masterManifestSchema.parse(await manifestResponse.json());
  return {
    manifest,
    fromOfflineCache: manifestResponse.headers.get('X-Fgo-Lab-Cache') === 'offline',
  };
}
export async function fetchMasterSnapshot(
  baseUrl: string,
  manifest: MasterManifest,
): Promise<{ snapshotBytes: ArrayBuffer; fromOfflineCache: boolean }> {
  const masterFile = manifest.files.find((file) => file.key === 'master' && file.required);
  if (!masterFile) throw new Error('required_master_file_missing');
  const dataResponse = await fetch(`${baseUrl}master/${masterFile.file}`, { cache: 'no-store' });
  if (!dataResponse.ok) throw new Error('master_data_download_failed');
  const content = await dataResponse.arrayBuffer();
  if (content.byteLength !== masterFile.bytes) throw new Error('master_bytes_mismatch');
  if ((await sha256(content)) !== masterFile.sha256) throw new Error('master_checksum_mismatch');
  return {
    snapshotBytes: content,
    fromOfflineCache: dataResponse.headers.get('X-Fgo-Lab-Cache') === 'offline',
  };
}
async function discardMasterCache(db: IDBPDatabase<LabDb>): Promise<void> {
  const transaction = db.transaction(['master', 'staging'], 'readwrite');
  await transaction.objectStore('master').clear();
  await transaction.objectStore('staging').clear();
  await transaction.done;
}
export async function loadActiveMaster(): Promise<ActiveMasterLoadResult> {
  const db = await database();
  const value = await db.get('master', 'active');
  if (value === undefined) return { state: 'empty' };
  if (!value || typeof value !== 'object') {
    await discardMasterCache(db);
    return { state: 'discarded', reason: 'invalid_record' };
  }
  const record = value as Record<string, unknown>;
  const manifest = masterManifestSchema.safeParse(record['manifest']);
  const snapshotBytes = record['snapshotBytes'];
  const validation = record['validation'];
  if (
    !manifest.success ||
    !(snapshotBytes instanceof ArrayBuffer) ||
    !validation ||
    typeof validation !== 'object' ||
    Array.isArray(validation) ||
    typeof record['activatedAt'] !== 'string'
  ) {
    await discardMasterCache(db);
    return { state: 'discarded', reason: 'invalid_schema' };
  }
  const validationRecord = validation as Record<string, unknown>;
  const masterFile = findRequiredMasterFile(manifest.data);
  if (
    !masterFile ||
    validationRecord['version'] !== 1 ||
    validationRecord['contract'] !== 'master-snapshot-v43.1' ||
    validationRecord['masterSchemaVersion'] !== manifest.data.schemaVersion ||
    validationRecord['masterDataVersion'] !== manifest.data.masterDataVersion ||
    validationRecord['artifactSha256'] !== masterFile.sha256 ||
    typeof validationRecord['snapshotSha256'] !== 'string' ||
    (await sha256(snapshotBytes)) !== validationRecord['snapshotSha256']
  ) {
    await discardMasterCache(db);
    return { state: 'discarded', reason: 'invalid_schema' };
  }
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(new TextDecoder().decode(snapshotBytes)) as unknown;
  } catch {
    await discardMasterCache(db);
    return { state: 'discarded', reason: 'invalid_record' };
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    await discardMasterCache(db);
    return { state: 'discarded', reason: 'invalid_record' };
  }
  const snapshotVersion = (snapshot as Record<string, unknown>)['version'];
  if (snapshotVersion !== manifest.data.masterDataVersion) {
    await discardMasterCache(db);
    return { state: 'discarded', reason: 'version_mismatch' };
  }
  return {
    state: 'ready',
    active: {
      manifest: manifest.data,
      snapshot: snapshot as MasterDataSnapshot,
      activatedAt: record['activatedAt'],
    },
  };
}
export async function stageAndActivate(
  manifestValue: unknown,
  snapshotValue: unknown,
  now: Date,
): Promise<ActiveMaster> {
  const manifest = masterManifestSchema.parse(manifestValue);
  const snapshotBytes =
    snapshotValue instanceof ArrayBuffer
      ? snapshotValue
      : new TextEncoder().encode(JSON.stringify(snapshotValue)).buffer;
  const decodedSnapshot = JSON.parse(new TextDecoder().decode(snapshotBytes)) as unknown;
  const snapshot = masterSnapshotSchema.parse(decodedSnapshot);
  const report = validateMasterSnapshot(snapshot);
  if (!report.valid)
    throw new Error(
      `master_validation_failed:${[...report.errors, ...report.unknownAttackFunctions].join(',')}`,
    );
  if (snapshot.version !== manifest.masterDataVersion) throw new Error('master_version_mismatch');
  const snapshotSha256 = await sha256(snapshotBytes);
  if (
    snapshotValue instanceof ArrayBuffer &&
    snapshotSha256 !== requiredMasterFile(manifest).sha256
  )
    throw new Error('master_checksum_mismatch');
  const db = await database();
  const transaction = db.transaction(['staging', 'master'], 'readwrite');
  const active: ActiveMaster = { manifest, snapshot, activatedAt: now.toISOString() };
  const stored: StoredActiveMaster = {
    manifest: active.manifest,
    snapshotBytes,
    activatedAt: active.activatedAt,
    validation: {
      version: 1 as const,
      contract: 'master-snapshot-v43.1',
      masterSchemaVersion: manifest.schemaVersion,
      masterDataVersion: manifest.masterDataVersion,
      artifactSha256: requiredMasterFile(manifest).sha256,
      snapshotSha256,
    },
  };
  await transaction.objectStore('staging').put(stored, manifest.masterDataVersion);
  await transaction.objectStore('master').put(stored, 'active');
  await transaction.done;
  return active;
}

function requiredMasterFile(manifest: MasterManifest) {
  const masterFile = findRequiredMasterFile(manifest);
  if (!masterFile) throw new Error('required_master_file_missing');
  return masterFile;
}

function findRequiredMasterFile(manifest: MasterManifest) {
  return manifest.files.find((file) => file.key === 'master' && file.required);
}
export async function clearUserData(): Promise<void> {
  await (await database()).clear('user');
}
