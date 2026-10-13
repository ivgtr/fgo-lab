// @vitest-environment node
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { LAB_DATABASE_VERSION } from './labDatabase';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createProfileCollection } from '@fgo-lab/profile-domain';
import {
  createDefaultCalculatorPortableRequest,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  SCHEMA_VERSION,
  type ProfileCollection,
  type UserDataBackup,
} from '@fgo-lab/schema';
import { finalizeHistory, portableCalculationFingerprint } from '@fgo-lab/workspace-domain';
import { IndexedDbProfileRepository } from './repository';
import { createShareFragment, exportBackup, importBackup, readShareFragment } from './share';

const master = masterSnapshotSchema.parse(fixture);
const now = '2026-10-03T00:00:00.000Z';
const sessionId = '00000000-0000-4000-8000-000000000002';
const request = createDefaultCalculatorPortableRequest(master, undefined);
const execution = executePortableCalculation(request, master);
if (execution.status !== 'executed') throw new Error('executable fixture required');
const result = execution.execution.result;
const repository = new IndexedDbProfileRepository();
function nativeMethod<T extends object, K extends keyof T>(prototype: T, key: K): T[K] {
  const value: unknown = Object.getOwnPropertyDescriptor(prototype, key)?.value;
  if (typeof value !== 'function') throw new Error('native request function required');
  return value as T[K];
}
async function collection() {
  const currentRequest = structuredClone(request);
  const currentResult = structuredClone(result);
  const base = createProfileCollection(
    'current',
    { now: () => new Date(now) },
    {
      next: () => '00000000-0000-4000-8000-000000000001',
    },
  );
  const profile = base.profiles[0]!;
  const fingerprint = await portableCalculationFingerprint(currentRequest, (bytes) =>
    crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
  );
  const current = finalizeHistory(profile, {
    sessionId,
    request: currentRequest,
    result: currentResult,
    fingerprint,
    now,
    historyId: sessionId,
  });
  return {
    ...base,
    profiles: [
      {
        ...current,
        draft: {
          profileId: profile.profileId,
          calculationSessionId: sessionId,
          request: currentRequest,
          result: currentResult,
          requestFingerprint: fingerprint,
          updatedAt: now,
        },
      },
    ],
  };
}
function backup(profiles: ProfileCollection): UserDataBackup {
  return {
    kind: 'fgo-lab-user-backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now,
    profiles,
  };
}
async function db() {
  await repository.load();
  return openDB('fgo-lab', LAB_DATABASE_VERSION);
}
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const connection = await db();
  for (const store of ['user', 'meta', 'staging']) await connection.clear(store);
  connection.close();
});

it('round-trips a current request/result/hash pair through repository, atomic import, backup and share', async () => {
  const current = await collection();
  await repository.replace(current);
  expect(await repository.load()).toEqual({ state: 'ready', collection: current });
  const restored = await importBackup(await exportBackup(backup(current)));
  expect(restored.profiles).toEqual(current);
  await repository.replaceAtomicallyWithBackup(restored.profiles);
  const connection = await db();
  expect(await connection.get('meta', 'profiles-before-v42-switch')).toEqual(current);
  expect(await connection.getAllKeys('staging')).toEqual([]);
  expect(await repository.load()).toEqual({ state: 'ready', collection: current });
  const shared = {
    kind: 'fgo-lab-calculation-share' as const,
    schemaVersion: SCHEMA_VERSION,
    sharedAt: now,
    request,
    result,
  };
  expect(readShareFragment(createShareFragment(shared))).toEqual(shared);
  connection.close();
});

it.each([
  'missingActive',
  'duplicateProfile',
  'draftOwner',
  'historyOwner',
  'draftHash',
  'historyHash',
  'duplicateHistory',
] as const)(
  'rejects current %s at each persistence boundary and preserves original stores',
  async (fault) => {
    const current = await collection();
    await repository.replace(current);
    const invalid = structuredClone(current);
    const profile = invalid.profiles[0]!;
    switch (fault) {
      case 'missingActive':
        invalid.activeProfileId = sessionId;
        break;
      case 'duplicateProfile':
        invalid.profiles.push(structuredClone(profile));
        break;
      case 'draftOwner':
        profile.draft.profileId = sessionId;
        break;
      case 'historyOwner':
        profile.history[0]!.profileId = sessionId;
        break;
      case 'draftHash':
        profile.draft.requestFingerprint = '0'.repeat(64);
        break;
      case 'historyHash':
        profile.history[0]!.requestFingerprint = '0'.repeat(64);
        break;
      case 'duplicateHistory':
        profile.history.push(structuredClone(profile.history[0]!));
        break;
    }
    const originalInput = structuredClone(invalid);
    const connection = await db();
    const metadata = await connection.getAll('meta');
    const staging = await connection.getAll('staging');
    await expect(repository.replace(invalid)).rejects.toThrow();
    await expect(repository.replaceAtomicallyWithBackup(invalid)).rejects.toThrow();
    await expect(exportBackup(backup(invalid))).rejects.toThrow();
    await expect(importBackup(JSON.stringify(backup(invalid)))).rejects.toThrow();
    expect(await connection.get('user', 'profiles')).toEqual(current);
    expect(await connection.getAll('meta')).toEqual(metadata);
    expect(await connection.getAll('staging')).toEqual(staging);
    await connection.put('user', invalid, 'profiles');
    expect(await repository.load()).toEqual({ state: 'invalid', reason: 'profile_parse_failed' });
    expect(await connection.get('user', 'profiles')).toEqual(originalInput);
    expect(await connection.getAll('meta')).toEqual(metadata);
    expect(await connection.getAll('staging')).toEqual(staging);
    expect(invalid).toEqual(originalInput);
    connection.close();
  },
);

