import { describe, expect, it } from 'vitest';
import {
  calculateRankingPolicySummary,
  DEFAULT_RANKING_POLICY_CONDITIONS,
} from '@fgo-lab/calculation-application';
import { createRankingWorkerRuntime } from './rankingWorkerRuntime';
import { createRankingWorkerTransport, rankingWorkerCount } from './rankingWorkerPool';
import { rankingResponseFixture } from './rankingResponseFixture';
import type { RankingWorkerRequest, RankingWorkerResponse } from './rankingWorkerProtocol';

class InMemoryWorker {
  onmessage: ((event: MessageEvent<RankingWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: RankingWorkerRequest[] = [];
  readonly runtime = createRankingWorkerRuntime();
  terminated = false;

  postMessage(request: RankingWorkerRequest) {
    const ownedRequest = structuredClone(request);
    this.sent.push(ownedRequest);
    queueMicrotask(() => {
      if (this.terminated) return;
      const response = this.runtime.handle(ownedRequest);
      this.onmessage?.({ data: response } as MessageEvent<RankingWorkerResponse>);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function nextResponse(transport: ReturnType<typeof createRankingWorkerTransport>) {
  return new Promise<RankingWorkerResponse>((resolve) => {
    transport.onmessage = (event) => resolve(event.data);
  });
}

describe('ranking worker partition', () => {
  it('uses two workers only when the master and device can bear the extra copy', () => {
    expect(rankingWorkerCount(470, 12, 8)).toBe(2);
    expect(rankingWorkerCount(99, 12, 8)).toBe(1);
    expect(rankingWorkerCount(470, 2, 8)).toBe(1);
    expect(rankingWorkerCount(470, 12, 4)).toBe(1);
    expect(rankingWorkerCount(470, 12, undefined)).toBe(1);
  });

  it('joins ordered results and sends detail to its owning worker', async () => {
    const fixture = rankingResponseFixture();
    const endpoints = [new InMemoryWorker(), new InMemoryWorker()];
    const transport = createRankingWorkerTransport(endpoints as unknown as Worker[]);
    const ready = nextResponse(transport);
    transport.postMessage({
      kind: 'initialize',
      requestId: 'initialize',
      contextId: 'context',
      master: fixture.master,
      profile: fixture.profile,
      versions: fixture.versions,
    });
    expect(await ready).toMatchObject({ kind: 'ready', requestId: 'initialize' });
    const firstMaster = (
      endpoints[0]!.sent[0] as Extract<RankingWorkerRequest, { kind: 'initialize' }>
    ).master;
    const secondMaster = (
      endpoints[1]!.sent[0] as Extract<RankingWorkerRequest, { kind: 'initialize' }>
    ).master;
    expect([...firstMaster.servants, ...secondMaster.servants]).toEqual(fixture.master.servants);

    const summary = nextResponse(transport);
    transport.postMessage({
      kind: 'calculate',
      requestId: 'calculate',
      contextId: 'context',
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    });
    const result = await summary;
    expect(result.kind).toBe('result');
    if (result.kind !== 'result') throw new Error('ranking_summary_required');
    expect(result.rows).toEqual(fixture.summary.rows);
    expect(result.exclusions).toEqual(fixture.summary.exclusions);

    const secondRow = result.rows.find((row) =>
      secondMaster.servants.some((servant) => servant.id === row.servantId),
    );
    expect(secondRow).toBeDefined();
    const detail = nextResponse(transport);
    transport.postMessage({
      kind: 'detail',
      requestId: 'detail',
      contextId: 'context',
      fingerprint: result.fingerprint,
      entryId: secondRow!.entryId,
    });
    expect(await detail).toMatchObject({ kind: 'detail', entryId: secondRow!.entryId });
    expect(endpoints[0]!.sent.some(({ kind }) => kind === 'detail')).toBe(false);
    expect(endpoints[1]!.sent.some(({ kind }) => kind === 'detail')).toBe(true);

    for (const conditions of [
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, selfBuffs: 'excluded' as const },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' as const },
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, population: 'owned' as const },
    ]) {
      const expected = calculateRankingPolicySummary(
        fixture.master,
        fixture.profile,
        conditions,
        fixture.versions,
      );
      const next = nextResponse(transport);
      transport.postMessage({
        kind: 'calculate',
        requestId: `${conditions.selfBuffs}:${conditions.conditionalEffects}:${conditions.population}`,
        contextId: 'context',
        conditions,
      });
      const actual = await next;
      expect(actual.kind).toBe('result');
      if (actual.kind !== 'result') throw new Error('ranking_summary_required');
      expect(actual.rows).toEqual(expected.rows);
      expect(actual.exclusions).toEqual(expected.exclusions);
    }

    transport.terminate();
    expect(endpoints.every(({ terminated }) => terminated)).toBe(true);
  });

  it('reports a failed shard on the next request instead of leaving ranking loading', async () => {
    const fixture = rankingResponseFixture();
    const endpoints = [new InMemoryWorker(), new InMemoryWorker()];
    const transport = createRankingWorkerTransport(endpoints as unknown as Worker[]);
    const ready = nextResponse(transport);
    transport.postMessage({
      kind: 'initialize',
      requestId: 'initialize',
      contextId: 'context',
      master: fixture.master,
      profile: fixture.profile,
      versions: fixture.versions,
    });
    expect((await ready).kind).toBe('ready');
    endpoints[1]!.onerror?.({} as ErrorEvent);
    const failure = nextResponse(transport);
    transport.postMessage({
      kind: 'calculate',
      requestId: 'calculate',
      contextId: 'context',
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
    });
    expect(await failure).toMatchObject({
      kind: 'error',
      status: 'failed',
      stage: 'summary',
      reason: 'ranking_worker_failure',
    });
    transport.terminate();
  });
});
