import { describe, expect, it } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type DamageKernelInput,
  type CalculationShareSnapshot,
  type SupportTemplate,
  type VersionContext,
} from '@fgo-lab/schema';
import {
  calculateResolvedDamage,
  completeCalculationSelection,
  createDefaultDamageKernelInput,
  selectCalculationAttacker,
  selectionFromShare,
  setCalculationEffectMode,
} from './calculation';

const master = masterSnapshotSchema.parse(fixture);
const versions: VersionContext = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
};

describe('calculation application logic', () => {
  it('creates and resolves a calculation without browser or React state', () => {
    const input = createDefaultDamageKernelInput(master, undefined);
    const selection = completeCalculationSelection(undefined, master.servants[0], undefined);
    const calculation = calculateResolvedDamage(input, selection, master, versions, {
      releaseValidated: true,
    });
    expect(calculation.input.attackerId).toBe('fixture-saber');
    expect(calculation.result.rows).toHaveLength(5);
    if (calculation.result.status !== 'calculated') throw new Error('expected calculated result');
    expect(calculation.result.precision).toBe('exact');
  });

  it('normalizes shared composition to the only supported local selection shape', () => {
    const input = createDefaultDamageKernelInput(master, undefined);
    const result = calculateResolvedDamage(
      input,
      { attackerSource: 'master', effectMode: 'resolved', craftEssence: null },
      master,
      versions,
      { releaseValidated: true },
    ).result;
    const shared = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-24T00:00:00.000Z',
      input,
      result,
      composition: {
        craftEssence: {
          craftEssenceId: 'fixture-ce',
          level: 1,
          limitBreak: 0,
        },
      },
    } satisfies CalculationShareSnapshot;
    expect(selectionFromShare(shared)).toEqual({
      attackerSource: 'master',
      effectMode: 'manual',
      craftEssence: {
        source: 'master',
        craftEssenceId: 'fixture-ce',
        copyId: null,
        level: 1,
        limitBreak: 0,
      },
    });
  });

  it('uses manual values as the final calculation input without effect resolution', () => {
    const input = {
      ...createDefaultDamageKernelInput(master, undefined),
      cardBuff: 0.32,
      npDamageBuff: 0.8,
      flatDamage: 0,
    };
    const calculation = calculateResolvedDamage(
      input,
      { attackerSource: 'master', effectMode: 'manual', craftEssence: null },
      master,
      versions,
      { releaseValidated: true },
    );
    expect(calculation.input).toEqual(input);
    expect(calculation.effects).toEqual([]);
    expect(calculation.result.trace).toContainEqual({
      step: 'input-mode',
      detail: 'manual_final_values',
    });
  });

  it('resolves level-dependent special NP multipliers before evaluating all five rows', () => {
    const specialMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        {
          ...fixture.servants[0],
          noblePhantasms: fixture.servants[0]!.noblePhantasms.map((np) => ({
            ...np,
            damage: np.damage.map((damage) => ({
              ...damage,
              kind: 'trait',
              rawFunctionType: 'damageNpIndividual',
              parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                row.map((parameter, index) => ({
                  ...parameter,
                  valuePermille: 12_000,
                  correctionPermille: [1500, 2000, 2250, 2375, 2500][index],
                  targetId: 109,
                  targetTrait: { id: 109, name: 'genderMale' },
                })),
              ),
            })),
          })),
        },
      ],
    });
    const input = {
      ...createDefaultDamageKernelInput(specialMaster, undefined),
      classAffinity: 1,
      target: { classId: 'neutral', attribute: 'unknown' as const, traits: ['genderMale'] },
    };
    const calculation = calculateResolvedDamage(
      input,
      { attackerSource: 'master', effectMode: 'resolved', craftEssence: null },
      specialMaster,
      { ...versions, masterDataVersion: specialMaster.version },
      { releaseValidated: true },
    );

    expect(calculation.input.npSpecialMultipliers).toEqual([1.5, 2, 2.25, 2.375, 2.5]);
    expect(calculation.result.rows.map((row) => row.average)).toEqual([
      68275.355, 91033.975, 102413.275, 108102.92, 113792.6,
    ]);
  });

  it('applies an NP damage buff rate after all additive NP damage buffs', () => {
    const supportId = 'fixture-oberon';
    const boostMaster = masterSnapshotSchema.parse({
      ...fixture,
      servants: [
        fixture.servants[0],
        {
          ...fixture.servants[0],
          id: supportId,
          name: '検証用オベロン',
          skills: [
            {
              id: 'boost-skill',
              slot: 3,
              priority: 1,
              name: '夢のおわり EX',
              detail: '',
              imageKey: null,
              effects: [
                {
                  id: 'boost-effect',
                  type: 'addStateShort',
                  target: 'ptOne',
                  label: '宝具威力アップブースト',
                  values: Array(10).fill(1000),
                  buffTypes: ['buffRate'],
                  buffRateTargets: ['buffNpDamageUp'],
                  cardTypes: [],
                },
              ],
            },
          ],
        },
      ],
    });
    const input = {
      ...createDefaultDamageKernelInput(boostMaster, undefined),
      npDamageBuff: 0.3,
    };
    const support = {
      templateId: '00000000-0000-4000-8000-000000000001',
      name: 'オベロン支援',
      masterDataVersion: boostMaster.version,
      composition: {
        sources: [
          {
            sourceInstanceId: 'oberon-1',
            servantId: supportId,
            skills: [{ skillId: 'boost-skill', skillLevel: 10 }],
          },
        ],
        selectedEffects: [
          {
            sourceInstanceId: 'oberon-1',
            skillId: 'boost-skill',
            effectId: 'boost-effect',
          },
        ],
      },
      updatedAt: '2026-08-25T00:00:00.000Z',
      lastUsedAt: null,
    } satisfies SupportTemplate;

    const calculation = calculateResolvedDamage(
      input,
      {
        attackerSource: 'master',
        effectMode: 'resolved',
        craftEssence: null,
        support: { sourceTemplateId: support.templateId, composition: support.composition },
      },
      boostMaster,
      { ...versions, masterDataVersion: boostMaster.version },
      { releaseValidated: true },
    );

    expect(calculation.input.npDamageBuff).toBeCloseTo(0.6);
    if (calculation.result.status !== 'calculated') throw new Error('expected calculated result');
    expect(calculation.result.precision).toBe('exact');
    expect(calculation.result.issues.map((issue) => issue.code)).not.toContain(
      'support_effect_not_resolved:fixture-oberon:boost-skill:boost-effect',
    );
  });

  it('marks every non-release calculation through the same result path', () => {
    const input = createDefaultDamageKernelInput(master, undefined);
    const calculation = calculateResolvedDamage(
      input,
      completeCalculationSelection(undefined, master.servants[0], undefined),
      master,
      versions,
      { releaseValidated: false },
    );

    if (calculation.result.status !== 'calculated') throw new Error('expected calculated result');
    expect(calculation.result.precision).toBe('approximate');
    expect(calculation.result.issues.map((issue) => issue.code)).toContain(
      'diagnostic_fixture_not_release_validated',
    );
  });

  it('changes every attacker-owned damage input in one state transition', () => {
    const input = { ...createDefaultDamageKernelInput(master, undefined), attackerAtk: 999 };
    const servant = {
      ...master.servants[0]!,
      id: 'next-attacker',
      noblePhantasms: master.servants[0]!.noblePhantasms.map((np) => ({
        ...np,
        card: 'quick' as const,
        damage: np.damage.map((damage) => ({
          ...damage,
          parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
            row.map((parameter, index) => ({
              ...parameter,
              valuePermille: [6000, 8000, 9000, 9500, 10_000][index],
            })),
          ) as typeof damage.parametersByOvercharge,
        })),
      })),
      atkByLevel: { '90': 12_345 },
    };
    const next = selectCalculationAttacker(
      input,
      { attackerSource: 'master', effectMode: 'resolved', craftEssence: null },
      servant,
      'master',
      undefined,
    );

    expect(next.input).toMatchObject({
      attackerId: 'next-attacker',
      attackerLevel: 90,
      attackerAtk: 12_345,
      fouAtk: 1000,
      npLevel: 1,
      cardType: 'quick',
      npMultipliers: [600, 800, 900, 950, 1000],
    });
    expect(next.selection.attackerSkills).toHaveLength(servant.skills.slice(0, 3).length);
  });

  it('clears direct damage modifiers when automatic resolution becomes their owner', () => {
    const input = {
      ...createDefaultDamageKernelInput(master, undefined),
      attackBuff: 0.5,
      cardBuff: 0.5,
      npSpecialMultipliers: [2, 2, 2, 2, 2] as DamageKernelInput['npSpecialMultipliers'],
      flatDamage: 500,
    };
    const next = setCalculationEffectMode(
      input,
      { attackerSource: 'master', effectMode: 'manual', craftEssence: null },
      'resolved',
    );

    expect(next.input).toMatchObject({
      attackBuff: 0,
      cardBuff: 0,
      npSpecialMultipliers: [1, 1, 1, 1, 1],
      flatDamage: 0,
    });
    expect(next.selection.effectMode).toBe('resolved');
  });
});
