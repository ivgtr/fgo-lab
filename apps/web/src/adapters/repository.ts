import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MasterDataSnapshot, MasterManifest } from '@fgo-lab/master-data';
import {
  masterManifestSchema,
  masterSnapshotSchema,
  validateMasterSnapshot,
} from '@fgo-lab/master-data';
import type { ProfileCollection } from '@fgo-lab/schema';
import { profileCollectionSchema } from '@fgo-lab/schema';
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
    const value = await (await database()).get('user', 'profiles');
    return value === undefined ? undefined : profileCollectionSchema.parse(value);
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
async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function fetchMasterCandidate(
  baseUrl: string,
): Promise<{ manifest: MasterManifest; snapshot: MasterDataSnapshot }> {
  const manifestResponse = await fetch(`${baseUrl}master/manifest.json`, { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error('master_manifest_download_failed');
  const manifest = masterManifestSchema.parse(await manifestResponse.json());
  const masterFile = manifest.files.find((file) => file.key === 'master' && file.required);
  if (!masterFile) throw new Error('required_master_file_missing');
  const dataResponse = await fetch(`${baseUrl}master/${masterFile.file}`, { cache: 'no-store' });
  if (!dataResponse.ok) throw new Error('master_data_download_failed');
  const content = await dataResponse.text();
  if (new TextEncoder().encode(content).byteLength !== masterFile.bytes)
    throw new Error('master_bytes_mismatch');
  if ((await sha256(content)) !== masterFile.sha256) throw new Error('master_checksum_mismatch');
  return { manifest, snapshot: masterSnapshotSchema.parse(JSON.parse(content)) };
}
export async function loadActiveMaster(): Promise<ActiveMaster | undefined> {
  const value = await (await database()).get('master', 'active');
  if (value === undefined) return undefined;
  const record = value as Record<string, unknown>;
  return {
    manifest: masterManifestSchema.parse(record['manifest']),
    snapshot: masterSnapshotSchema.parse(record['snapshot']),
    activatedAt: String(record['activatedAt']),
  };
}
export async function stageAndActivate(
  manifestValue: unknown,
  snapshotValue: unknown,
  now: Date,
): Promise<ActiveMaster> {
  const manifest = masterManifestSchema.parse(manifestValue);
  const snapshot = masterSnapshotSchema.parse(snapshotValue);
  const report = validateMasterSnapshot(snapshot);
  if (!report.valid)
    throw new Error(
      `master_validation_failed:${[...report.errors, ...report.unknownAttackFunctions].join(',')}`,
    );
  if (snapshot.version !== manifest.masterDataVersion) throw new Error('master_version_mismatch');
  const db = await database();
  const transaction = db.transaction(['staging', 'master'], 'readwrite');
  const active = { manifest, snapshot, activatedAt: now.toISOString() };
  await transaction.objectStore('staging').put(active, manifest.masterDataVersion);
  await transaction.objectStore('master').put(active, 'active');
  await transaction.done;
  return active;
}
export async function clearUserData(): Promise<void> {
  await (await database()).clear('user');
}
