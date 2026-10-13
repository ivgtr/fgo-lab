import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface LabDb extends DBSchema {
  meta: { key: string; value: unknown };
  master: { key: string; value: unknown };
  staging: { key: string; value: unknown };
  user: { key: string; value: unknown };
}

export const LAB_DATABASE_VERSION = 2;

export class OldTabBlocksUpgrade extends Error {
  constructor() {
    super('old_tab_blocks_atlas_storage_upgrade');
  }
}

let databasePromise: Promise<IDBPDatabase<LabDb>> | undefined;

export function labDatabase(): Promise<IDBPDatabase<LabDb>> {
  if (databasePromise) return databasePromise;
  let rejectBlocked: (cause: OldTabBlocksUpgrade) => void = () => undefined;
  const blocked = new Promise<never>((_resolve, reject: (cause: OldTabBlocksUpgrade) => void) => {
    rejectBlocked = reject;
  });
  const opening = openDB<LabDb>('fgo-lab', LAB_DATABASE_VERSION, {
    upgrade(db) {
      for (const name of ['meta', 'master', 'staging', 'user'] as const)
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    },
    blocked() {
      rejectBlocked(new OldTabBlocksUpgrade());
    },
    blocking() {
      databasePromise?.then((db) => db.close()).catch(() => undefined);
    },
  });
  databasePromise = Promise.race([opening, blocked]);
  void databasePromise.catch(() => {
    void opening.then((db) => db.close()).catch(() => undefined);
  });
  return databasePromise;
}
