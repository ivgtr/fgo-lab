import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  activeProfile,
  addCraftEssenceCopy,
  addSupportServant,
  addSupportTemplate,
  calculateGrowthLedger,
  createProfileCollection,
  isOwned,
  removeSupportSource,
  removeSupportTemplate,
  updateCraftEssenceCopy,
  updateServantBuild,
  updateServantTarget,
  toggleSupportEffect,
  updateSupportSkill,
  updateSupportTemplate,
} from './index';

const clock = { now: () => new Date('2026-08-24T00:00:00Z') };
const ids = { next: () => '00000000-0000-4000-8000-000000000001' };
const master = masterSnapshotSchema.parse(fixture);
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
        attribute: 'earth' as const,
        rarity: 5,
        atkByLevel: { '1': 1 },
        actorFormGraph: {
          actorId: 'x',
          forms: [
            {
              id: { actorId: 'x', limitCount: 0 },
              name: 'X',
              traits: [],
              skillIds: [],
              passiveIds: [],
              baseNoblePhantasmVariant: null,
            },
          ],
          initialFormIds: [{ actorId: 'x', limitCount: 0 }],
          defaultInitialFormId: { actorId: 'x', limitCount: 0 },
          transitions: [],
        },
        baseNoblePhantasmGroupId: null,
        noblePhantasmVariantGroups: [],
        traits: [],
        predicates: [],
        imageKey: null,
        skills: [],
        passives: [],
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
    const ledger = calculateGrowthLedger(
      servants,
      [{ id: 'm', name: 'M', category: 'skill', sortOrder: 1, imageKey: null }],
      current,
      targets,
    );
    expect(ledger.find((entry) => entry.material.id === 'm')?.amount).toBe(5);
    expect(ledger.find((entry) => entry.material.id === 'system:qp')?.amount).toBe(10);
  });
  it('owns servant current and target transitions without mutating the source profile', () => {
    const source = activeProfile(createProfileCollection('マスター', clock, ids));
    const withBuild = updateServantBuild(
      source,
      'fixture-saber',
      { level: 90, npLevel: 1 },
      clock.now().toISOString(),
    );
    const withTarget = updateServantTarget(
      withBuild,
      'fixture-saber',
      { level: 100 },
      clock.now().toISOString(),
    );
    expect(source.servantBuilds['fixture-saber']).toBeUndefined();
    expect(withTarget.servantBuilds['fixture-saber']).toMatchObject({ level: 90, npLevel: 1 });
    expect(withTarget.servantTargets['fixture-saber']).toMatchObject({ level: 100, ascension: 0 });
  });
  it('clamps a craft essence copy to the selected limit break maximum', () => {
    const source = activeProfile(createProfileCollection('マスター', clock, ids));
    const copyId = '00000000-0000-4000-8000-000000000002';
    const withCopy = addCraftEssenceCopy(source, 'fixture-ce', copyId, clock.now().toISOString());
    const updated = updateCraftEssenceCopy(
      withCopy,
      master.craftEssences[0]!,
      copyId,
      { level: 100, limitBreak: 0 },
      clock.now().toISOString(),
    );
    expect(updated.craftEssences[0]).toMatchObject({ level: 20, limitBreak: 0 });
  });
  it('keeps duplicate support servants independent by source instance', () => {
    const source = activeProfile(createProfileCollection('マスター', clock, ids));
    const templateId = '00000000-0000-4000-8000-000000000003';
    const withTemplate = addSupportTemplate(
      source,
      master.version,
      templateId,
      clock.now().toISOString(),
    );
    const supportServant = {
      ...master.servants[0]!,
      skills: [
        {
          id: 'skill-1',
          slot: 1 as const,
          priority: 0,
          name: '支援スキル',
          detail: '',
          imageKey: null,
          resourceRequirement: null,
          effects: [],
        },
      ],
    };
    const once = addSupportServant(
      withTemplate,
      templateId,
      supportServant,
      'support-instance-1',
      { '1': 8 },
      clock.now().toISOString(),
    );
    const sameInstance = addSupportServant(
      once,
      templateId,
      supportServant,
      'support-instance-1',
      { '1': 8 },
      clock.now().toISOString(),
    );
    const twice = addSupportServant(
      sameInstance,
      templateId,
      supportServant,
      'support-instance-2',
      {},
      clock.now().toISOString(),
    );
    expect(twice.supportTemplates[0]?.composition.sources).toHaveLength(2);
    expect(twice.supportTemplates[0]?.composition.sources).toEqual([
      expect.objectContaining({
        sourceInstanceId: 'support-instance-1',
        skills: [expect.objectContaining({ skillLevel: 8 })],
      }),
      expect.objectContaining({
        sourceInstanceId: 'support-instance-2',
        skills: [expect.objectContaining({ skillLevel: 10 })],
      }),
    ]);

    const renamed = updateSupportTemplate(
      twice,
      templateId,
      { name: '周回支援' },
      clock.now().toISOString(),
    );
    const changedLevel = updateSupportSkill(
      renamed,
      templateId,
      'support-instance-2',
      'skill-1',
      { skillLevel: 7 },
      clock.now().toISOString(),
    );
    const selected = toggleSupportEffect(
      changedLevel,
      templateId,
      {
        sourceInstanceId: 'support-instance-2',
        skillId: 'skill-1',
        effectId: 'attack-up',
        effectOccurrenceId: 'attack-up:0',
      },
      false,
      clock.now().toISOString(),
    );
    const withoutFirst = removeSupportSource(
      selected,
      templateId,
      'support-instance-1',
      clock.now().toISOString(),
    );
    expect(withoutFirst.supportTemplates[0]).toMatchObject({ name: '周回支援' });
    expect(withoutFirst.supportTemplates[0]?.composition.sources).toEqual([
      expect.objectContaining({
        sourceInstanceId: 'support-instance-2',
        skills: [expect.objectContaining({ skillLevel: 7 })],
      }),
    ]);
    expect(withoutFirst.supportTemplates[0]?.composition.effectInclusions).toHaveLength(1);
    const withoutSelectedSource = removeSupportSource(
      withoutFirst,
      templateId,
      'support-instance-2',
      clock.now().toISOString(),
    );
    expect(withoutSelectedSource.supportTemplates[0]?.composition).toEqual({
      sources: [],
      effectInclusions: [],
    });
    expect(removeSupportTemplate(withoutSelectedSource, templateId).supportTemplates).toEqual([]);
  });
});
