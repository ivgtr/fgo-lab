import { describe, expect, it } from 'vitest';
import {
  activeServantSkillSchema,
  masterSnapshotSchema,
  naturalServantLevel,
} from '@fgo-lab/master-data';
import fixture from '../../test-fixtures/master/fixture.json';
import { productionSavedConditionKey, productionSavedConditions } from './productionClosureAudit';
import { createProductionSavedProfile } from './productionSavedAudit';
import { rankingStaticSemanticsInventory } from './rankingEligibilityAudit';

const base = masterSnapshotSchema.parse(fixture);
const skills = ([1, 2, 3] as const).map((slot) =>
  activeServantSkillSchema.parse({
    id: `saved-${String(slot)}`,
    name: `saved-${String(slot)}`,
    slot,
    priority: slot,
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects: [],
  }),
);
const servant = base.servants[0]!;
const master = masterSnapshotSchema.parse({
  ...base,
  servants: [
    {
      ...servant,
      skills,
      actorFormGraph: {
        ...servant.actorFormGraph,
        forms: servant.actorFormGraph.forms.map((form) => ({
          ...form,
          skillIds: skills.map(({ id }) => id),
        })),
      },
    },
  ],
});

describe('separate saved production basis', () => {
  it('uses exact owned saved conditions and rejects an altered identity', () => {
    const s0 = productionSavedConditions('S0');
    const s1 = productionSavedConditions('S1');
    expect(s0).toHaveLength(4);
    expect(s1).toHaveLength(8);
    expect(new Set(s0.map((condition) => productionSavedConditionKey('S0', condition))).size).toBe(
      4,
    );
    expect(new Set(s1.map((condition) => productionSavedConditionKey('S1', condition))).size).toBe(
      8,
    );
    expect(
      s0.every(
        ({ population, growthBasis, initialOvercharge }) =>
          population === 'owned' && growthBasis === 'saved' && initialOvercharge === 1,
      ),
    ).toBe(true);
    expect(() =>
      productionSavedConditionKey('S1', { ...s1[0]!, classAffinity: 'favorable' }),
    ).toThrow('production_saved_condition_not_canonical');
  });

  it('binds every canonical skill slot to the declared saved values', () => {
    const s0 = createProductionSavedProfile(master, 'S0').servantBuilds[servant.id]!;
    const s1 = createProductionSavedProfile(master, 'S1').servantBuilds[servant.id]!;
    expect(s0).toMatchObject({
      servantId: servant.id,
      level: naturalServantLevel(servant.rarity),
      ascension: 4,
      npLevel: 1,
      fouAtk: 1000,
      skills: { '1': 10, '2': 10, '3': 10 },
      appends: {},
    });
    expect(s1).toMatchObject({
      servantId: servant.id,
      level: 90,
      ascension: 4,
      npLevel: 2,
      fouAtk: 1234,
      skills: { '1': 1, '2': 5, '3': 9 },
      appends: {},
    });
  });

  it('builds the saved static inventory from saved skill levels', () => {
    const common = rankingStaticSemanticsInventory(master);
    const saved = rankingStaticSemanticsInventory(
      master,
      createProductionSavedProfile(master, 'S1'),
      productionSavedConditions('S1')[0],
    );
    expect(saved.digest).not.toBe(common.digest);
  });
});
