import { describe, expect, it } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from '@fgo-lab/calculation-application';
import { getPrimaryNpDamage, masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { createCalculatorViewModel } from './calculatorViewModel';

const master = masterSnapshotSchema.parse(fixture);
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

describe('calculator view model', () => {
  it('derives effect groups and summaries without interpreting condition semantics', () => {
    const scenario = createDefaultResolvedScenario(master, undefined);
    const calculation = calculateScenario(scenario, master, {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP',
      masterDataLocale: 'ja-JP',
      masterDataVersion: master.version,
    });
    const attacker = master.servants.find(
      (servant) => servant.id === calculation.input.attackerId,
    )!;

    const view = createCalculatorViewModel({
      input: calculation.input,
      effects: calculation.effects,
      servants: master.servants,
      attackerDamage: getPrimaryNpDamage(attacker),
      selectedCraftEssence: undefined,
      craftEssenceSelection: null,
      selectedSupport: undefined,
      supportComposition: undefined,
    });

    expect(view.supportEffects).toEqual([]);
    expect(view.ownEffects).toHaveLength(calculation.effects.length);
    expect(view.craftEssenceSummary).toBe('礼装なし');
    expect(view.supportSummary).toBe('支援なし');
    expect(view.targetSummary).toContain('クラス有利（2.00倍）');
  });
});
