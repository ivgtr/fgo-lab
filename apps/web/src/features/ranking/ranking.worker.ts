/// <reference lib="webworker" />
import {
  calculateRankingDetail,
  calculateRankingSummary,
  type RankingConditions,
  type RankingProfileInput,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { RankingWorkerRequest, RankingWorkerResponse } from './rankingWorkerProtocol';

let context:
  | {
      master: MasterDataSnapshot;
      profile: RankingProfileInput;
      versions: VersionContext;
    }
  | undefined;
const conditionCache = new Map<string, RankingConditions>();
const summaryCache = new Map<string, ReturnType<typeof calculateRankingSummary>>();
const detailCache = new Map<string, Map<string, ReturnType<typeof calculateRankingDetail>>>();

function respond(response: RankingWorkerResponse) {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<RankingWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === 'initialize') {
      context = { master: request.master, profile: request.profile, versions: request.versions };
      conditionCache.clear();
      summaryCache.clear();
      detailCache.clear();
      respond({ kind: 'ready', requestId: request.requestId });
      return;
    }
    if (!context) throw new TypeError('ranking_worker_not_initialized');
    if (request.kind === 'calculate') {
      const calculation =
        summaryCache.get(request.fingerprint) ??
        calculateRankingSummary(
          context.master,
          context.profile,
          request.conditions,
          context.versions,
        );
      conditionCache.set(request.fingerprint, request.conditions);
      summaryCache.set(request.fingerprint, calculation);
      respond({
        kind: 'result',
        requestId: request.requestId,
        fingerprint: request.fingerprint,
        rows: calculation.rows,
        failures: calculation.failures,
      });
      return;
    }
    respond({
      kind: 'detail',
      requestId: request.requestId,
      fingerprint: request.fingerprint,
      servantId: request.servantId,
      detail: (() => {
        const conditions = conditionCache.get(request.fingerprint);
        const servant = context.master.servants.find(
          (candidate) => candidate.id === request.servantId,
        );
        if (!conditions || !servant) return null;
        const cached = detailCache.get(request.fingerprint)?.get(request.servantId);
        if (cached) return cached;
        const detail = calculateRankingDetail(
          servant,
          context.master,
          context.profile,
          conditions,
          context.versions,
        );
        const details =
          detailCache.get(request.fingerprint) ??
          new Map<string, ReturnType<typeof calculateRankingDetail>>();
        details.set(request.servantId, detail);
        detailCache.set(request.fingerprint, details);
        return detail;
      })(),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    if (request.kind === 'detail')
      respond({
        kind: 'error',
        stage: 'detail',
        requestId: request.requestId,
        fingerprint: request.fingerprint,
        servantId: request.servantId,
        reason,
      });
    else
      respond({
        kind: 'error',
        stage: request.kind === 'initialize' ? 'initialization' : 'summary',
        requestId: request.requestId,
        fingerprint: request.kind === 'calculate' ? request.fingerprint : null,
        reason,
      });
  }
};
