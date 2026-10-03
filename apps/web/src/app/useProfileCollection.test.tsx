// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createProfileCollection, type ProfileRepository } from '@fgo-lab/profile-domain';
import type { ProfileCollection } from '@fgo-lab/schema';
import { useProfileCollection } from './useProfileCollection';

const initial = createProfileCollection(
  'マスター',
  { now: () => new Date('2026-08-24T00:00:00.000Z') },
  { next: () => '00000000-0000-4000-8000-000000000001' },
);

describe('profile collection state owner', () => {
  it('serializes concurrent updates against the latest committed collection', async () => {
    let stored: ProfileCollection | undefined = initial;
    const repository: ProfileRepository = {
      clear: () => Promise.resolve(),
      load: () =>
        Promise.resolve(
          stored
            ? {
                state: 'ready' as const,
                collection: stored,
              }
            : { state: 'empty' as const },
        ),
      replace: async (collection) => {
        await Promise.resolve();
        stored = collection;
        return { status: 'committed' };
      },
    };
    const { result } = renderHook(() => useProfileCollection(repository));
    await act(async () => {
      await result.current.initialize(initial);
    });
    await act(async () => {
      await Promise.all([
        result.current.updateActive((profile) => ({ ...profile, name: '更新済み' })),
        result.current.updateActive((profile) => ({
          ...profile,
          servantBuilds: {
            ...profile.servantBuilds,
            x: {
              servantId: 'x',
              level: 1,
              ascension: 0,
              npLevel: 1,
              fouAtk: 0,
              skills: {},
              appends: {},
              updatedAt: '2026-08-24T00:00:00.000Z',
            },
          },
        })),
      ]);
    });
    expect(stored.profiles[0]?.name).toBe('更新済み');
    expect(stored.profiles[0]?.servantBuilds['x']?.npLevel).toBe(1);
  });
});

it('takes the undo snapshot when its queued operation starts', async () => {
  let stored = initial;
  const repository: ProfileRepository = {
    clear: () => Promise.resolve(),
    load: () => Promise.resolve({ state: 'ready', collection: stored }),
    replace: (next) => {
      stored = next;
      return Promise.resolve({ status: 'committed' });
    },
  };
  const { result } = renderHook(() => useProfileCollection(repository));
  await act(async () => {
    await result.current.initialize(initial);
  });
  await act(async () => {
    await result.current.updateActive((profile) => ({ ...profile, name: 'A' }));
  });
  await act(async () => {
    const edit = result.current.updateActive((profile) => ({ ...profile, name: 'B' }));
    const undo = result.current.undo();
    await Promise.all([edit, undo]);
  });
  expect(stored.profiles[0]!.name).toBe('A');
  expect(result.current.profiles).toEqual(stored);
  expect(result.current.undoSnapshot).toBeUndefined();
  return Promise.resolve();
});

it('serializes edits, import and subsequent edits with one committed state and backup option', async () => {
  let stored = initial;
  let retained: ProfileCollection | undefined;
  const events: string[] = [];
  const repository: ProfileRepository = {
    clear: () => Promise.resolve(),
    load: () => Promise.resolve({ state: 'ready', collection: stored }),
    replace: (next, options) => {
      if (options?.backup) retained = stored;
      if (options?.guard && (options.guard.signal.aborted || !options.guard.isCurrent()))
        return Promise.resolve({ status: 'aborted', reason: 'stale' });
      stored = next;
      events.push(next.profiles[0]!.name);
      return Promise.resolve({ status: 'committed' });
    },
  };
  const { result } = renderHook(() => useProfileCollection(repository));
  await act(async () => {
    await result.current.initialize(initial);
  });
  const imported = { ...initial, profiles: [{ ...initial.profiles[0]!, name: 'imported' }] };
  const controller = new AbortController();
  await act(async () => {
    await Promise.all([
      result.current.updateActive((profile) => ({ ...profile, name: 'edited' })),
      result.current.importCollection(imported, {
        signal: controller.signal,
        isCurrent: () => true,
      }),
      result.current.updateActive((profile) => ({ ...profile, name: profile.name + '+edit' })),
    ]);
  });
  expect(events).toEqual(['edited', 'imported', 'imported+edit']);
  expect(retained?.profiles[0]!.name).toBe('edited');
  expect(result.current.profiles).toEqual(stored);
  expect(result.current.undoSnapshot).toEqual(imported);
  return Promise.resolve();
});

