// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type ProfileCollection } from '@fgo-lab/schema';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import manifest from '../../../../packages/test-fixtures/master/manifest.json';
import { IndexedDbProfileRepository, loadActiveMaster, stageAndActivate } from './repository';

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

describe('validated master activation receipt', () => {
  beforeEach(async () => {
    const db = await userStore();
    await db.clear('master');
    await db.clear('staging');
    db.close();
  });

  it.each([
    { value: null, reason: 'invalid_record' },
    { value: {}, reason: 'invalid_schema' },
  ] as const)(
    'retains user, backup and foreign staging when discarding $reason',
    async ({ value, reason }) => {
      const current: ProfileCollection = {
        schemaVersion: SCHEMA_VERSION,
        activeProfileId: profileId,
        profiles: [{ ...legacyProfile, draft: null, history: [] }],
      };
      await new IndexedDbProfileRepository().replace(current);
      const db = await userStore();
      await db.put('meta', current, 'profiles-before-v42-switch');
      await db.put('staging', current, 'profiles/interrupted-import');
      await db.put('staging', { retained: true }, 'unassigned-operation');
      await db.put('master', value, 'active');
      const originalUser = await db.getAll('user');
      const originalMeta = await db.getAll('meta');
      const originalStaging = await db.getAll('staging');
      const originalStageKeys = await db.getAllKeys('staging');

      expect(await loadActiveMaster()).toEqual({ state: 'discarded', reason });
      expect(await db.get('master', 'active')).toBeUndefined();
      expect(await db.getAll('user')).toEqual(originalUser);
      expect(await db.getAll('meta')).toEqual(originalMeta);
      expect(await db.getAll('staging')).toEqual(originalStaging);
      expect(await db.getAllKeys('staging')).toEqual(originalStageKeys);
      db.close();
    },
  );

  it('loads a transactionally validated snapshot through its small activation receipt', async () => {
    await stageAndActivate(manifest, fixture, new Date('2026-09-05T00:00:00.000Z'));

    expect(await loadActiveMaster()).toMatchObject({
      state: 'ready',
      active: {
        snapshot: { version: fixture.version },
      },
    });
    const db = await userStore();
    const stored = (await db.get('master', 'active')) as {
      snapshotBytes: unknown;
      validation: Record<string, unknown>;
    };
    expect(stored.snapshotBytes).toBeInstanceOf(ArrayBuffer);
    expect(stored.validation).toMatchObject({
      version: 1,
      contract: 'master-snapshot-v43.1',
      masterSchemaVersion: manifest.schemaVersion,
      masterDataVersion: fixture.version,
      artifactSha256: manifest.files[0]!.sha256,
    });
    expect(stored.validation['snapshotSha256']).toMatch(/^[a-f0-9]{64}$/);
    db.close();
  });

  it('discards a pre-receipt snapshot instead of trusting unproven nested data', async () => {
    const db = await userStore();
    await db.put(
      'master',
      { manifest, snapshot: fixture, activatedAt: '2026-09-05T00:00:00.000Z' },
      'active',
    );
    db.close();

    expect(await loadActiveMaster()).toEqual({ state: 'discarded', reason: 'invalid_schema' });
    const check = await userStore();
    expect(await check.get('master', 'active')).toBeUndefined();
    check.close();
  });

  it('discards a nested mutation because the stored bytes no longer match the receipt', async () => {
    await stageAndActivate(manifest, fixture, new Date('2026-09-05T00:00:00.000Z'));
    const db = await userStore();
    const stored = (await db.get('master', 'active')) as { snapshotBytes: ArrayBuffer };
    const snapshot = JSON.parse(new TextDecoder().decode(stored.snapshotBytes)) as typeof fixture;
    snapshot.servants[0]!.rarity = 99;
    stored.snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).buffer;
    await db.put('master', stored, 'active');
    db.close();

    expect(await loadActiveMaster()).toEqual({ state: 'discarded', reason: 'invalid_schema' });
  });
});
