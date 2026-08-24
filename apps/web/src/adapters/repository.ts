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
