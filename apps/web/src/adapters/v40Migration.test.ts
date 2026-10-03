import { createHash } from 'node:crypto';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { expect, it } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculateScenario,
  createDefaultResolvedScenario,
  createCurrentRequestFromHistoricalCalculation,
  executePortableCalculation,
  requireExecutableCalculation,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  migrateStoredProfileCollectionV40,
} from '@fgo-lab/schema';
import { canonicalize } from '@fgo-lab/workspace-domain';
import { importBackupWithMigration, readShareFragment } from './share';
import { IndexedDbProfileRepository } from './repository';
import { portableCalculationRequestV40Schema } from '@fgo-lab/schema';

it('preserves a v40 draft and history as historical records', async () => {
  const master = masterSnapshotSchema.parse(fixture);
  const scenario = createDefaultResolvedScenario(master, undefined);
  const oldScenario = Object.fromEntries(
    Object.entries(scenario).filter(
      ([key]) => key !== 'enemyDefenseBuff' && key !== 'initialBattlePointPoints',
    ),
  );
  const oldRequest = {
    versionContext: { masterDataVersion: master.version, engineVersion: ENGINE_VERSION },
    scenario: oldScenario,
    executionIntent: { kind: 'calculator', initialNpGauge: scenario.initialOvercharge * 10000 },
  };
  const result = requireExecutableCalculation(
    calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
    }),
  ).result;
  const oldResult = { ...result, versions: { ...result.versions, schemaVersion: 40 } };
  const fingerprint = (request: unknown) =>
    Promise.resolve(createHash('sha256').update(canonicalize(request)).digest('hex'));
  const oldFingerprint = await fingerprint(oldRequest);
  const v41 = createCurrentRequestFromHistoricalCalculation(
    portableCalculationRequestV40Schema.parse(oldRequest),
    master,
  );
  expect(oldFingerprint).toBe('6a26406c67d1db3d0a66e553dfacd937a2144c9bff70bd623b62df4a5159834d');
  expect(await fingerprint(v41)).toBe(
    '347e8dcb3aa9603491371e257cc2f2b3a22fed8663179cd7b81ead31f4a35d6a',
  );
  expect(v41.versionContext.schemaVersion).toBe(41);
  expect(v41.scenario).toMatchObject({ enemyDefenseBuff: 0 });
  expect(await fingerprint(v41)).not.toBe(oldFingerprint);
  const now = '2026-09-25T00:00:00.000Z';
  const profileId = '00000000-0000-4000-8000-000000000001';
  const snapshot = {
    profileId,
    calculationSessionId: '00000000-0000-4000-8000-000000000002',
    request: oldRequest,
    result: oldResult,
    requestFingerprint: oldFingerprint,
    updatedAt: now,
  };
  const source = {
    schemaVersion: 40,
    activeProfileId: profileId,
    profiles: [
      {
        profileId,
        name: 'test',
        createdAt: now,
        updatedAt: now,
        servantBuilds: {},
        servantTargets: {},
        craftEssences: [],
        supportTemplates: [],
        draft: snapshot,
        history: [
          {
            ...snapshot,
            historyId: '00000000-0000-4000-8000-000000000003',
            finalizedAt: now,
            lastUsedAt: now,
          },
        ],
      },
    ],
  };
  const migrated = await migrateStoredProfileCollectionV40(source, fingerprint);
  const profile = migrated.profiles[0]!;
  expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  expect(profile.draft).toBeNull();
  expect(profile.historicalDraft?.legacySnapshot).toEqual(snapshot);
  expect(profile.historicalDraft?.requestFingerprint).toBe(oldFingerprint);
  expect(profile.historicalDraft?.result.versions.schemaVersion).toBe(40);
  expect(profile.history[0]).toMatchObject({
    disposition: 'historicalOnly',
    sourceSchemaVersion: 40,
    requestFingerprint: oldFingerprint,
    result: { versions: { schemaVersion: 40 } },
    legacySnapshot: { request: oldRequest, result: oldResult },
  });
  const oldShare = {
    kind: 'fgo-lab-calculation-share',
    schemaVersion: 40,
    sharedAt: now,
    request: oldRequest,
    result: oldResult,
  };
  const shared = readShareFragment(
    `#share=${Buffer.from(JSON.stringify(oldShare)).toString('base64url')}`,
  );
  expect(shared).toMatchObject({ disposition: 'historicalOnly', raw: oldShare });
  const backup = await importBackupWithMigration(
    JSON.stringify({
      kind: 'fgo-lab-user-backup',
      schemaVersion: 40,
      exportedAt: now,
      appVersion: APP_VERSION,
      profiles: source,
    }),
  );
  expect(backup.profiles).toEqual(migrated);
  const repository = new IndexedDbProfileRepository();
  await repository.load();
  const db = await openDB('fgo-lab', 1);
  await db.put('user', source, 'profiles');
  const loaded = await repository.load();
  expect(loaded).toMatchObject({ state: 'ready', collection: migrated });
  expect(await db.get('meta', 'profiles-before-v41-switch')).toEqual(source);
  expect(await db.get('user', 'profiles')).toEqual(migrated);
  const corrupted = structuredClone(source);
  corrupted.profiles[0]!.draft.requestFingerprint = '0'.repeat(64);
  await db.put('user', corrupted, 'profiles');
  expect(await repository.load()).toMatchObject({ state: 'invalid' });
  expect(await db.get('user', 'profiles')).toEqual(corrupted);
  const corruptedV41 = structuredClone(migrated);
  (
    corruptedV41.profiles[0]!.historicalDraft!.legacySnapshot as typeof snapshot
  ).requestFingerprint = '0'.repeat(64);
  await expect(
    importBackupWithMigration(
      JSON.stringify({
        kind: 'fgo-lab-user-backup',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: now,
        appVersion: APP_VERSION,
        profiles: corruptedV41,
      }),
    ),
  ).rejects.toThrow('historical_v40_identity_mismatch');
  await expect(
    migrateStoredProfileCollectionV40(
      {
        schemaVersion: 40,
        activeProfileId: profileId,
        profiles: [
          {
            profileId,
            name: 'test',
            createdAt: now,
            updatedAt: now,
            servantBuilds: {},
            servantTargets: {},
            craftEssences: [],
            supportTemplates: [],
            draft: { ...snapshot, requestFingerprint: '0'.repeat(64) },
            history: [],
          },
        ],
      },
      fingerprint,
    ),
  ).rejects.toThrow('v40_draft_fingerprint_mismatch');
});

