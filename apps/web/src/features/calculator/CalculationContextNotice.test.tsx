// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  attemptPortableCalculationVersionUpgrade,
  createCalculatorPortableRequest,
  createDefaultResolvedScenario,
  currentCalculationVersionContext,
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
const calculatorRequest = createCalculatorPortableRequest(
  createDefaultResolvedScenario(master, undefined),
  currentCalculationVersionContext(master),
);
const rankingRequest = portableCalculationRequestSchema.parse({
  ...calculatorRequest,
  executionIntent: {
    kind: 'resolved' as const,
    origin: 'ranking' as const,
    initialNpGauge: 20_000,
    contribution: 'excludeVoluntarySkillModifiers' as const,
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
    expect(screen.getByText('ランキングから引き継いだ計算条件')).toBeTruthy();
    expect(screen.getByText(/開始NP 200%/)).toBeTruthy();
    expect(screen.getByText(/任意スキル補正を除外/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '通常の計算条件へ戻す' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('labels an unavailable runtime as historical and warns before explicit upgrade', () => {
    const onUpgrade = vi.fn(() => Promise.resolve());
    render(
      <CalculationContextNotice
        state="historicalOnly"
        request={{
          ...rankingRequest,
          versionContext: { masterDataVersion: 'old-master', engineVersion: 'old-engine' },
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
      versionContext: { masterDataVersion: 'old-master', engineVersion: 'old-engine' },
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
