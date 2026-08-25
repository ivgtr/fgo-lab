import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
  type VersionContext,
} from '@fgo-lab/schema';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const master = masterSnapshotSchema.parse(fixture);
const versions: VersionContext = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
};

describe('scenario calculation facade', () => {
  it('calculates a resolved scenario without a UI selection adapter', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const calculation = calculateScenario(scenario, master, versions);

    expect(calculation.scenario).toEqual(scenario);
    expect(calculation.input.attackerId).toBe('fixture-saber');
    expect(calculation.result.status).toBe('calculated');
    expect(calculation.result.rows).toHaveLength(5);
  });

  it('returns identical NP rows for equivalent resolved and manual inputs', () => {
    const resolvedScenario = createDefaultResolvedScenario(master, undefined);
    const resolved = calculateScenario(resolvedScenario, master, versions);
    const manualScenario: CalculationScenario = {
      ...resolvedScenario,
      mode: 'manual',
      manual: resolved.input,
    };
    const manual = calculateScenario(manualScenario, master, versions);

    expect(manual.result.rows).toEqual(resolved.result.rows);
  });
});
