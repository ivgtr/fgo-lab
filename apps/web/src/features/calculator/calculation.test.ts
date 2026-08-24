import { describe, expect, it } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalcInput,
  type CalculationShareSnapshot,
  type VersionContext,
} from '@fgo-lab/schema';
import {
  calculateResolvedDamage,
  completeCalculationSelection,
  createDefaultCalcInput,
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
    const input = createDefaultCalcInput(master, undefined);
    const selection = completeCalculationSelection(undefined, master.servants[0], undefined);
    const calculation = calculateResolvedDamage(input, selection, undefined, master, versions, {
      releaseValidated: true,
    });
    expect(calculation.input.attackerId).toBe('fixture-saber');
    expect(calculation.result.results).toHaveLength(5);
    expect(calculation.result.precision).toBe('exact');
  });

  it('normalizes shared composition to the only supported local selection shape', () => {
    const input = createDefaultCalcInput(master, undefined);
    const result = calculateResolvedDamage(
      input,
      { attackerSource: 'master', effectMode: 'resolved', craftEssence: null },
      undefined,
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
      ...createDefaultCalcInput(master, undefined),
      cardBuff: 0.32,
      npDamageBuff: 0.8,
      flatDamage: 0,
    };
    const calculation = calculateResolvedDamage(
      input,
      { attackerSource: 'master', effectMode: 'manual', craftEssence: null },
      undefined,
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
          attackNpFunctionType: 'damageNpIndividual',
          npMultipliers: [1200, 1200, 1200, 1200, 1200],
          npSpecialAttack: {
            targetCondition: { anyOf: ['genderMale'], noneOf: [] },
            multipliersByNpLevelAndOvercharge: [
              [1.5, 1.5, 1.5, 1.5, 1.5],
              [2, 2, 2, 2, 2],
              [2.25, 2.25, 2.25, 2.25, 2.25],
              [2.375, 2.375, 2.375, 2.375, 2.375],
              [2.5, 2.5, 2.5, 2.5, 2.5],
            ],
          },
        },
      ],
    });
    const input = {
      ...createDefaultCalcInput(specialMaster, undefined),
      classAffinity: 1,
      target: { classId: 'neutral', attribute: 'unknown' as const, traits: ['genderMale'] },
    };
    const calculation = calculateResolvedDamage(
      input,
      { attackerSource: 'master', effectMode: 'resolved', craftEssence: null },
      undefined,
      specialMaster,
      { ...versions, masterDataVersion: specialMaster.version },
      { releaseValidated: true },
    );

    expect(calculation.input.npSpecialMultipliers).toEqual([1.5, 2, 2.25, 2.375, 2.5]);
    expect(calculation.result.results.map((row) => row.average)).toEqual([
      68275.355, 91033.975, 102413.275, 108102.92, 113792.6,
    ]);
  });

  it('marks every non-release calculation through the same result path', () => {
    const input = createDefaultCalcInput(master, undefined);
    const calculation = calculateResolvedDamage(
      input,
      completeCalculationSelection(undefined, master.servants[0], undefined),
      undefined,
      master,
      versions,
      { releaseValidated: false },
    );

    expect(calculation.result.precision).toBe('approximate');
    expect(calculation.result.warnings).toContain('diagnostic_fixture_not_release_validated');
  });

  it('changes every attacker-owned damage input in one state transition', () => {
    const input = { ...createDefaultCalcInput(master, undefined), attackerAtk: 999 };
    const servant = {
      ...master.servants[0]!,
      id: 'next-attacker',
      npCard: 'quick' as const,
      npMultipliers: [600, 800, 900, 950, 1000] as CalcInput['npMultipliers'],
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
      ...createDefaultCalcInput(master, undefined),
      attackBuff: 0.5,
      cardBuff: 0.5,
      npSpecialMultipliers: [2, 2, 2, 2, 2] as CalcInput['npSpecialMultipliers'],
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
