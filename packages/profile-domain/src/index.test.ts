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
  updateSupportSource,
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
        hasAttackNp: true,
        npCard: 'buster' as const,
        npTarget: 'all' as const,
        atkByLevel: { '1': 1 },
        npMultipliers: [1, 1, 1, 1, 1] as [number, number, number, number, number],
        attackNpFunctionType: 'damageNp',
        traits: [],
        imageKey: null,
        skills: [],
        passives: [],
        npEffects: [],
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
          slot: 1,
          priority: 0,
          name: '支援スキル',
          detail: '',
          imageKey: null,
          effects: [],
        },
      ],
    };
    const once = addSupportServant(
      withTemplate,
      templateId,
      supportServant,
      'support-instance-1',
      'owned',
      { '1': 8 },
      clock.now().toISOString(),
    );
    const sameInstance = addSupportServant(
      once,
      templateId,
      supportServant,
      'support-instance-1',
      'owned',
      { '1': 8 },
      clock.now().toISOString(),
    );
    const twice = addSupportServant(
      sameInstance,
      templateId,
      supportServant,
      'support-instance-2',
      'friend',
      {},
      clock.now().toISOString(),
    );
    expect(twice.supportTemplates[0]?.effects).toHaveLength(2);
    expect(twice.supportTemplates[0]?.effects).toEqual([
      expect.objectContaining({
        sourceInstanceId: 'support-instance-1',
        ownership: 'owned',
        skillLevel: 8,
      }),
      expect.objectContaining({
        sourceInstanceId: 'support-instance-2',
        ownership: 'friend',
        skillLevel: 10,
      }),
    ]);

    const renamed = updateSupportTemplate(
      twice,
      templateId,
      { name: '周回支援' },
      clock.now().toISOString(),
    );
    const changedOwnership = updateSupportSource(
      renamed,
      templateId,
      'support-instance-2',
      { ownership: 'virtual' },
      clock.now().toISOString(),
    );
    const withoutFirst = removeSupportSource(
      changedOwnership,
      templateId,
      'support-instance-1',
      clock.now().toISOString(),
    );
    expect(withoutFirst.supportTemplates[0]).toMatchObject({ name: '周回支援' });
    expect(withoutFirst.supportTemplates[0]?.effects).toEqual([
      expect.objectContaining({
        sourceInstanceId: 'support-instance-2',
        ownership: 'virtual',
      }),
    ]);
    expect(removeSupportTemplate(withoutFirst, templateId).supportTemplates).toEqual([]);
  });
});
