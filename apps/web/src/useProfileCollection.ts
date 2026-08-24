import { useCallback, useRef, useState } from 'react';
import type { ProfileRepository } from '@fgo-lab/profile-domain';
import type { LocalProfile, ProfileCollection } from '@fgo-lab/schema';

type CollectionUpdate = ProfileCollection | ((current: ProfileCollection) => ProfileCollection);

export function useProfileCollection(repository: ProfileRepository) {
  const [profiles, setProfiles] = useState<ProfileCollection>();
  const [undoSnapshot, setUndoSnapshot] = useState<ProfileCollection>();
  const currentRef = useRef<ProfileCollection | null>(null);
  const undoRef = useRef<ProfileCollection | null>(null);
  const writeQueue = useRef(Promise.resolve());

  const initialize = useCallback((next: ProfileCollection | undefined) => {
    currentRef.current = next ?? null;
    undoRef.current = null;
    setProfiles(next);
    setUndoSnapshot(undefined);
  }, []);

  const replace = useCallback(
    (update: CollectionUpdate, rememberForUndo = true): Promise<void> => {
      const operation = writeQueue.current
        .catch(() => undefined)
        .then(async () => {
          const current = currentRef.current;
          if (!current) throw new Error('profile_collection_not_initialized');
          const next = typeof update === 'function' ? update(current) : update;
          await repository.replace(next);
          if (rememberForUndo) {
            undoRef.current = current;
            setUndoSnapshot(current);
          }
          currentRef.current = next;
          setProfiles(next);
        });
      writeQueue.current = operation;
      return operation;
    },
    [repository],
  );

  const updateActive = useCallback(
    (update: (profile: LocalProfile) => LocalProfile): Promise<void> =>
      replace((collection) => ({
        ...collection,
        profiles: collection.profiles.map((profile) =>
          profile.profileId === collection.activeProfileId ? update(profile) : profile,
        ),
      })),
    [replace],
  );

  const undo = useCallback(async (): Promise<void> => {
    const snapshot = undoRef.current;
    if (!snapshot) return;
    await replace(snapshot, false);
    undoRef.current = null;
    setUndoSnapshot(undefined);
  }, [replace]);

  return { profiles, undoSnapshot, initialize, replace, updateActive, undo };
}
