// @vitest-environment node
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileCollection, type ProfileRepository } from '@fgo-lab/profile-domain';
import { ATLAS_EXPORT_KEYS, sourceCertificateSchema } from '@fgo-lab/master-data';
import { certifiedSourceVersion, normalizeAtlasSnapshot } from '@fgo-lab/data-pipeline/browser';
import { ATLAS_CONTRACT_SHA256 } from '../adapters/atlasContractFingerprint';
import { activateAtlasMaster } from '../adapters/atlasRepository';
import { LAB_DATABASE_VERSION } from '../adapters/labDatabase';
import { fetchSourceCertificate } from '../adapters/atlasSource';
import { generateAtlasMaster } from '../adapters/atlasMasterClient';
import { bootstrapApplication, setupApplication } from './startup';
import type * as AtlasSourceModule from '../adapters/atlasSource';
import { neutralCombatRules } from '@fgo-lab/test-fixtures/combat-rules';

vi.mock('../adapters/atlasSource', async (importOriginal) => ({
  ...(await importOriginal<typeof AtlasSourceModule>()),
  fetchSourceCertificate: vi.fn(),
}));
vi.mock('../adapters/atlasMasterClient', () => ({ generateAtlasMaster: vi.fn() }));

const now = new Date('2026-10-13T05:01:00.000Z');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const profiles = createProfileCollection(
  'マスター',
  { now: () => now },
  { next: () => '00000000-0000-4000-8000-000000000001' },
);
const profilesRepository: ProfileRepository = {
  clear: () => Promise.resolve(),
  load: () => Promise.resolve({ state: 'ready', collection: profiles }),
  replace: () => Promise.resolve({ status: 'committed' }),
};

function candidate(generation: number) {
  const draft = sourceCertificateSchema.parse({
    format: 'fgo-lab-atlas-source-v1',
    region: 'JP',
    generation,
    publishedAt: now.toISOString(),
    observedAt: now.toISOString(),
    rawCommit: 'a'.repeat(40),
    rawCommittedAt: now.toISOString(),
    exporterCommit: 'b'.repeat(40),
    publisherCommit: 'c'.repeat(40),
    contractSha256: ATLAS_CONTRACT_SHA256,
    masterSchemaVersion: 57,
    canonicalSha256: '0'.repeat(64),
    exports: ATLAS_EXPORT_KEYS.map((key) => ({ key, bytes: 2, sha256: 'd'.repeat(64) })),
    referencedSkills: [],
  });
  const snapshot = normalizeAtlasSnapshot({
    version: certifiedSourceVersion(draft),
    combatRules: neutralCombatRules,
    servants: [],
    equips: [],
    mysticCodes: [],
    items: [],
    battlePoints: [],
  });
  const certificate = { ...draft, canonicalSha256: digest(JSON.stringify(snapshot)) };
  const checked = {
    certificate,
    identity: { generation, sha256: digest(JSON.stringify(certificate)) },
  };
  return { checked, snapshotBytes: new TextEncoder().encode(JSON.stringify(snapshot)).buffer };
}

