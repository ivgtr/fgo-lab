// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import {
  calculateRankingPolicy,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { Ranking } from './Ranking';
import {
  rankingConditionsFingerprint,
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';

class FakeWorker {
  static instance: FakeWorker | undefined;
  onmessage: ((event: MessageEvent<RankingWorkerResponse>) => void) | null = null;
  readonly requests: RankingWorkerRequest[] = [];

  constructor() {
    FakeWorker.instance = this;
  }

  postMessage(request: RankingWorkerRequest) {
    this.requests.push(request);
  }

  emit(response: RankingWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<RankingWorkerResponse>);
  }

  terminate() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeWorker.instance = undefined;
  window.history.replaceState(null, '', '/');
});

describe('ranking loading presentation', () => {
  it('renders loading until the canonical worker result arrives', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const master = masterSnapshotSchema.parse(fixture);
    const view = render(
      <Ranking
        master={master}
        profile={{ servantBuilds: {} }}
        versions={{
          schemaVersion: SCHEMA_VERSION,
          masterDataVersion: master.version,
          engineVersion: ENGINE_VERSION,
          appVersion: APP_VERSION,
          gameRegion: 'JP',
          masterDataLocale: 'ja-JP',
        }}
        onOpenCalculator={vi.fn()}
      />,
    );

    // E2E-A008-LOADING
    expect(view.container.querySelector('.ranking-loading')).not.toBeNull();
    expect(view.getByRole('status').textContent).toContain('ランキングを更新中');

    const worker = FakeWorker.instance!;
    const initialize = worker.requests[0]!;
    if (initialize.kind !== 'initialize') throw new TypeError('expected initialize request');
    act(() =>
      worker.emit({
        kind: 'ready',
        requestId: initialize.requestId,
        contextId: initialize.contextId,
      }),
    );
    await waitFor(() =>
      expect(worker.requests.filter(({ kind }) => kind === 'calculate')).toHaveLength(1),
    );
    const calculate = worker.requests.find(({ kind }) => kind === 'calculate')!;
    if (calculate.kind !== 'calculate') throw new TypeError('expected calculate request');
    act(() =>
      worker.emit({
        kind: 'result',
        requestId: calculate.requestId,
        contextId: calculate.contextId,
        fingerprint: rankingConditionsFingerprint(DEFAULT_RANKING_POLICY_CONDITIONS),
        rows: [],
        exclusions: [],
      }),
    );
    await waitFor(() =>
      expect(view.getByRole('status').textContent).toContain('0件表示 / 0件を計算'),
    );
    expect(view.container.querySelector('.ranking-loading')).toBeNull();
  });

  it('renders typed non-calculated outcomes without numeric rows and exposes only the typed recovery', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const master = masterSnapshotSchema.parse(fixture);
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const source = calculateRankingPolicy(
      master,
      { servantBuilds: {} },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    ).rows[0]!;
    const openCalculator = vi.fn();
    const view = render(
      <Ranking
        master={master}
        profile={{ servantBuilds: {} }}
        versions={versions}
        onOpenCalculator={vi.fn()}
        onOpenCalculatorForAttackProfile={openCalculator}
      />,
    );
    const worker = FakeWorker.instance!;
    const initialize = worker.requests[0]!;
    if (initialize.kind !== 'initialize') throw new TypeError('expected initialize request');
    act(() =>
      worker.emit({
        kind: 'ready',
        requestId: initialize.requestId,
        contextId: initialize.contextId,
      }),
    );
    await waitFor(() =>
      expect(worker.requests.filter(({ kind }) => kind === 'calculate')).toHaveLength(1),
    );
    const calculate = worker.requests.find(({ kind }) => kind === 'calculate')!;
    if (calculate.kind !== 'calculate') throw new TypeError('expected calculate request');
    act(() =>
      worker.emit({
        kind: 'result',
        requestId: calculate.requestId,
        contextId: calculate.contextId,
        fingerprint: rankingConditionsFingerprint(DEFAULT_RANKING_POLICY_CONDITIONS),
        rows: [],
        exclusions: [
          {
            entryId: source.entryId,
            servantId: source.servantId,
            name: source.name,
            attackProfile: source.attackProfile,
            status: 'inputRequired',
            reason: 'inputRequired:target.hp',
            requiredInputs: [
              {
                key: 'target.hp',
                owner: 'target',
                label: '対象HP',
                description: '対象の現在HP',
                minimum: 1,
                maximum: 100,
                step: 1,
                effectOccurrenceIds: ['effect:0'],
              },
            ],
            recovery: { kind: 'openCalculator' },
            issues: [],
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(view.container.querySelector('[data-outcome-status="inputRequired"]')).not.toBeNull(),
    );
    expect(view.container.querySelector('.ranking-list')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '通常の計算機で入力を補う' }));
    expect(openCalculator).toHaveBeenCalledWith({
      servantId: source.servantId,
      attackProfile: source.attackProfile,
    });
  });
});
