import { describe, expect, it } from 'vitest';
import type { RankingRowSummary } from '@fgo-lab/calculation-application';
import { countChangedRankingConditions, filterAndRankRows } from './rankingPresentation';
import { DEFAULT_RANKING_URL_STATE } from './rankingState';

const rows: RankingRowSummary[] = [
  {
    entryId: '1:all',
    servantId: '1',
    name: 'A',
    imageKey: null,
    classId: 'saber',
    rarity: 5,
    npCard: 'buster',
    npTarget: 'all',
    noblePhantasmVariant: {
      actorFormId: { actorId: '1', limitCount: 0 },
      noblePhantasmId: '101',
    },
    attackProfile: {
      id: {
        servantLineageId: '1',
        terminalActorFormProfileId: {
          servantLineageId: '1',
          semantics: {
            skillSlots: [],
            passiveVariantIds: [],
            intrinsicTraits: [],
            baseNoblePhantasmVariantId: '101',
            reachableAttackNoblePhantasmVariantIds: ['101'],
          },
        },
        attackNoblePhantasmVariantId: '101',
      },
      noblePhantasmVariant: {
        actorFormId: { actorId: '1', limitCount: 0 },
        noblePhantasmId: '101',
      },
      targetScope: 'all',
      cardType: 'buster',
      terminalFormLabel: null,
    },
    noblePhantasmName: 'A全体',
    minimum: 80,
    average: 100,
    maximum: 120,
    precision: 'exact',
    appliedEffectCount: 1,
    supportEffectCount: 0,
    supportSourceCount: 0,
    specialAttackApplied: false,
    level: 90,
    npLevel: 1,
    owned: false,
  },
  {
    entryId: '2:single',
    servantId: '2',
    name: 'B',
    imageKey: null,
    classId: 'archer',
    rarity: 4,
    npCard: 'arts',
    npTarget: 'single',
    noblePhantasmVariant: {
      actorFormId: { actorId: '2', limitCount: 0 },
      noblePhantasmId: '201',
    },
    attackProfile: {
      id: {
        servantLineageId: '2',
        terminalActorFormProfileId: {
          servantLineageId: '2',
          semantics: {
            skillSlots: [],
            passiveVariantIds: [],
            intrinsicTraits: [],
            baseNoblePhantasmVariantId: '201',
            reachableAttackNoblePhantasmVariantIds: ['201'],
          },
        },
        attackNoblePhantasmVariantId: '201',
      },
      noblePhantasmVariant: {
        actorFormId: { actorId: '2', limitCount: 0 },
        noblePhantasmId: '201',
      },
      targetScope: 'single',
      cardType: 'arts',
      terminalFormLabel: null,
    },
    noblePhantasmName: 'B単体',
    minimum: 90,
    average: 95,
    maximum: 130,
    precision: 'exact',
    appliedEffectCount: 1,
    supportEffectCount: 0,
    supportSourceCount: 0,
    specialAttackApplied: false,
    level: 80,
    npLevel: 1,
    owned: true,
  },
];

describe('ranking presentation', () => {
  it('changes sort and filters locally without changing calculation rows', () => {
    expect(filterAndRankRows(rows, DEFAULT_RANKING_URL_STATE.filters, 'average')).toMatchObject([
      { servantId: '1', rank: 1, primaryDamage: 100 },
      { servantId: '2', rank: 2, primaryDamage: 95 },
    ]);
    expect(
      filterAndRankRows(rows, { ...DEFAULT_RANKING_URL_STATE.filters, card: 'arts' }, 'maximum'),
    ).toMatchObject([{ servantId: '2', rank: 1, primaryDamage: 130 }]);
    expect(rows[0]!.average).toBe(100);
  });

  it('counts calculation condition changes separately from display filters', () => {
    expect(countChangedRankingConditions(DEFAULT_RANKING_URL_STATE.conditions)).toBe(0);
    expect(
      countChangedRankingConditions({
        ...DEFAULT_RANKING_URL_STATE.conditions,
        npLevel: 5,
        specialAttack: 'active',
      }),
    ).toBe(2);
  });
});
