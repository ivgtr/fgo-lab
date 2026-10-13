// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { expect, it } from 'vitest';
import { labDatabase, LAB_DATABASE_VERSION, OldTabBlocksUpgrade } from './labDatabase';

it('waits for a version 1 tab and preserves user and legacy master bytes on upgrade', async () => {
  const oldTab = await openDB('fgo-lab', 1, {
    upgrade(db) {
      for (const name of ['meta', 'master', 'staging', 'user'] as const) db.createObjectStore(name);
    },
  });
  const user = { profile: 'keep' };
  const master = { bytes: [1, 2, 3] };
  await oldTab.put('user', user, 'profiles');
  await oldTab.put('master', master, 'active');

  await expect(labDatabase()).rejects.toBeInstanceOf(OldTabBlocksUpgrade);
  expect(oldTab.version).toBe(1);
  oldTab.close();

  const upgraded = await openDB('fgo-lab', LAB_DATABASE_VERSION);
  expect(upgraded.version).toBe(2);
  expect(await upgraded.get('user', 'profiles')).toEqual(user);
  expect(await upgraded.get('master', 'active')).toEqual(master);
  upgraded.close();
});
