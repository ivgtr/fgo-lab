// @vitest-environment node
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { ATLAS_EXPORT_KEYS, sourceCertificateSchema } from '@fgo-lab/master-data';
import { certifiedSourceVersion, normalizeAtlasSnapshot } from '@fgo-lab/data-pipeline/browser';
import oldManifest from '../../../../packages/test-fixtures/master/manifest.json';
import { neutralCombatRules } from '@fgo-lab/test-fixtures/combat-rules';
import { activateAtlasMaster, loadActiveAtlasMaster } from './atlasRepository';
import { LAB_DATABASE_VERSION } from './labDatabase';

const contract = 'd'.repeat(64);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function db() {
  return openDB('fgo-lab', LAB_DATABASE_VERSION, {
    upgrade(database) {
      for (const name of ['meta', 'master', 'staging', 'user'])
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
    },
  });
}

function candidate(generation: number, exportDigest = 'e'.repeat(64)) {
  const provisional = sourceCertificateSchema.parse({
    format: 'fgo-lab-atlas-source-v1',
    region: 'JP',
    generation,
    publishedAt: '2026-10-13T05:00:00.000Z',
    observedAt: '2026-10-13T04:00:00.000Z',
    rawCommit: 'a'.repeat(40),
    rawCommittedAt: '2026-10-12T15:00:00.000Z',
    exporterCommit: 'b'.repeat(40),
    publisherCommit: 'c'.repeat(40),
    contractSha256: contract,
    masterSchemaVersion: 57,
    canonicalSha256: '0'.repeat(64),
    exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 2, sha256: exportDigest })),
    referencedSkills: [],
  });
  const snapshot = normalizeAtlasSnapshot({
    version: certifiedSourceVersion(provisional),
    combatRules: neutralCombatRules,
    servants: [],
    equips: [],
    mysticCodes: [],
    items: [],
    battlePoints: [],
  });
  const certificate = { ...provisional, canonicalSha256: digest(JSON.stringify(snapshot)) };
  const checked = {
    certificate,
    identity: { generation, sha256: digest(JSON.stringify(certificate)) },
  };
  return { checked, snapshot, contractSha256: contract, now: new Date('2026-10-13T05:01:00.000Z') };
}

describe('Atlas active master transaction', () => {
  beforeEach(async () => {
    const database = await db();
    await database.clear('master');
    await database.clear('staging');
    await database.clear('user');
    database.close();
  });

  it('checks generation in the write transaction and preserves profile data', async () => {
    // E2E-A024-BROWSER: source generation activates the current browser storage atomically.
    const database = await db();
    await database.put('user', { value: 'profile' }, 'profiles');
    database.close();
    expect(await activateAtlasMaster(candidate(1))).toMatchObject({ status: 'committed' });
    expect(await loadActiveAtlasMaster(contract)).toMatchObject({
      state: 'ready',
      active: { certificate: { generation: 1 } },
    });
    expect(await activateAtlasMaster(candidate(1))).toEqual({ status: 'unchanged' });
    expect(await activateAtlasMaster(candidate(1, 'f'.repeat(64)))).toEqual({ status: 'conflict' });
    expect(await activateAtlasMaster(candidate(2, 'f'.repeat(64)))).toMatchObject({
      status: 'committed',
    });
    const preserved = await db();
    expect(await preserved.get('user', 'profiles')).toEqual({ value: 'profile' });
    preserved.close();
  });

  it('replaces a damaged active only after a certified candidate passes validation', async () => {
    // E2E-A025-ONLINE: a valid candidate repairs master storage while retaining user data.
    const database = await db();
    await database.put('master', { broken: true }, `atlas-active:${contract}`);
    await database.put('user', { value: 'profile' }, 'profiles');
    database.close();
    expect(await loadActiveAtlasMaster(contract)).toEqual({ state: 'invalid', reason: 'record' });
    await expect(
      activateAtlasMaster({
        ...candidate(1),
        snapshot: { ...candidate(1).snapshot, version: 'bad' },
      }),
    ).rejects.toThrow('canonical_mismatch');
    const unexpected = { ...candidate(1).snapshot, unknownField: true };
    await expect(activateAtlasMaster({ ...candidate(1), snapshot: unexpected })).rejects.toThrow(
      'canonical_mismatch',
    );
    const preserved = await db();
    expect(await preserved.get('master', `atlas-active:${contract}`)).toEqual({ broken: true });
    expect(await preserved.get('user', 'profiles')).toEqual({ value: 'profile' });
    preserved.close();
    expect(await activateAtlasMaster(candidate(1))).toMatchObject({ status: 'committed' });
    expect(await loadActiveAtlasMaster(contract)).toMatchObject({ state: 'ready' });
  });

  it('removes only the retired master copy after the certified commit', async () => {
    const database = await db();
    await database.put(
      'master',
      {
        manifest: oldManifest,
        validation: {
          contract: 'master-snapshot-v43.1',
          masterDataVersion: oldManifest.masterDataVersion,
        },
      },
      'active',
    );
    await database.put('staging', { oldMaster: true }, oldManifest.masterDataVersion);
    await database.put('staging', { backup: true }, 'profiles/backup');
    await database.put('user', { value: 'profile' }, 'profiles');
    database.close();
    expect(await activateAtlasMaster(candidate(1))).toMatchObject({ status: 'committed' });
    const preserved = await db();
    expect(await preserved.get('master', 'active')).toBeUndefined();
    expect(await preserved.get('staging', oldManifest.masterDataVersion)).toBeUndefined();
    expect(await preserved.get('staging', 'profiles/backup')).toEqual({ backup: true });
    expect(await preserved.get('user', 'profiles')).toEqual({ value: 'profile' });
    preserved.close();
  });

  it('repairs a corrupted same-generation snapshot with exact certified bytes', async () => {
    const first = candidate(1);
    expect(await activateAtlasMaster(first)).toMatchObject({ status: 'committed' });
    const database = await db();
    const key = `atlas-active:${contract}`;
    const stored = (await database.get('master', key)) as Record<string, unknown>;
    await database.put(
      'master',
      { ...stored, snapshotBytes: new TextEncoder().encode('{}').buffer },
      key,
    );
    database.close();
    expect(await loadActiveAtlasMaster(contract)).toEqual({
      state: 'invalid',
      reason: 'canonical',
    });
    expect(await activateAtlasMaster(first)).toMatchObject({ status: 'committed' });
    expect(await loadActiveAtlasMaster(contract)).toMatchObject({ state: 'ready' });
  });
});
