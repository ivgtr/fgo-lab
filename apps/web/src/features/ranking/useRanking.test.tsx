// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
} from '@fgo-lab/calculation-application';
import {
  rankingConditionsFingerprint,
  parseRankingWorkerResponse,
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';
import { useRanking } from './useRanking';
import { rankingResponseFixture } from './rankingResponseFixture';
import { presentRankingDetailEvidence } from './rankingDetailPresentation';
import { parseRankingUrlState } from './rankingState';

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

  emit(response: unknown) {
    this.onmessage?.({ data: response } as MessageEvent<RankingWorkerResponse>);
  }

  terminate() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instance = undefined;
});

describe('ranking worker response ordering', () => {
  it('does not create a worker or request a summary for a rejected URL', () => {
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
    const { result } = renderHook(() =>
      useRanking({
        master,
        profile: { servantBuilds: {} },
        conditions: parseRankingUrlState('?rField=active').conditions,
        versions,
      }),
    );
    expect(FakeWorker.instance).toBeUndefined();
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it.each(['conditionalEffects', 'initialOvercharge'] as const)(
    'does not expose an older summary after a newer %s request wins',
    async (axis) => {
      const baseline: RankingPolicyConditions = {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        npLevelBasis: { kind: 'specified' as const, npLevel: 2 as const },
      };
      vi.stubGlobal('Worker', FakeWorker);
      const master = masterSnapshotSchema.parse(fixture);
      const profile = { servantBuilds: {} };
      const versions = {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: master.version,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP' as const,
        masterDataLocale: 'ja-JP' as const,
      };
      const { result, rerender } = renderHook(
        ({ conditions }: { conditions: RankingPolicyConditions }) =>
          useRanking({ master, profile, conditions, versions }),
        { initialProps: { conditions: baseline } },
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
      const older = worker.requests.find(({ kind }) => kind === 'calculate')!;
      if (older.kind !== 'calculate') throw new TypeError('expected calculate request');

      const newerConditions = {
        ...baseline,
        ...(axis === 'initialOvercharge'
          ? { initialOvercharge: 2 as const }
          : { conditionalEffects: 'satisfied' as const }),
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
          contextId: newer.contextId,
          fingerprint: newerFingerprint,
          rows: [],
          exclusions: [],
        }),
      );
      expect(result.current.fingerprint).toBe(`${newer.contextId}:${newerFingerprint}`);
      expect(result.current.loading).toBe(false);

      act(() =>
        worker.emit({
          kind: 'result',
          requestId: older.requestId,
          contextId: older.contextId,
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
      expect(result.current.fingerprint).toBe(`${newer.contextId}:${newerFingerprint}`);
      expect(result.current.exclusions).toEqual([]);
    },
  );
});

it('ignores old-context ready/result/detail/error and excludes unrelated saved data from worker identity', async () => {
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
  const profile = {
    servantBuilds: {},
    craftEssences: [] as unknown[],
    supportTemplates: [] as unknown[],
  };
  const { result, rerender } = renderHook(
    ({ profile }) =>
      useRanking({ master, profile, conditions: DEFAULT_RANKING_POLICY_CONDITIONS, versions }),
    { initialProps: { profile } },
  );
  const old = FakeWorker.instance!;
  const first = old.requests[0]!;
  act(() => old.emit({ kind: 'ready', requestId: first.requestId, contextId: first.contextId }));
  await waitFor(() => expect(old.requests).toHaveLength(2));
  const summary = old.requests[1]!;
  const fingerprint = rankingConditionsFingerprint(DEFAULT_RANKING_POLICY_CONDITIONS);
  act(() =>
    old.emit({
      kind: 'result',
      requestId: summary.requestId,
      contextId: summary.contextId,
      fingerprint,
      rows: [],
      exclusions: [],
    }),
  );
  expect(result.current.loading).toBe(false);
  rerender({ profile: { ...profile, craftEssences: [{}], supportTemplates: [{}] } });
  expect(FakeWorker.instance).toBe(old);
  expect(old.requests).toHaveLength(2);
  const servantId = master.servants[0]!.id;
  rerender({
    profile: {
      ...profile,
      servantBuilds: {
        [servantId]: {
          servantId,
          level: 90,
          npLevel: 1,
          ascension: 4,
          fouAtk: 1000,
          skills: {},
          appends: {},
          updatedAt: '2026-09-05T00:00:00.000Z',
        },
      },
    },
  });
  const next = FakeWorker.instance!;
  expect(next).not.toBe(old);
  expect(result.current.loading).toBe(true);
  act(() => {
    old.emit({ kind: 'ready', requestId: first.requestId, contextId: first.contextId });
    old.emit({
      kind: 'result',
      requestId: summary.requestId,
      contextId: summary.contextId,
      fingerprint,
      rows: [],
      exclusions: [],
    });
    old.emit({
      kind: 'error',
      status: 'invalid',
      stage: 'summary',
      requestId: summary.requestId,
      contextId: summary.contextId,
      fingerprint,
      reason: 'stale',
    });
    old.emit({
      kind: 'error',
      status: 'invalid',
      stage: 'detail',
      entryId: 'stale',
      requestId: 'stale',
      contextId: summary.contextId,
      fingerprint,
      reason: 'stale',
    });
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBe('');
  expect(result.current.details).toEqual({});
  expect(result.current.detailErrors).toEqual({});
  expect(next.requests).toHaveLength(1);
});

it('does not start a worker for invalid URL conditions', () => {
  const Worker = vi.fn();
  vi.stubGlobal('Worker', Worker);
  const master = masterSnapshotSchema.parse(fixture);
  renderHook(() =>
    useRanking({
      master,
      profile: { servantBuilds: {} },
      conditions: null,
      versions: {
        schemaVersion: SCHEMA_VERSION,
        masterDataVersion: master.version,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
    }),
  );
  expect(Worker).not.toHaveBeenCalled();
});

it('never publishes malformed current detail and accepts a subsequent valid reply for presentation', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const fixture = rankingResponseFixture();
  const { result } = renderHook(() =>
    useRanking({
      master: fixture.master,
      profile: fixture.profile,
      versions: fixture.versions,
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    }),
  );
  const worker = FakeWorker.instance!;
  const initialize = worker.requests[0]!;
  act(() =>
    worker.emit({
      ...fixture.ready,
      requestId: initialize.requestId,
      contextId: initialize.contextId,
    }),
  );
  await waitFor(() => expect(worker.requests).toHaveLength(2));
  const calculate = worker.requests[1]!;
  act(() =>
    worker.emit({
      ...fixture.summary,
      requestId: calculate.requestId,
      contextId: calculate.contextId,
    }),
  );
  const row = result.current.rows[0]!;
  act(() => result.current.requestDetail(row));
  const request = worker.requests[2]!;
  const response = {
    ...fixture.detail,
    requestId: request.requestId,
    contextId: request.contextId,
  };
  for (const detail of [
    { ...response.detail, attackProfile: undefined },
    { ...response.detail, appliedPreparationActions: [{}] },
    {
      ...response.detail,
      effectiveContributions: { ...response.detail.effectiveContributions, contributions: [{}] },
    },
  ]) {
    act(() => worker.emit({ ...response, detail }));
    expect(result.current.details).toEqual({});
  }
  // Invalid transport data must not consume the pending request or poison later valid publication.
  act(() => worker.emit(response));
  expect(result.current.details[row.entryId]).toEqual(response.detail);
  expect(() =>
    presentRankingDetailEvidence(result.current.details[row.entryId]!, fixture.master),
  ).not.toThrow();
});

it('keeps one active detail and rejects a superseded response after row replacement or close', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const fixture = rankingResponseFixture();
  const { result } = renderHook(() =>
    useRanking({
      master: fixture.master,
      profile: fixture.profile,
      versions: fixture.versions,
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    }),
  );
  const worker = FakeWorker.instance!;
  const initialize = worker.requests[0]!;
  act(() =>
    worker.emit({
      ...fixture.ready,
      requestId: initialize.requestId,
      contextId: initialize.contextId,
    }),
  );
  await waitFor(() => expect(worker.requests).toHaveLength(2));
  const calculate = worker.requests[1]!;
  act(() =>
    worker.emit({
      ...fixture.summary,
      requestId: calculate.requestId,
      contextId: calculate.contextId,
    }),
  );
  const firstRow = result.current.rows[0]!;
  const secondRow = { ...firstRow, entryId: `${firstRow.entryId}:second` };
  act(() => result.current.requestDetail(firstRow));
  const firstRequest = worker.requests[2]!;
  act(() => result.current.requestDetail(secondRow));
  const secondRequest = worker.requests[3]!;
  if (firstRequest.kind !== 'detail' || secondRequest.kind !== 'detail')
    throw new TypeError('expected detail requests');

  act(() =>
    worker.emit({
      ...fixture.detail,
      requestId: firstRequest.requestId,
      contextId: firstRequest.contextId,
    }),
  );
  expect(result.current.details).toEqual({});
  const secondResponse = {
    ...fixture.detail,
    requestId: secondRequest.requestId,
    contextId: secondRequest.contextId,
    entryId: secondRow.entryId,
    detail: { ...fixture.detail.detail, entryId: secondRow.entryId },
  };
  expect(secondResponse.contextId).toBe(secondRequest.contextId);
  expect(secondResponse.fingerprint).toBe(secondRequest.fingerprint);
  expect(secondResponse.entryId).toBe(secondRequest.entryId);
  expect(parseRankingWorkerResponse(secondResponse)).not.toBeNull();
  act(() => worker.emit(secondResponse));
  expect(Object.keys(result.current.details)).toEqual([secondRow.entryId]);

  act(() => result.current.clearDetail());
  expect(result.current.details).toEqual({});
  act(() =>
    worker.emit({
      ...fixture.detail,
      requestId: firstRequest.requestId,
      contextId: firstRequest.contextId,
    }),
  );
  expect(result.current.details).toEqual({});
});
