import { describe, expect, it } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import {
  masterSnapshotSchema,
  type AttackNoblePhantasmVariant,
  type NpDamageSpec,
  type ServantMaster,
} from '@fgo-lab/master-data';
import {
  clearServantFilterDetails,
  countActiveServantFilterGroups,
  createEmptyServantFilters,
  filterServants,
} from './servantFilters';

const saber = masterSnapshotSchema.parse(fixture).servants[0] as ServantMaster;
const artsArcher: ServantMaster = {
  ...saber,
  id: 'arts-archer',
  name: '検証用アーチャー',
  classId: 'archer',
  rarity: 4,
  actorFormGraph: {
    ...saber.actorFormGraph,
    actorId: 'arts-archer',
    forms: saber.actorFormGraph.forms.map((form) => ({
      ...form,
      id: { actorId: 'arts-archer', limitCount: form.id.limitCount },
      baseNoblePhantasmVariant: form.baseNoblePhantasmVariant
        ? {
            ...form.baseNoblePhantasmVariant,
            actorFormId: { actorId: 'arts-archer', limitCount: form.id.limitCount },
          }
        : null,
    })),
    initialFormIds: saber.actorFormGraph.initialFormIds.map((form) => ({
      actorId: 'arts-archer',
      limitCount: form.limitCount,
    })),
    defaultInitialFormId: {
      actorId: 'arts-archer',
      limitCount: saber.actorFormGraph.defaultInitialFormId.limitCount,
    },
    transitions: [],
  },
  noblePhantasmVariantGroups: saber.noblePhantasmVariantGroups.map((group) => ({
    ...group,
    baseVariant: {
      actorFormId: { actorId: 'arts-archer', limitCount: 0 },
      noblePhantasmId: 'fixture-np',
    },
    variants: group.variants.map((np) => {
      if (np.kind !== 'attack') throw new TypeError('fixture_attack_np_required');
      return {
        ...np,
        ref: {
          actorFormId: { actorId: 'arts-archer', limitCount: np.ref.actorFormId.limitCount },
          noblePhantasmId: np.ref.noblePhantasmId,
        },
        card: 'arts',
        targetScope: 'single',
        damage: np.damage.map((damage) => ({ ...damage, target: 'single' })),
      };
    }),
  })),
};
const supportCaster: ServantMaster = {
  ...saber,
  id: 'support-caster',
  name: '非攻撃キャスター',
  classId: 'caster',
  actorFormGraph: {
    actorId: 'support-caster',
    forms: [
      {
        id: { actorId: 'support-caster', limitCount: 0 },
        name: '非攻撃キャスター',
        traits: [],
        skillIds: [],
        passiveIds: [],
        baseNoblePhantasmVariant: null,
      },
    ],
    initialFormIds: [{ actorId: 'support-caster', limitCount: 0 }],
    defaultInitialFormId: { actorId: 'support-caster', limitCount: 0 },
    transitions: [],
  },
  baseNoblePhantasmGroupId: null,
  noblePhantasmVariantGroups: [],
};
const servants = [saber, artsArcher, supportCaster];

describe('servant filters', () => {
  it('combines filter groups with AND and values within a group with OR', () => {
    const filters = {
      ...createEmptyServantFilters(),
      rarities: new Set([4, 5]),
      npCards: new Set<AttackNoblePhantasmVariant['card']>(['arts']),
    };
    expect(filterServants(servants, filters, '')).toEqual([artsArcher]);
  });

  it('matches names independently from structured filters', () => {
    expect(filterServants(servants, createEmptyServantFilters(), 'アーチャー')).toEqual([
      artsArcher,
    ]);
  });

  it('preserves the quick class filter when clearing detailed conditions', () => {
    const filters = {
      ...createEmptyServantFilters(),
      classId: 'saber',
      rarities: new Set([5]),
      npTargets: new Set<NpDamageSpec['target']>(['all']),
    };
    expect(countActiveServantFilterGroups(filters)).toBe(3);
    expect(clearServantFilterDetails(filters)).toEqual({
      ...createEmptyServantFilters(),
      classId: 'saber',
    });
  });
});
