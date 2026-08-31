// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import {
  rankingConditionsFingerprint,
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';
import { useRanking } from './useRanking';

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
  vi.unstubAllGlobals();
  FakeWorker.instance = undefined;
});

describe('ranking worker response ordering', () => {
  it('does not expose an older summary after a newer condition request wins', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const master = masterSnapshotSchema.parse(fixture);
    const profile = { servantBuilds: {}, craftEssences: [], supportTemplates: [] };
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const { result, rerender } = renderHook(
      ({ conditions }) => useRanking({ master, profile, conditions, versions }),
      { initialProps: { conditions: DEFAULT_RANKING_POLICY_CONDITIONS } },
    );
    const worker = FakeWorker.instance!;
    const initialize = worker.requests[0]!;
    if (initialize.kind !== 'initialize') throw new TypeError('expected initialize request');
    act(() => worker.emit({ kind: 'ready', requestId: initialize.requestId }));
    await waitFor(() =>
      expect(worker.requests.filter(({ kind }) => kind === 'calculate')).toHaveLength(1),
    );
    const older = worker.requests.find(({ kind }) => kind === 'calculate')!;
    if (older.kind !== 'calculate') throw new TypeError('expected calculate request');

    const newerConditions = {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      conditionalEffects: 'satisfied' as const,
    };
    rerender({ conditions: newerConditions });
    await waitFor(() =>
      expect(worker.requests.filter(({ kind }) => kind === 'calculate')).toHaveLength(2),
    );
    const newer = worker.requests.filter(({ kind }) => kind === 'calculate')[1]!;
    if (newer.kind !== 'calculate') throw new TypeError('expected calculate request');
    const newerFingerprint = rankingConditionsFingerprint(newerConditions);
    act(() =>
      worker.emit({
        kind: 'result',
        requestId: newer.requestId,
        fingerprint: newerFingerprint,
        rows: [],
        exclusions: [],
      }),
    );
    expect(result.current.fingerprint).toBe(newerFingerprint);
    expect(result.current.loading).toBe(false);

    act(() =>
      worker.emit({
        kind: 'result',
        requestId: older.requestId,
        fingerprint: rankingConditionsFingerprint(older.conditions),
        rows: [],
        exclusions: [
          {
            entryId: 'stale',
            servantId: 'stale',
            name: 'stale',
            status: 'invalid',
            reason: 'stale',
            issues: [],
          },
        ],
      }),
    );
    expect(result.current.fingerprint).toBe(newerFingerprint);
    expect(result.current.exclusions).toEqual([]);
  });
});