it('rejects explicit undefined before export can drop it and retains the original IndexedDB record', async () => {
  const invalid = await collection();
  const scenario = invalid.profiles[0]!.draft.request.scenario;
  if (scenario.mode !== 'resolved') throw new Error('resolved fixture required');
  Object.defineProperty(scenario.explicitOverrides, 'attackerAtk', {
    value: undefined,
    enumerable: true,
  });
  await expect(exportBackup(backup(invalid))).rejects.toThrow();
  await expect(repository.replace(invalid)).rejects.toThrow();
  const connection = await db();
  await connection.put('user', invalid, 'profiles');
  expect(await repository.load()).toEqual({ state: 'invalid', reason: 'profile_parse_failed' });
  const stored = (await connection.get('user', 'profiles')) as ProfileCollection;
  const storedScenario = stored.profiles[0]!.draft!.request.scenario;
  if (storedScenario.mode !== 'resolved') throw new Error('resolved fixture required');
  expect(Object.hasOwn(storedScenario.explicitOverrides, 'attackerAtk')).toBe(true);
  expect(storedScenario.explicitOverrides.attackerAtk).toBeUndefined();
  expect(await connection.getAllKeys('meta')).toEqual([]);
  expect(await connection.getAllKeys('staging')).toEqual([]);
  connection.close();
});

it.each([
  'beforeTransaction',
  'stagePut',
  'stageRead',
  'backupPut',
  'userPut',
  'stageDelete',
] as const)('aborts %s without changing user, backup or foreign staging', async (phase) => {
  const current = await collection();
  await repository.replace(current);
  const next = structuredClone(current);
  next.profiles[0]!.name = 'replacement';
  const connection = await db();
  await connection.put('meta', { retained: true }, 'profiles-before-v42-switch');
  await connection.put('staging', { foreign: true }, 'foreign-operation');
  const controller = new AbortController();
  const guard = { signal: controller.signal, isCurrent: () => !controller.signal.aborted };
  const observe = <T>(
    operation: 'put' | 'get' | 'delete',
    store: IDBObjectStore,
    key: unknown,
    request: IDBRequest<T>,
  ) => {
    const target =
      (phase === 'stagePut' && operation === 'put' && store.name === 'staging') ||
      (phase === 'stageRead' && operation === 'get' && store.name === 'staging') ||
      (phase === 'backupPut' && operation === 'put' && store.name === 'meta') ||
      (phase === 'userPut' && operation === 'put' && store.name === 'user' && key === 'profiles') ||
      (phase === 'stageDelete' && operation === 'delete' && store.name === 'staging');
    if (target) request.addEventListener('success', () => controller.abort(), { once: true });
    return request;
  };
  const originalPut = nativeMethod(IDBObjectStore.prototype, 'put');
  const originalGet = nativeMethod(IDBObjectStore.prototype, 'get');
  const originalDelete = nativeMethod(IDBObjectStore.prototype, 'delete');
  const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
  const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get');
  const deleteSpy = vi.spyOn(IDBObjectStore.prototype, 'delete');
  putSpy.mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    return observe('put', this, key, originalPut.call(this, value, key));
  });
  getSpy.mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
    return observe('get', this, key, originalGet.call(this, key));
  });
  deleteSpy.mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
    return observe('delete', this, key, originalDelete.call(this, key));
  });
  if (phase === 'beforeTransaction') controller.abort();
  expect(await repository.replaceAtomicallyWithBackup(next, { guard })).toEqual({
    status: 'aborted',
    reason: 'stale',
  });
  expect(await connection.get('user', 'profiles')).toEqual(current);
  expect(await connection.get('meta', 'profiles-before-v42-switch')).toEqual({ retained: true });
  expect(await connection.getAllKeys('staging')).toEqual(['foreign-operation']);
  expect(await connection.get('staging', 'foreign-operation')).toEqual({ foreign: true });
  connection.close();
});

