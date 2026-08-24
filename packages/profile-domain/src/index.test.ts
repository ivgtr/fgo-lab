import { describe, expect, it } from 'vitest';
import { calculateGrowthLedger, createProfileCollection, isOwned } from './index';

const clock = { now: () => new Date('2026-08-24T00:00:00Z') };
const ids = { next: () => '00000000-0000-4000-8000-000000000001' };
describe('profile domain', () => {
  it('creates a multi-profile-ready collection with one active profile', () =>
    expect(createProfileCollection('マスター', clock, ids).profiles).toHaveLength(1));
  it('defines NP0 as unowned and NP1 as owned', () => {
    expect(isOwned(undefined)).toBe(false);
    expect(
      isOwned({
        servantId: 'x',
        level: 1,
        ascension: 0,
        npLevel: 1,
        fouAtk: 0,
        skills: {},
        appends: {},
        updatedAt: '2026-08-24T00:00:00Z',
      }),
    ).toBe(true);
  });
  it('aggregates material usages without stored inventory subtraction', () => {
    const servants = [
      {
        id: 'x',
        name: 'X',
        classId: 'saber',
        rarity: 5,
        hasAttackNp: true,
        npCard: 'buster' as const,
        npTarget: 'all' as const,
        atkByLevel: { '1': 1 },
        npMultipliers: [1, 1, 1, 1, 1] as [number, number, number, number, number],
        attackNpFunctionType: 'damageNp',
        traits: [],
        imageKey: null,
        skills: [],
        growth: [{ from: 'skill:1:1', to: 'skill:1:2', materialId: 'm', amount: 5, qp: 10 }],
      },
    ];
    const now = '2026-08-24T00:00:00Z';
    const current = {
      x: {
        servantId: 'x',
        level: 1,
        ascension: 0,
        npLevel: 1,
        fouAtk: 0,
        skills: { '1': 1 },
        appends: {},
        updatedAt: now,
      },
    };
    const targets = {
      x: {
        servantId: 'x',
        level: 1,
        ascension: 0,
        fouAtk: 0,
        skills: { '1': 2 },
        appends: {},
        updatedAt: now,
        planned: true,
      },
    };
    expect(
      calculateGrowthLedger(
        servants,
        [{ id: 'm', name: 'M', category: 'skill', sortOrder: 1, imageKey: null }],
        current,
        targets,
      )[0]?.amount,
    ).toBe(5);
  });
});
