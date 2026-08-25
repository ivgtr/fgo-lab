import { describe, expect, it } from 'vitest';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import {
  masterSnapshotSchema,
  type NoblePhantasmMaster,
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
  noblePhantasms: saber.noblePhantasms.map((np) => ({
    ...np,
    card: 'arts',
    damage: np.damage.map((damage) => ({ ...damage, target: 'single' })),
  })),
};
const supportCaster: ServantMaster = {
  ...saber,
  id: 'support-caster',
  name: '非攻撃キャスター',
  classId: 'caster',
  noblePhantasms: [],
};
const servants = [saber, artsArcher, supportCaster];

describe('servant filters', () => {
  it('combines filter groups with AND and values within a group with OR', () => {
    const filters = {
      ...createEmptyServantFilters(),
      rarities: new Set([4, 5]),
      npCards: new Set<NoblePhantasmMaster['card']>(['arts']),
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
