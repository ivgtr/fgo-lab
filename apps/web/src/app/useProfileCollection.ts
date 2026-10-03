import { useCallback, useRef, useState } from 'react';
import type {
  ProfileRepository,
  ProfileWriteGuard,
  ProfileWriteOptions,
  ProfileWriteResult,
} from '@fgo-lab/profile-domain';
import type { LocalProfile, ProfileCollection } from '@fgo-lab/schema';
import { canonicalize } from '@fgo-lab/workspace-domain';

type CollectionUpdate = ProfileCollection | ((current: ProfileCollection) => ProfileCollection);
export function useProfileCollection(repository: ProfileRepository) {
  const [profiles, setProfiles] = useState<ProfileCollection>();
  const [undoSnapshot, setUndoSnapshot] = useState<ProfileCollection>();
  const currentRef = useRef<ProfileCollection | null>(null);
  const undoRef = useRef<ProfileCollection | null>(null);
  const writeQueue = useRef(Promise.resolve());
  const epoch = useRef(new AbortController());
  const enqueue = useCallback(<T>(operation: () => Promise<T>): Promise<T> => {
    const next = writeQueue.current.catch(() => undefined).then(operation);
    writeQueue.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);
  const publish = useCallback(
    (next: ProfileCollection | undefined, undo: ProfileCollection | null) => {
      currentRef.current = next ?? null;
      undoRef.current = undo;
      setProfiles(next);
      setUndoSnapshot(undo ?? undefined);
    },
    [],
  );
  const initialize = useCallback(
    (next: ProfileCollection | undefined) => {
      epoch.current.abort();
      epoch.current = new AbortController();
      const initialization = epoch.current;
      return enqueue(async () => {
        const stored = await repository.load();
        const matches =
          next === undefined
            ? stored.state !== 'ready'
            : stored.state === 'ready' && canonicalize(stored.collection) === canonicalize(next);
        if (initialization.signal.aborted || !matches)
          return { status: 'aborted' as const, reason: 'stale' as const };
        publish(next, null);
        return { status: 'initialized' as const };
      });
    },
    [enqueue, publish, repository],
  );
  const write = useCallback(
    async (
      update: CollectionUpdate,
      rememberForUndo: boolean,
      options: ProfileWriteOptions,
    ): Promise<ProfileWriteResult> => {
      const current = currentRef.current;
      if (!current) throw new Error('profile_collection_not_initialized');
      if (options.guard && (options.guard.signal.aborted || !options.guard.isCurrent()))
        return { status: 'aborted', reason: 'stale' };
      const next = typeof update === 'function' ? update(current) : update;
      const outcome = await repository.replace(next, options);
      if (outcome.status === 'committed') publish(next, rememberForUndo ? current : null);
      return outcome;
    },
    [publish, repository],
  );
  const replace = useCallback(
    (update: CollectionUpdate, rememberForUndo = true, options: ProfileWriteOptions = {}) => {
      const guard = options.guard;
      const combined = guard
        ? {
            isCurrent: guard.isCurrent,
            signal: AbortSignal.any([guard.signal, epoch.current.signal]),
          }
        : undefined;
      return enqueue(() =>
        write(update, rememberForUndo, { ...options, ...(combined ? { guard: combined } : {}) }),
      );
    },
    [enqueue, write],
  );
  const updateActive = useCallback(
    (update: (profile: LocalProfile) => LocalProfile, guard?: ProfileWriteGuard) =>
      replace(
        (collection) => ({
          ...collection,
          profiles: collection.profiles.map((profile) =>
            profile.profileId === collection.activeProfileId ? update(profile) : profile,
          ),
        }),
        true,
        guard ? { guard } : {},
      ),
    [replace],
  );
  const importCollection = useCallback(
    (next: ProfileCollection, guard: ProfileWriteGuard) =>
      replace(next, false, { guard, backup: true }),
    [replace],
  );
  const undo = useCallback(
    () =>
      enqueue(async () => {
        const snapshot = undoRef.current;
        if (!snapshot) return;
        const outcome = await write(snapshot, false, {});
        if (outcome.status !== 'committed') throw new Error('profile_undo_stale');
      }),
    [enqueue, write],
  );
  const clear = useCallback(() => {
    epoch.current.abort();
    epoch.current = new AbortController();
    return enqueue(async () => {
      await repository.clear();
      publish(undefined, null);
    });
  }, [enqueue, publish, repository]);
  return {
    profiles,
    undoSnapshot,
    initialize,
    replace,
    updateActive,
    importCollection,
    undo,
    clear,
  };
}
