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
  type CalculationResult,
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
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: versions.masterDataVersion,
  engineVersion: versions.engineVersion,
};
const resolvedScenario = createDefaultResolvedScenario(master, undefined);
const resolved = requireExecutableCalculation(
  calculateScenario(resolvedScenario, master, versions),
);

it('edits enemy defense in resolved mode without changing effect decisions', () => {
  const onScenarioChange = vi.fn();
  renderCalculator(resolvedScenario, onScenarioChange);
  fireEvent.change(screen.getAllByLabelText(/^敵防御力（%）/)[0]!, { target: { value: '30' } });
  expect(onScenarioChange).toHaveBeenCalledWith({
    ...resolvedScenario,
    enemyDefenseBuff: 0.3,
  });
});

it('keeps repairable enemy defense text without committing a numeric fallback', () => {
  const onScenarioChange = vi.fn();
  renderCalculator(resolvedScenario, onScenarioChange);
  const input = screen.getAllByLabelText(/^敵防御力（%）/)[0] as HTMLInputElement;
  fireEvent.change(input, { target: { value: '' } });
  expect(input.value).toBe('');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  fireEvent.change(input, { target: { value: '600' } });
  expect(input.value).toBe('600');
  expect(onScenarioChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '-25.5' } });
  expect(onScenarioChange).toHaveBeenCalledWith({ ...resolvedScenario, enemyDefenseBuff: -0.255 });
});

it('sends a domain-keyed initial battle point and clears legacy phase intent', () => {
  const domain = {
    id: 'fixture-point-domain',
    phaseScale: 'point' as const,
    phases: [
      { phase: 0, threshold: -1 },
      { phase: 1, threshold: 0 },
    ],
    eligibility: [
      { kind: 'actor' as const, actorId: resolvedScenario.attacker.initialActorFormId.actorId },
    ],
    capacity: { default: null, maximum: null, traitOverrides: [] },
  };
  const withDomain = structuredClone(master);
  withDomain.battlePointDomains.push(domain);
  withDomain.servants[0]!.battlePointDomains = [domain];
  const onScenarioChange = vi.fn();
  renderCalculator(resolvedScenario, onScenarioChange, undefined, withDomain);
  fireEvent.change(screen.getByLabelText(/^開始バトルポイント/), { target: { value: '60' } });
  expect(onScenarioChange).toHaveBeenCalledWith({
    ...resolvedScenario,
    initialBattlePointPoints: { [domain.id]: 60 },
    battleState: { battlePointPhase: null },
  });
});

function renderCalculator(
  scenario: CalculationScenario,
  onScenarioChange = vi.fn(),
  resultOverride?: CalculationResult,
  displayMaster = master,
) {
  const calculation = requireExecutableCalculation(calculateScenario(scenario, master, versions));
  render(
    <Calculator
      master={displayMaster}
      resolvedInput={calculation.input}
      scenarioInput={calculation.input}
      resolvedEffects={calculation.effects}
      appliedPreparationActions={calculation.appliedPreparationActions}
      effectControls={calculation.effectControls}
      effectWarnings={calculation.effectWarnings}
      effectInputs={calculation.effectInputs}
      activationRequirements={calculation.activationRequirements}
      result={resultOverride ?? calculation.result}
      request={createCalculatorPortableRequest(scenario, requestVersions)}
      scenario={scenario}
      servants={displayMaster.servants}
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
      onRegenerateHistory={vi.fn()}
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
      // E2E-A030-DIRECT-CONTROLS
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

it('shows an unreachable NP as nonnumeric and explains the repairable preparation state', () => {
  renderCalculator(resolvedScenario, vi.fn(), {
    ...resolved.result,
    status: 'unavailable',
    rows: [],
    reason: 'insufficientNpGauge',
  });
  expect(
    screen.getByText(
      '現在の準備状態では宝具を使用できません。NPゲージと準備操作を確認してください。',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('table', { name: '宝具レベル別のダメージ' })).toBeNull();
});

it.each([
  [
    'selectedAttackProfileHasNoAttack',
    '選択中の攻撃宝具へ到達できません。形態変更と宝具選択の効果を確認してください。',
  ],
  [
    'selectedAttackProfileChanged',
    '選択中とは別の攻撃宝具が選ばれました。形態変更と宝具選択の効果を確認してください。',
  ],
] as const)(
  'shows structural profile unavailability for %s without damage rows',
  (reason, message) => {
    renderCalculator(resolvedScenario, vi.fn(), {
      ...resolved.result,
      status: 'unavailable',
      rows: [],
      reason,
    });
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByRole('table', { name: '宝具レベル別のダメージ' })).toBeNull();
  },
);
