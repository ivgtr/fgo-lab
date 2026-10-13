import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { LAB_DATABASE_VERSION } from './labDatabase';
import { expect, it } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createDefaultCalculatorPortableRequest } from '@fgo-lab/calculation-application';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import { APP_VERSION, parseStoredProfileCollection } from '@fgo-lab/schema';
import { importBackup, readShareFragment } from './share';
import { IndexedDbProfileRepository } from './repository';

const master = masterSnapshotSchema.parse(fixture);
const now = '2026-09-25T00:00:00.000Z';
const base = createProfileCollection(
  'old-format',
  { now: () => new Date(now) },
  {
    next: () => '00000000-0000-4000-8000-000000000001',
  },
);

it.each([32, 33, 34, 35, 36, 37, 38, 39, 40, 41])(
  'rejects schema %s at storage, backup and share without changing the original storage',
  async (schemaVersion) => {
    const request = createDefaultCalculatorPortableRequest(master, undefined);
    const oldRequest = {
      ...request,
      versionContext: { ...request.versionContext, schemaVersion },
    };
    // Historical hashes remain historical input, never regenerated as current identity.
    const snapshot = {
      profileId: base.activeProfileId,
      calculationSessionId: '00000000-0000-4000-8000-000000000002',
      request: oldRequest,
      requestFingerprint: '6a26406c67d1db3d0a66e553dfacd937a2144c9bff70bd623b62df4a5159834d',
      updatedAt: now,
    };
    const source = {
      ...base,
      schemaVersion,
      profiles: [{ ...base.profiles[0], draft: snapshot }],
    };
    const original = structuredClone(source);
    expect(() => parseStoredProfileCollection(source)).toThrow();
    await expect(
      importBackup(
        JSON.stringify({
          kind: 'fgo-lab-user-backup',
          schemaVersion,
          exportedAt: now,
          appVersion: APP_VERSION,
          profiles: source,
        }),
      ),
    ).rejects.toThrow();
    expect(() =>
      readShareFragment(
        '#share=' +
          Buffer.from(
            JSON.stringify({
              kind: 'fgo-lab-calculation-share',
              schemaVersion,
              sharedAt: now,
              request: oldRequest,
            }),
          ).toString('base64url'),
      ),
    ).toThrow();
    const repository = new IndexedDbProfileRepository();
    await repository.load();
    const db = await openDB('fgo-lab', LAB_DATABASE_VERSION);
    const meta = await db.getAll('meta');
    const staging = await db.getAll('staging');
    await db.put('user', source, 'profiles');
    expect(await repository.load()).toMatchObject({ state: 'invalid' });
    expect(await db.get('user', 'profiles')).toEqual(original);
    expect(await db.getAll('meta')).toEqual(meta);
    expect(await db.getAll('staging')).toEqual(staging);
    expect(source).toEqual(original);
    db.close();
  },
);