it('rejects a stale initialization snapshot without changing the committed profile', async () => {
  let stored = initial;
  const repository: ProfileRepository = {
    clear: () => Promise.resolve(),
    load: () => Promise.resolve({ state: 'ready', collection: stored }),
    replace: (next) => {
      stored = next;
      return Promise.resolve({ status: 'committed' });
    },
  };
  const { result } = renderHook(() => useProfileCollection(repository));
  await act(async () => {
    await result.current.initialize(initial);
  });
  await act(async () => {
    await result.current.updateActive((profile) => ({ ...profile, name: 'current' }));
  });
  const committed = result.current.profiles;
  await act(async () => {
    expect(await result.current.initialize(initial)).toEqual({
      status: 'aborted',
      reason: 'stale',
    });
  });
  expect(result.current.profiles).toBe(committed);
  expect(stored).toEqual(committed);
  return Promise.resolve();
});

it('invalidates a pending conditional transaction before queued initialization publishes', async () => {
  let stored = initial;
  let started!: () => void;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const repository: ProfileRepository = {
    clear: () => Promise.resolve(),
    load: () => Promise.resolve({ state: 'ready', collection: stored }),
    replace: async (next, options) => {
      started();
      await blocked;
      if (options?.guard && (options.guard.signal.aborted || !options.guard.isCurrent()))
        return { status: 'aborted', reason: 'stale' };
      stored = next;
      return { status: 'committed' };
    },
  };
  const { result } = renderHook(() => useProfileCollection(repository));
  await act(async () => {
    await result.current.initialize(initial);
  });
  const controller = new AbortController();
  await act(async () => {
    const write = result.current.updateActive((profile) => ({ ...profile, name: 'stale' }), {
      signal: controller.signal,
      isCurrent: () => true,
    });
    await pending;
    const initialize = result.current.initialize(initial);
    release();
    expect(await write).toEqual({ status: 'aborted', reason: 'stale' });
    expect(await initialize).toEqual({ status: 'initialized' });
  });
  expect(result.current.profiles).toEqual(initial);
  expect(stored).toEqual(initial);
  expect(result.current.undoSnapshot).toBeUndefined();
  return Promise.resolve();
});

it('queues explicit clear after committed edits and prevents a subsequent edit from recreating data', async () => {
  let stored: ProfileCollection | undefined = initial;
  const events: string[] = [];
  const repository: ProfileRepository = {
    load: () =>
      Promise.resolve(stored ? { state: 'ready', collection: stored } : { state: 'empty' }),
    replace: (next) => {
      stored = next;
      events.push('edit');
      return Promise.resolve({ status: 'committed' });
    },
    clear: () => {
      stored = undefined;
      events.push('clear');
      return Promise.resolve();
    },
  };
  const { result } = renderHook(() => useProfileCollection(repository));
  await act(async () => {
    await result.current.initialize(initial);
  });
  await act(async () => {
    const edit = result.current.updateActive((profile) => ({ ...profile, name: 'edited' }));
    const clear = result.current.clear();
    await Promise.all([edit, clear]);
  });
  expect(events).toEqual(['edit', 'clear']);
  expect(stored).toBeUndefined();
  expect(result.current.profiles).toBeUndefined();
  expect(result.current.undoSnapshot).toBeUndefined();
  await expect(result.current.updateActive((profile) => profile)).rejects.toThrow(
    'profile_collection_not_initialized',
  );
  expect(stored).toBeUndefined();
  return Promise.resolve();
});
