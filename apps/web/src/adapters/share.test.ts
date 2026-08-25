import { describe, expect, it } from 'vitest';
import {
  createShareFragment,
  importBackup,
  MAX_SHARE_FRAGMENT_LENGTH,
  readShareFragment,
  RESULT_CARD_EXPORT_WIDTH,
  validateCalculationShareSnapshot,
} from './share';
import fixture from '../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { calculateScenario, createDefaultResolvedScenario } from '@fgo-lab/calculation-application';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';

const master = masterSnapshotSchema.parse(fixture);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;

describe('portable input limits', () => {
  it('rejects oversized backups before schema use', () =>
    expect(() => importBackup('x'.repeat(101), 100)).toThrow('backup_too_large'));
  it('keeps a conservative URL limit', () => expect(MAX_SHARE_FRAGMENT_LENGTH).toBe(8192));
  it('keeps result image layout width independent from the viewport', () =>
    expect(RESULT_CARD_EXPORT_WIDTH).toBe(560));
  it('rejects oversized shared fragments before decoding', () =>
    expect(() => readShareFragment(`#share=${'x'.repeat(MAX_SHARE_FRAGMENT_LENGTH)}`)).toThrow(
      'share_too_large',
    ));

  it('round-trips only a reproducible current-master calculation', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      scenario,
      result: calculateScenario(scenario, master, versions).result,
    } as const;
    const restored = readShareFragment(`#${createShareFragment(snapshot)}`);

    expect(restored && validateCalculationShareSnapshot(restored, master)).toEqual(snapshot);
  });

  it('rejects a shared result that does not match its scenario', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const result = calculateScenario(scenario, master, versions).result;
    if (result.status !== 'calculated') throw new Error('expected calculated fixture');
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      scenario,
      result: {
        ...result,
        rows: [
          { ...result.rows[0], minimum: result.rows[0].minimum + 1 },
          ...result.rows.slice(1),
        ] as typeof result.rows,
      },
    } as const;

    expect(() => validateCalculationShareSnapshot(snapshot, master)).toThrow(
      'share_result_mismatch',
    );
  });

  it('rejects a share created from a different master version', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const result = calculateScenario(scenario, master, versions).result;
    const snapshot = {
      kind: 'fgo-lab-calculation-share',
      schemaVersion: SCHEMA_VERSION,
      sharedAt: '2026-08-25T00:00:00.000Z',
      scenario,
      result: {
        ...result,
        versions: { ...result.versions, masterDataVersion: 'different-master' },
      },
    } as const;

    expect(() => validateCalculationShareSnapshot(snapshot, master)).toThrow(
      'share_master_version_mismatch',
    );
  });
});
