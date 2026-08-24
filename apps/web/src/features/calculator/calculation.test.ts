import { describe, expect, it } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationShareSnapshot,
  type VersionContext,
} from '@fgo-lab/schema';
import {
  calculateResolvedDamage,
  completeCalculationSelection,
  createDefaultCalcInput,
  selectionFromShare,
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
    const calculation = calculateResolvedDamage(input, selection, undefined, master, versions);
    expect(calculation.input.attackerId).toBe('fixture-saber');
    expect(calculation.result.results).toHaveLength(5);
    expect(calculation.result.precision).toBe('exact');
  });

  it('normalizes shared composition to the only supported local selection shape', () => {
    const input = createDefaultCalcInput(master, undefined);
    const result = calculateResolvedDamage(
      input,
      { attackerSource: 'master', craftEssence: null },
      undefined,
      master,
      versions,
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
      craftEssence: {
        source: 'master',
        craftEssenceId: 'fixture-ce',
        copyId: null,
        level: 1,
        limitBreak: 0,
      },
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
      { attackerSource: 'master', craftEssence: null },
      undefined,
      specialMaster,
      { ...versions, masterDataVersion: specialMaster.version },
    );

    expect(calculation.input.npSpecialMultipliers).toEqual([1.5, 2, 2.25, 2.375, 2.5]);
    expect(calculation.result.results.map((row) => row.average)).toEqual([
      68275.355, 91033.975, 102413.275, 108102.92, 113792.6,
    ]);
  });
});
