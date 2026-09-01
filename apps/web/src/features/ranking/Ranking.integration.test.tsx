// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
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
        profile={{ servantBuilds: {}, craftEssences: [], supportTemplates: [] }}
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

    expect(view.container.querySelector('.ranking-loading')).not.toBeNull();
    expect(view.getByRole('status').textContent).toContain('ランキングを更新中');

    const worker = FakeWorker.instance!;
    const initialize = worker.requests[0]!;
    if (initialize.kind !== 'initialize') throw new TypeError('expected initialize request');
    act(() => worker.emit({ kind: 'ready', requestId: initialize.requestId }));
    await waitFor(() =>
      expect(worker.requests.filter(({ kind }) => kind === 'calculate')).toHaveLength(1),
    );
    const calculate = worker.requests.find(({ kind }) => kind === 'calculate')!;
    if (calculate.kind !== 'calculate') throw new TypeError('expected calculate request');
    act(() =>
      worker.emit({
        kind: 'result',
        requestId: calculate.requestId,
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
});
