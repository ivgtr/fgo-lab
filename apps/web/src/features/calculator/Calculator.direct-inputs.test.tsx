// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  calculateScenario,
  createCalculatorPortableRequest,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  type CalculationScenario,
} from '@fgo-lab/schema';
import { Calculator } from './Calculator';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(fixture);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
const requestVersions = {
  masterDataVersion: versions.masterDataVersion,
  engineVersion: versions.engineVersion,
};
const resolvedScenario = createDefaultResolvedScenario(master, undefined);
const resolved = requireExecutableCalculation(
  calculateScenario(resolvedScenario, master, versions),
);

function renderCalculator(scenario: CalculationScenario, onScenarioChange = vi.fn()) {
  const calculation = requireExecutableCalculation(calculateScenario(scenario, master, versions));
  render(
    <Calculator
      master={master}
      resolvedInput={calculation.input}
      scenarioInput={calculation.input}
      resolvedEffects={calculation.effects}
      effectControls={calculation.effectControls}
      effectWarnings={calculation.effectWarnings}
      effectInputs={calculation.effectInputs}
      activationRequirements={calculation.activationRequirements}
      result={calculation.result}
      request={createCalculatorPortableRequest(scenario, requestVersions)}
      scenario={scenario}
      servants={master.servants}
      builds={{}}
      craftEssenceCopies={[]}
      craftEssences={master.craftEssences}
      supportTemplates={[]}
      history={[]}
      selectedSupport={undefined}
      onScenarioChange={onScenarioChange}
      onSupportSelect={vi.fn()}
      onSupportSave={vi.fn()}
      onFinalize={vi.fn()}
      onHistorySelect={vi.fn()}
      onResetPortableRequest={vi.fn()}
    />,
  );
  return onScenarioChange;
}

describe('calculator direct-input component boundary', () => {
  it('renders direct final-input controls and dispatches canonical reset values', () => {
    const manual = {
      mode: 'manual' as const,
      manual: {
        ...resolved.input,
        attackerAtk: resolved.input.attackerAtk + 100,
        fouAtk: 2_000,
        craftEssenceAtk: 500,
        classAttackRate: 1.2,
        classAffinity: 1.7,
        attributeAffinity: 0.9,
      },
    };
    const onScenarioChange = renderCalculator(
      manual,
      vi.fn(() => Promise.resolve()),
    );

    for (const label of [
      '基礎ATK',
      'ATKフォウ',
      '礼装ATK',
      'クラス攻撃補正',
      '攻撃バフ（%）',
      '敵防御力（%）',
      'カード耐性（%）',
      '宝具耐性（%）',
      'イベント特攻（%）',
      '固定ダメージ軽減',
    ])
      expect(screen.getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}`))).toBeTruthy();
    expect(screen.getAllByLabelText(/^クラス相性/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/^属性相性/)).toHaveLength(2);
    expect(screen.getByLabelText(/特攻宝具倍率（%）/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'ATK・相性を既定値へ戻す' }));
    expect(onScenarioChange).toHaveBeenCalledWith({
      mode: 'manual',
      manual: {
        ...manual.manual,
        attackerAtk: resolved.input.attackerAtk,
        fouAtk: 1_000,
        craftEssenceAtk: 0,
        classAttackRate: 1,
        classAffinity: 1,
        attributeAffinity: 1,
      },
    });
  });
});