describe('Atlas startup', () => {
  beforeEach(async () => {
    const db = await openDB('fgo-lab', LAB_DATABASE_VERSION, {
      upgrade(database) {
        for (const name of ['meta', 'master', 'staging', 'user'])
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
      },
    });
    await db.clear('master');
    db.close();
    vi.clearAllMocks();
  });

  it('waits for the first setup action before fetching the full Atlas master', async () => {
    const replace = vi.fn().mockResolvedValue({ status: 'committed' });
    const freshRepository: ProfileRepository = {
      clear: () => Promise.resolve(),
      load: () => Promise.resolve({ state: 'empty' }),
      replace,
    };
    const initial = await bootstrapApplication(freshRepository, { fragment: '', now });
    expect(initial).toMatchObject({ state: 'setup-required', warning: '' });
    expect(fetchSourceCertificate).not.toHaveBeenCalled();
    expect(generateAtlasMaster).not.toHaveBeenCalled();

    const first = candidate(1);
    vi.mocked(fetchSourceCertificate).mockResolvedValue({
      state: 'candidate',
      certificate: first.checked,
    });
    vi.mocked(generateAtlasMaster).mockResolvedValue({
      snapshotBytes: first.snapshotBytes,
      bytesFetched: 100,
    });
    const ready = await setupApplication(
      freshRepository,
      { now: () => now },
      { next: () => '00000000-0000-4000-8000-000000000003' },
      { fragment: '', now },
    );
    expect(ready.state).toBe('ready');
    expect(fetchSourceCertificate).toHaveBeenCalledTimes(1);
    expect(generateAtlasMaster).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('generates and activates the first certified master while retaining profiles', async () => {
    const first = candidate(1);
    vi.mocked(fetchSourceCertificate).mockResolvedValue({
      state: 'candidate',
      certificate: first.checked,
    });
    vi.mocked(generateAtlasMaster).mockResolvedValue({
      snapshotBytes: first.snapshotBytes,
      bytesFetched: 100,
    });
    const result = await bootstrapApplication(profilesRepository, { fragment: '', now });
    expect(result).toMatchObject({ state: 'ready', profiles, warning: '' });
    expect(fetchSourceCertificate).toHaveBeenCalledWith(expect.any(String), null);
    expect(generateAtlasMaster).toHaveBeenCalledTimes(1);
    vi.mocked(fetchSourceCertificate).mockResolvedValue({
      state: 'unchanged',
      certificate: first.checked,
    });
    const setup = await setupApplication(
      profilesRepository,
      { now: () => now },
      { next: () => '00000000-0000-4000-8000-000000000002' },
      { fragment: '', now },
    );
    expect(setup.state).toBe('ready');
    expect(generateAtlasMaster).toHaveBeenCalledTimes(1);
  });

  it('fetches only the certificate when the active generation is unchanged', async () => {
    const first = candidate(1);
    await activateAtlasMaster({
      checked: first.checked,
      snapshot: first.snapshotBytes,
      contractSha256: ATLAS_CONTRACT_SHA256,
      now,
    });
    vi.mocked(fetchSourceCertificate).mockResolvedValue({
      state: 'unchanged',
      certificate: first.checked,
    });
    const result = await bootstrapApplication(profilesRepository, { fragment: '', now });
    expect(result).toMatchObject({ state: 'ready', profiles, warning: '' });
    expect(fetchSourceCertificate).toHaveBeenCalledWith(expect.any(String), first.checked.identity);
    expect(generateAtlasMaster).not.toHaveBeenCalled();
  });

  it('keeps a verified active and profiles when checking Atlas fails', async () => {
    const first = candidate(1);
    await activateAtlasMaster({
      checked: first.checked,
      snapshot: first.snapshotBytes,
      contractSha256: ATLAS_CONTRACT_SHA256,
      now,
    });
    vi.mocked(fetchSourceCertificate).mockRejectedValue(new Error('unavailable'));
    const result = await bootstrapApplication(profilesRepository, { fragment: '', now });
    expect(result).toMatchObject({ state: 'ready', profiles });
    expect(result.warning).toContain('検証済みのマスターを使用中: unavailable');
    expect(generateAtlasMaster).not.toHaveBeenCalled();
  });

  it('reports source transport failure as offline while retaining a verified active', async () => {
    const first = candidate(1);
    await activateAtlasMaster({
      checked: first.checked,
      snapshot: first.snapshotBytes,
      contractSha256: ATLAS_CONTRACT_SHA256,
      now,
    });
    vi.mocked(fetchSourceCertificate).mockRejectedValue(
      new TypeError('atlas_source:transport_failure'),
    );
    const result = await bootstrapApplication(profilesRepository, { fragment: '', now });
    expect(result).toMatchObject({ state: 'ready', profiles, offline: true });
    expect(result.warning).toContain('検証済みのマスターを使用中');
  });
});
