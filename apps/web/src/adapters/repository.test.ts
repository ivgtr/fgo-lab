// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type ProfileCollection } from '@fgo-lab/schema';
import { IndexedDbProfileRepository } from './repository';
import { LAB_DATABASE_VERSION } from './labDatabase';

const profileId = '00000000-0000-4000-8000-000000000001';

async function userStore() {
  return openDB('fgo-lab', LAB_DATABASE_VERSION, {
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

function mismatchedProfileCollection(
  schemaVersion: 32 | 33 | 34 | typeof SCHEMA_VERSION,
  mapName: 'servantBuilds' | 'servantTargets' = 'servantBuilds',
  recordKey = 'servant-a',
) {
  return {
    schemaVersion,
    activeProfileId: profileId,
    profiles: [
      {
        ...legacyProfile,
        [mapName]: {
          [recordKey]: {
            servantId: 'servant-b',
            level: 1,
            ascension: 0,
            ...(mapName === 'servantBuilds' ? { npLevel: 0 } : {}),
            fouAtk: 0,
            skills: {},
            appends: {},
            ...(mapName === 'servantTargets' ? { planned: true } : {}),
            updatedAt: '2026-08-25T00:00:00.000Z',
          },
        },
        draft: null,
        history: [],
      },
    ],
  };
}

describe('profile repository migration boundary', () => {
  beforeEach(async () => {
    const db = await userStore();
    await db.clear('user');
    db.close();
  });

  it('rejects retired schema 32 without changing user, metadata or staging data', async () => {
    const original = { schemaVersion: 32, activeProfileId: profileId, profiles: [legacyProfile] };
    const db = await userStore();
    await db.put('user', original, 'profiles');
    db.close();
    const loaded = await new IndexedDbProfileRepository().load();
    expect(loaded).toMatchObject({
      state: 'invalid',
      reason: 'profile_parse_failed',
    });
    const check = await userStore();
    expect(await check.get('user', 'profiles')).toEqual(original);
    expect(await check.get('meta', 'profiles-before-v42-switch')).toBeUndefined();
    expect(await check.getAllKeys('staging')).toEqual([]);
    check.close();
  });

  it('returns a typed failure without clearing an invalid user record', async () => {
    const invalid = { schemaVersion: 32, activeProfileId: profileId, profiles: [] };
    const db = await userStore();
    await db.put('user', invalid, 'profiles');
    db.close();
    // E2E-A026-PROFILE
    expect(await new IndexedDbProfileRepository().load()).toEqual({
      state: 'invalid',
      reason: 'profile_parse_failed',
    });
    const check = await userStore();
    expect(await check.get('user', 'profiles')).toEqual(invalid);
    check.close();
  });

  it('replaces an invalid profile only once and preserves master data', async () => {
    const invalid = { schemaVersion: 32, activeProfileId: profileId, profiles: [] };
    const fresh: ProfileCollection = {
      schemaVersion: SCHEMA_VERSION,
      activeProfileId: profileId,
      profiles: [{ ...legacyProfile, draft: null, history: [] }],
    };
    const db = await userStore();
    await db.put('user', invalid, 'profiles');
    await db.put('master', { retained: true }, 'active');
    db.close();

    const repository = new IndexedDbProfileRepository();
    expect(await repository.replaceInvalidWithFresh(fresh)).toEqual({ status: 'committed' });
    expect(await repository.replaceInvalidWithFresh(fresh)).toEqual({
      status: 'aborted',
      reason: 'stale',
    });
    const check = await userStore();
    expect(await check.get('user', 'profiles')).toEqual(fresh);
    expect(await check.get('master', 'active')).toEqual({ retained: true });
    check.close();
  });

  it.each([SCHEMA_VERSION, 34, 33, 32] as const)(
    'rejects a schema %s servant identity mismatch without upgrading or replacing stored bytes',
    async (schemaVersion) => {
      for (const mapName of ['servantBuilds', 'servantTargets'] as const)
        for (const recordKey of ['servant-a', '__proto__']) {
          const invalid = mismatchedProfileCollection(schemaVersion, mapName, recordKey);
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
        }
    },
  );

  it('rejects an invalid replacement before changing the current stored collection', async () => {
    const repository = new IndexedDbProfileRepository();
    const current = {
      ...mismatchedProfileCollection(SCHEMA_VERSION),
      profiles: [{ ...legacyProfile, draft: null, history: [] }],
    } as ProfileCollection;
    await repository.replace(current);
    for (const mapName of ['servantBuilds', 'servantTargets'] as const)
      for (const recordKey of ['servant-a', '__proto__']) {
        const invalid = mismatchedProfileCollection(
          SCHEMA_VERSION,
          mapName,
          recordKey,
        ) as unknown as ProfileCollection;
        await expect(repository.replace(invalid)).rejects.toThrow(/servant_record_/);
        const check = await userStore();
        expect(await check.get('user', 'profiles')).toEqual(current);
        check.close();
      }
  });
});
