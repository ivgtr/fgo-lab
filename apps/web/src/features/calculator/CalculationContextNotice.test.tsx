// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  attemptPortableCalculationVersionUpgrade,
  compileRankingSelection,
  createCalculatorPortableRequest,
  createDefaultResolvedScenario,
  currentCalculationVersionContext,
  resolveRankingBasis,
} from '@fgo-lab/calculation-application';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  portableCalculationRequestSchema,
  type CalculationResult,
} from '@fgo-lab/schema';
import { CalculationContextNotice } from './CalculationContextNotice';

afterEach(cleanup);

const master = masterSnapshotSchema.parse(fixture);
const resolvedScenario = createDefaultResolvedScenario(master, undefined);
const calculatorRequest = createCalculatorPortableRequest(
  resolvedScenario,
  currentCalculationVersionContext(master),
);
const selection = compileRankingSelection({
  ...DEFAULT_RANKING_POLICY_CONDITIONS,
  initialOvercharge: 2,
  npLevelBasis: { kind: 'specified', npLevel: 2 },
});
if (selection.status !== 'valid') throw new Error(selection.detail);
const rankingRequest = portableCalculationRequestSchema.parse({
  ...calculatorRequest,
  scenario: {
    ...resolvedScenario,
    initialOvercharge: 2,
    attacker: { ...resolvedScenario.attacker, npLevel: 2 },
  },
  executionIntent: {
    kind: 'ranking' as const,
    initialNpGauge: 20_000,
    policy: {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      initialOvercharge: 2,
      npLevelBasis: { kind: 'specified', npLevel: 2 },
      selfBuffs: 'excluded' as const,
      conditionalEffects: 'satisfied' as const,
    },
    basis: resolveRankingBasis(master.servants[0]!, { servantBuilds: {} }, selection.selection),
  },
});
const historicalResult: CalculationResult = {
  status: 'unsupported',
  rows: [],
  missingEvidence: ['old runtime'],
  effects: [],
  assumptions: [],
  issues: [],
  trace: [],
  evidence: [
    {
      key: 'historical',
      subject: 'fixture',
      status: 'provisional',
      sources: ['fixture'],
      goldenCaseIds: ['fixture'],
      differentialCaseIds: [],
      reviewedAt: '2026-09-01',
      engineVersion: 'old-engine',
    },
  ],
  versions: {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: 'old-master',
    engineVersion: 'old-engine',
    appVersion: APP_VERSION,
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
  },
};

describe('calculation context recovery presentation', () => {
  it('keeps inherited ranking intent visible and exposes only the explicit reset command', () => {
    const onReset = vi.fn(() => Promise.resolve());
    render(<CalculationContextNotice state="current" request={rankingRequest} onReset={onReset} />);
    expect(screen.getByRole('heading', { name: 'ランキングから引き継いだ計算条件' })).toBeTruthy();
    expect(screen.getByText(/開始NP 200%/)).toBeTruthy();
    expect(screen.getByText(/自己バフ: 除外/)).toBeTruthy();
    expect(screen.getByText(/条件効果: 成立込み/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '通常の計算条件へ戻す' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('keeps the ranking notice visible while reset is pending and reports a failed reset', () => {
    const onReset = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <CalculationContextNotice
        state="current"
        request={rankingRequest}
        onReset={onReset}
        resetPending
      />,
    );
    expect(
      screen.getByRole('button', { name: '通常の計算条件へ戻す' }).getAttribute('disabled'),
    ).not.toBeNull();
    expect(screen.getByRole('region', { name: '計算条件の版情報' }).getAttribute('aria-busy')).toBe(
      'true',
    );

    rerender(
      <CalculationContextNotice
        state="current"
        request={rankingRequest}
        onReset={onReset}
        resetError="requestResultVersionMismatch"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('requestResultVersionMismatch');
    expect(
      screen
        .getByRole('region', { name: '計算条件の版情報' })
        .getAttribute('data-calculation-error-summary'),
    ).toBe('true');
  });

  it('labels an unavailable runtime as historical and warns before explicit upgrade', () => {
    const onUpgrade = vi.fn(() => Promise.resolve());
    render(
      <CalculationContextNotice
        state="historicalOnly"
        request={{
          ...rankingRequest,
          versionContext: {
            schemaVersion: SCHEMA_VERSION,
            masterDataVersion: 'old-master',
            engineVersion: 'old-engine',
          },
        }}
        result={historicalResult}
        onUpgrade={onUpgrade}
      />,
    );
    expect(screen.getByRole('heading', { name: '履歴値・再計算されていません' })).toBeTruthy();
    expect(screen.getByText(/元の履歴値は上書きしません/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '現在のバージョンで再計算' }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('keeps the historical result visible with a typed failed attempt and permits retry', () => {
    const retainedRequest = {
      ...rankingRequest,
      versionContext: {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: 'old-master',
        engineVersion: 'old-engine',
      },
    };
    const attempt = attemptPortableCalculationVersionUpgrade(
      retainedRequest,
      historicalResult,
      currentCalculationVersionContext(master),
      master,
    );
    if (attempt.status !== 'rejected') throw new Error('failed attempt required');
    const onUpgrade = vi.fn(() => Promise.resolve());
    render(
      <CalculationContextNotice
        state="historicalOnly"
        request={retainedRequest}
        result={historicalResult}
        upgradeAttempt={attempt}
        onUpgrade={onUpgrade}
      />,
    );

    expect(screen.getByRole('heading', { name: '履歴値・再計算されていません' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('元の履歴値を保持しています');
    fireEvent.click(screen.getByRole('button', { name: '現在のバージョンで再計算' }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('retains the original metadata and result when the attempted request cannot be constructed', () => {
    if (
      rankingRequest.scenario.mode !== 'resolved' ||
      rankingRequest.executionIntent.kind !== 'ranking'
    )
      throw new Error('resolved ranking request required');
    const retainedRequest = {
      executionIntent: rankingRequest.executionIntent,
      versionContext: {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: historicalResult.versions.masterDataVersion,
        engineVersion: historicalResult.versions.engineVersion,
      },
      scenario: {
        ...rankingRequest.scenario,
        attacker: {
          ...rankingRequest.scenario.attacker,
          level: rankingRequest.scenario.attacker.level + 1,
        },
      },
    };
    const attempt = attemptPortableCalculationVersionUpgrade(
      retainedRequest,
      historicalResult,
      currentCalculationVersionContext(master),
      master,
    );
    if (attempt.status !== 'rejected') throw new Error('failed attempt required');
    expect(attempt.attemptedRequest).toBeNull();
    expect(attempt.retainedRequest).toBe(retainedRequest);
    expect(attempt.retainedResult).toBe(historicalResult);
    const onUpgrade = vi.fn(() => Promise.resolve());
    render(
      <CalculationContextNotice
        state="historicalOnly"
        request={retainedRequest}
        result={historicalResult}
        upgradeAttempt={attempt}
        onUpgrade={onUpgrade}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('scenarioInvalid');
    expect(screen.getByRole('alert').textContent).toContain('元の履歴値を保持しています');
    expect(screen.getAllByText(/マスター old-master ／ エンジン old-engine/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '現在のバージョンで再計算' }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it('shows no reset command for invalid normal calculator identity', () => {
    render(
      <CalculationContextNotice
        state="invalid"
        request={calculatorRequest}
        reason="requestResultVersionMismatch"
        onReset={vi.fn(() => Promise.resolve())}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('requestResultVersionMismatch');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(new RegExp(ENGINE_VERSION))).toBeTruthy();
  });
});
