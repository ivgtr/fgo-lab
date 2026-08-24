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
    let stored: ProfileCollection | undefined;
    const repository: ProfileRepository = {
      load: () =>
        Promise.resolve(
          stored
            ? {
                state: 'ready' as const,
                collection: stored,
                discardedCalculationSnapshots: false,
              }
            : { state: 'empty' as const },
        ),
      replace: async (collection) => {
        await Promise.resolve();
        stored = collection;
      },
    };
    const { result } = renderHook(() => useProfileCollection(repository));
    act(() => result.current.initialize(initial));
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
    expect(stored?.profiles[0]?.name).toBe('更新済み');
    expect(stored?.profiles[0]?.servantBuilds['x']?.npLevel).toBe(1);
  });
});