it('keeps a v40 manual request historical until explicit recalculation', async () => {
  const master = masterSnapshotSchema.parse(fixture);
  const resolvedScenario = createDefaultResolvedScenario(master, undefined);
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: master.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const resolved = requireExecutableCalculation(
    calculateScenario(resolvedScenario, master, versions),
  );
  const manual = { mode: 'manual' as const, manual: resolved.input };
  const oldRequest = portableCalculationRequestV40Schema.parse({
    versionContext: { masterDataVersion: master.version, engineVersion: ENGINE_VERSION },
    scenario: manual,
    executionIntent: { kind: 'manual' },
  });
  const oldResult = {
    ...requireExecutableCalculation(calculateScenario(manual, master, versions)).result,
    versions: { ...versions, schemaVersion: 40 as const },
  };
  const oldFingerprint = createHash('sha256').update(canonicalize(oldRequest)).digest('hex');
  const now = '2026-09-25T00:00:00.000Z';
  const profileId = '00000000-0000-4000-8000-000000000001';
  const snapshot = {
    profileId,
    calculationSessionId: '00000000-0000-4000-8000-000000000002',
    request: oldRequest,
    result: oldResult,
    requestFingerprint: oldFingerprint,
    updatedAt: now,
  };
  const collection = await migrateStoredProfileCollectionV40(
    {
      schemaVersion: 40,
      activeProfileId: profileId,
      profiles: [
        {
          profileId,
          name: 'manual',
          createdAt: now,
          updatedAt: now,
          servantBuilds: {},
          servantTargets: {},
          craftEssences: [],
          supportTemplates: [],
          draft: snapshot,
          history: [
            {
              ...snapshot,
              historyId: '00000000-0000-4000-8000-000000000003',
              finalizedAt: now,
              lastUsedAt: now,
            },
          ],
        },
      ],
    },
    (request) => Promise.resolve(createHash('sha256').update(canonicalize(request)).digest('hex')),
  );
  expect(collection.profiles[0]?.draft).toBeNull();
  expect(collection.profiles[0]?.historicalDraft?.legacySnapshot).toEqual(snapshot);
  expect(collection.profiles[0]?.history[0]).toMatchObject({
    disposition: 'historicalOnly',
    requestFingerprint: oldFingerprint,
    result: { versions: { schemaVersion: 40 } },
  });
  const v41 = createCurrentRequestFromHistoricalCalculation(oldRequest, master);
  expect(oldFingerprint).toBe('3f438a0c206d8b1fcc3b12a0a121b215fa0932c493d22692ddd8ccfce514315f');
  expect(createHash('sha256').update(canonicalize(v41)).digest('hex')).toBe(
    '4a5d35208663228fa1810175776d5e7445e18bc2cfc0c03f5583461d03171ea8',
  );
  expect(v41.executionIntent).toEqual({ kind: 'manual' });
  expect(v41.versionContext.schemaVersion).toBe(41);
  expect(createHash('sha256').update(canonicalize(v41)).digest('hex')).not.toBe(oldFingerprint);
  expect(executePortableCalculation(v41, master).status).toBe('executed');
});