it('reports committed when invalidation arrives after durable commit, without a compensating write', async () => {
  const current = await collection();
  await repository.replace(current);
  const next = structuredClone(current);
  next.profiles[0]!.name = 'committed';
  const controller = new AbortController();
  const original = nativeMethod(IDBDatabase.prototype, 'transaction');
  const transactionSpy = vi.spyOn(IDBDatabase.prototype, 'transaction');
  transactionSpy.mockImplementation(function (
    this: IDBDatabase,
    stores: string | string[],
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ) {
    const transaction = original.call(this, stores, mode, options);
    if (transaction.mode === 'readwrite' && transaction.objectStoreNames.contains('user'))
      transaction.addEventListener('complete', () => controller.abort(), { once: true });
    return transaction;
  });
  expect(
    await repository.replace(next, {
      guard: { signal: controller.signal, isCurrent: () => !controller.signal.aborted },
    }),
  ).toEqual({ status: 'committed' });
  expect(controller.signal.aborted).toBe(true);
  const connection = await db();
  expect(await connection.get('user', 'profiles')).toEqual(next);
  expect(await connection.getAllKeys('meta')).toEqual([]);
  expect(await connection.getAllKeys('staging')).toEqual([]);
  connection.close();
});

it.each(['stagePut', 'stageRead', 'backupPut', 'userPut', 'stageDelete'] as const)(
  'rolls back %s request faults without losing the original pair, backup or foreign staging',
  async (phase) => {
    const current = await collection();
    await repository.replace(current);
    const next = structuredClone(current);
    next.profiles[0]!.name = 'faulted replacement';
    const connection = await db();
    await connection.put('meta', { retained: true }, 'profiles-before-v42-switch');
    await connection.put('staging', { foreign: true }, 'foreign-operation');
    const fault = new Error(`request_fault:${phase}`);
    const originalPut = nativeMethod(IDBObjectStore.prototype, 'put');
    const originalGet = nativeMethod(IDBObjectStore.prototype, 'get');
    const originalDelete = nativeMethod(IDBObjectStore.prototype, 'delete');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key);
      if (
        (phase === 'stagePut' && this.name === 'staging') ||
        (phase === 'backupPut' && this.name === 'meta') ||
        (phase === 'userPut' && this.name === 'user' && key === 'profiles')
      )
        throw fault;
      return request;
    });
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      const request = originalGet.call(this, key);
      if (phase === 'stageRead' && this.name === 'staging') throw fault;
      return request;
    });
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      const request = originalDelete.call(this, key);
      if (phase === 'stageDelete' && this.name === 'staging') throw fault;
      return request;
    });

    await expect(repository.replaceAtomicallyWithBackup(next)).rejects.toBe(fault);
    vi.restoreAllMocks();
    expect(await connection.get('user', 'profiles')).toEqual(current);
    expect(await connection.get('meta', 'profiles-before-v42-switch')).toEqual({ retained: true });
    expect(await connection.getAllKeys('staging')).toEqual(['foreign-operation']);
    expect(await connection.get('staging', 'foreign-operation')).toEqual({ foreign: true });
    connection.close();
  },
);

it('backs up the immediately preceding durable collection across concurrent repository instances', async () => {
  const current = await collection();
  await repository.replace(current);
  const first = structuredClone(current);
  const second = structuredClone(current);
  first.profiles[0]!.name = 'first';
  second.profiles[0]!.name = 'second';
  expect(
    await Promise.all([
      repository.replaceAtomicallyWithBackup(first),
      new IndexedDbProfileRepository().replaceAtomicallyWithBackup(second),
    ]),
  ).toEqual([{ status: 'committed' }, { status: 'committed' }]);
  const connection = await db();
  const stored: unknown = await connection.get('user', 'profiles');
  const preceding: unknown = await connection.get('meta', 'profiles-before-v42-switch');
  expect([stored, preceding]).toEqual(expect.arrayContaining([first, second]));
  expect(await connection.getAllKeys('staging')).toEqual([]);
  connection.close();
});

it('creates setup data only while the durable store is empty', async () => {
  const current = await collection();
  expect(await repository.replace(current, { requireEmpty: true })).toEqual({
    status: 'committed',
  });
  const conflicting = structuredClone(current);
  conflicting.profiles[0]!.name = 'late setup';
  expect(await repository.replace(conflicting, { requireEmpty: true })).toEqual({
    status: 'aborted',
    reason: 'stale',
  });
  expect(await repository.load()).toEqual({ state: 'ready', collection: current });
});

it('clears user data while retaining master, metadata and foreign staging', async () => {
  const current = await collection();
  await repository.replace(current);
  const connection = await db();
  await connection.put('meta', { original: true }, 'retained');
  await connection.put('staging', { original: true }, 'foreign');
  await repository.clear();
  expect(await repository.load()).toEqual({ state: 'empty' });
  expect(await connection.get('meta', 'retained')).toEqual({ original: true });
  expect(await connection.get('staging', 'foreign')).toEqual({ original: true });
  connection.close();
});
