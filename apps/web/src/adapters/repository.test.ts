// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@fgo-lab/schema';
import { IndexedDbProfileRepository } from './repository';

const profileId = '00000000-0000-4000-8000-000000000001';

async function userStore() {
  return openDB('fgo-lab', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('master')) db.createObjectStore('master');
      if (!db.objectStoreNames.contains('staging')) db.createObjectStore('staging');
      if (!db.objectStoreNames.contains('user')) db.createObjectStore('user');
    },
  });
}

const legacyProfile = {
  profileId,
  name: '保存済み',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-25T00:00:00.000Z',
  servantBuilds: {},
  servantTargets: {},
  craftEssences: [],
  supportTemplates: [],
  draft: { legacy: true },
  history: [{ legacy: true }],
};

describe('profile repository migration boundary', () => {
  beforeEach(async () => {
    const db = await userStore();
    await db.clear('user');
    db.close();
  });

  it('migrates exact schema 32 transactionally and persists only current data', async () => {
    const db = await userStore();
    await db.put(
      'user',
      { schemaVersion: 32, activeProfileId: profileId, profiles: [legacyProfile] },
      'profiles',
    );
    db.close();
    const loaded = await new IndexedDbProfileRepository().load();
    expect(loaded).toMatchObject({
      state: 'ready',
      discardedCalculationSnapshots: true,
      collection: {
        schemaVersion: SCHEMA_VERSION,
        profiles: [{ profileId, draft: null, history: [] }],
      },
    });
    const check = await userStore();
    expect(await check.get('user', 'profiles')).toMatchObject({ schemaVersion: SCHEMA_VERSION });
    check.close();
  });

  it('returns a typed failure without clearing an invalid user record', async () => {
    const invalid = { schemaVersion: 32, activeProfileId: profileId, profiles: [] };
    const db = await userStore();
    await db.put('user', invalid, 'profiles');
    db.close();
    expect(await new IndexedDbProfileRepository().load()).toEqual({
      state: 'invalid',
      reason: 'profile_parse_failed',
    });
    const check = await userStore();
    expect(await check.get('user', 'profiles')).toEqual(invalid);
    check.close();
  });
});
