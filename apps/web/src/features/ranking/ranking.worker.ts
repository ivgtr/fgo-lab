/// <reference lib="webworker" />
import {
  calculateRankingDetail,
  calculateRankingSummary,
  calculateStandardRankingMatrix,
  rankingMatrixPolicyKey,
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
const standardMatrixCache = new Map<string, ReturnType<typeof calculateStandardRankingMatrix>>();
const detailCache = new Map<string, Map<string, ReturnType<typeof calculateRankingDetail>>>();

function respond(response: RankingWorkerResponse) {
  self.postMessage(response);
}

function standardSummary(
  conditions: RankingConditions,
): ReturnType<typeof calculateRankingSummary> {
  if (!context) throw new TypeError('ranking_worker_not_initialized');
  const { npLevel, ...matrixConditions } = conditions;
  const matrixKey = rankingMatrixPolicyKey(matrixConditions);
  let matrix = standardMatrixCache.get(matrixKey);
  if (!matrix) {
    matrix = calculateStandardRankingMatrix(
      context.master,
      context.profile,
      matrixConditions,
      context.versions,
    );
    standardMatrixCache.set(matrixKey, matrix);
  }
  return matrix[npLevel - 1]!;
}

self.onmessage = (event: MessageEvent<RankingWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.kind === 'initialize') {
      context = { master: request.master, profile: request.profile, versions: request.versions };
      conditionCache.clear();
      summaryCache.clear();
      standardMatrixCache.clear();
      detailCache.clear();
      respond({ kind: 'ready', requestId: request.requestId });
      return;
    }
    if (!context) throw new TypeError('ranking_worker_not_initialized');
    if (request.kind === 'calculate') {
      const calculation =
        summaryCache.get(request.fingerprint) ??
        (request.conditions.comparisonMode === 'standard'
          ? standardSummary(request.conditions)
          : calculateRankingSummary(
              context.master,
              context.profile,
              request.conditions,
              context.versions,
            ));
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
      entryId: request.entryId,
      detail: (() => {
        const conditions = conditionCache.get(request.fingerprint);
        const servant = context.master.servants.find(
          (candidate) => candidate.id === request.servantId,
        );
        if (!conditions || !servant) return null;
        const cached = detailCache.get(request.fingerprint)?.get(request.entryId);
        if (cached) return cached;
        const detail = calculateRankingDetail(
          servant,
          context.master,
          context.profile,
          conditions,
          context.versions,
          request.attackProfile,
        );
        const details =
          detailCache.get(request.fingerprint) ??
          new Map<string, ReturnType<typeof calculateRankingDetail>>();
        details.set(request.entryId, detail);
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
        entryId: request.entryId,
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
