// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileCollection, type ProfileRepository } from '@fgo-lab/profile-domain';
import type { MasterManifest } from '@fgo-lab/master-data';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { loadActiveMaster, stageAndActivate } from '../adapters/repository';
import { openDB } from 'idb';
import { bootstrapApplication } from './startup';

const now = new Date('2026-09-05T00:00:00.000Z');
const manifest: MasterManifest = {
  manifestVersion: 1,
  masterDataVersion: fixture.version,
  createdAt: now.toISOString(),
  source: { name: 'Atlas Academy', region: 'JP', retrievedAt: now.toISOString() },
  artifactKind: 'diagnostic',
  minimalAppVersion: '0.1.0',
  schemaVersion: 56,
  files: [
    {
      key: 'master',
      file: 'master.json',
      bytes: 1,
      sha256: '0'.repeat(64),
      required: true,
    },
  ],
  imagesEnabled: false,
};
const profiles = createProfileCollection(
  'マスター',
  { now: () => now },
  { next: () => '00000000-0000-4000-8000-000000000001' },
);
const profilesRepository: ProfileRepository = {
  clear: () => Promise.resolve(),
  load: () =>
    Promise.resolve({
      state: 'ready',
      collection: profiles,
    }),
  replace: () => Promise.resolve({ status: 'committed' }),
};

describe('startup master delivery', () => {
  beforeEach(async () => {
    await stageAndActivate(manifest, fixture, now);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('downloads only the manifest when the validated IndexedDB version is current', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(manifest)));
    vi.stubGlobal('fetch', fetchMock);

    const result = await bootstrapApplication(profilesRepository, {
      baseUrl: '/',
      development: true,
      fragment: '',
      now,
    });

    expect(result.state).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/master/manifest.json', { cache: 'no-store' });
  });

  it('keeps validated profiles when incompatible master recovery cannot download the replacement', async () => {
    const db = await openDB('fgo-lab', 1);
    const active: unknown = await db.get('master', 'active');
    if (active === null || typeof active !== 'object') throw new Error('fixture_master_missing');
    const snapshot = {
      ...fixture,
      servants: [{ ...fixture.servants[0]!, rarity: 99 }, ...fixture.servants.slice(1)],
    };
    await db.put(
      'master',
      {
        ...active,
        snapshotBytes: new TextEncoder().encode(JSON.stringify(snapshot)).buffer,
      },
      'active',
    );
    db.close();
    const repository = {
      ...profilesRepository,
      clear: vi.fn(() => Promise.resolve()),
      replace: vi.fn(() => Promise.resolve({ status: 'committed' as const })),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    const result = await bootstrapApplication(repository, {
      baseUrl: '/',
      development: true,
      fragment: '',
      now,
    });
    expect(result).toMatchObject({
      state: 'setup-required',
      master: undefined,
      profiles,
      invalidStoredProfiles: false,
      warning: '互換性のない旧マスターデータを削除しました。再セットアップが必要です: offline',
    });
    expect(result.profiles).toBe(profiles);
    expect(await loadActiveMaster()).toEqual({ state: 'empty' });
    expect(repository.clear).not.toHaveBeenCalled();
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it('retains the validated IndexedDB version when the manifest update check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );

    const result = await bootstrapApplication(profilesRepository, {
      baseUrl: '/',
      development: true,
      fragment: '',
      now,
    });

    expect(result).toMatchObject({
      state: 'ready',
      master: { version: fixture.version },
      warning: `更新に失敗したため互換性確認済みの ${fixture.version} を使用中: offline`,
    });
  });
});
