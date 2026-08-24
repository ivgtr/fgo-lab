import { describe, expect, it } from 'vitest';
import fixture from '../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import type { CalculationShareSnapshot, VersionContext } from '@fgo-lab/schema';
import {
  calculateResolvedDamage,
  completeCalculationSelection,
  createDefaultCalcInput,
  selectionFromShare,
} from './calculation';

const master = masterSnapshotSchema.parse(fixture);
const versions: VersionContext = {
  schemaVersion: 1,
  masterDataVersion: master.version,
  engineVersion: '1.2.0',
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
      schemaVersion: 1,
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
});
