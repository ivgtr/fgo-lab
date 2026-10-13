import {
  parseRankingWorkerResponse,
  rankingConditionsFingerprint,
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';

export interface RankingWorkerTransport {
  onmessage: ((event: MessageEvent<RankingWorkerResponse>) => void) | null;
  postMessage(request: RankingWorkerRequest): void;
  terminate(): void;
}

type InitializeRequest = Extract<RankingWorkerRequest, { kind: 'initialize' }>;
type CalculateRequest = Extract<RankingWorkerRequest, { kind: 'calculate' }>;
type DetailRequest = Extract<RankingWorkerRequest, { kind: 'detail' }>;
type Result = Extract<RankingWorkerResponse, { kind: 'result' }>;

export function rankingWorkerCount(
  servantCount: number,
  hardwareConcurrency: number,
  deviceMemoryGb: number | undefined,
): 1 | 2 {
  return servantCount >= 100 && hardwareConcurrency >= 4 && (deviceMemoryGb ?? 0) >= 8 ? 2 : 1;
}

/** Each shard executes the same complete policy for a disjoint, ordered servant range. */
export function createRankingWorkerTransport(workers: readonly Worker[]): RankingWorkerTransport {
  if (workers.length === 1) return workers[0]!;
  if (workers.length !== 2) throw new TypeError('ranking_worker_count_invalid');

  let initialization: { request: InitializeRequest; ready: Set<number> } | undefined;
  let calculation:
    { request: CalculateRequest; fingerprint: string; parts: (Result | undefined)[] } | undefined;
  let detail: { request: DetailRequest; workerIndex: number } | undefined;
  let contextId = '';
  let ownerByEntryId = new Map<string, number>();
  let fatalReason: string | undefined;

  const transport: RankingWorkerTransport = {
    onmessage: null,
    postMessage(request) {
      if (fatalReason) {
        emitFailureFor(request, fatalReason);
        return;
      }
      if (request.kind === 'initialize') {
        contextId = request.contextId;
        initialization = { request, ready: new Set() };
        calculation = undefined;
        detail = undefined;
        ownerByEntryId = new Map();
        workers.forEach((worker, index) => {
          const start = Math.floor((request.master.servants.length * index) / workers.length);
          const end = Math.floor((request.master.servants.length * (index + 1)) / workers.length);
          worker.postMessage({
            ...request,
            master: { ...request.master, servants: request.master.servants.slice(start, end) },
          });
        });
        return;
      }
      if (request.contextId !== contextId) throw new TypeError('ranking_worker_context_mismatch');
      if (request.kind === 'calculate') {
        detail = undefined;
        ownerByEntryId = new Map();
        calculation = {
          request,
          fingerprint: rankingConditionsFingerprint(request.conditions),
          parts: Array.from({ length: workers.length }),
        };
        workers.forEach((worker) => worker.postMessage(request));
        return;
      }
      const workerIndex = ownerByEntryId.get(request.entryId);
      if (workerIndex === undefined) {
        emit({
          kind: 'error',
          status: 'invalid',
          stage: 'detail',
          requestId: request.requestId,
          contextId: request.contextId,
          fingerprint: request.fingerprint,
          entryId: request.entryId,
          reason: 'ranking_detail_context_missing',
        });
        return;
      }
      detail = { request, workerIndex };
      workers[workerIndex]!.postMessage(request);
    },
    terminate() {
      initialization = undefined;
      calculation = undefined;
      detail = undefined;
      ownerByEntryId.clear();
      workers.forEach((worker) => worker.terminate());
    },
  };

  function emit(response: RankingWorkerResponse) {
    transport.onmessage?.({ data: response } as MessageEvent<RankingWorkerResponse>);
  }

  function emitFailureFor(request: RankingWorkerRequest, reason: string) {
    if (request.kind === 'detail') {
      emit({
        kind: 'error',
        status: 'failed',
        stage: 'detail',
        requestId: request.requestId,
        contextId: request.contextId,
        fingerprint: request.fingerprint,
        entryId: request.entryId,
        reason,
      });
    } else if (request.kind === 'calculate') {
      emit({
        kind: 'error',
        status: 'failed',
        stage: 'summary',
        requestId: request.requestId,
        contextId: request.contextId,
        fingerprint: rankingConditionsFingerprint(request.conditions),
        reason,
      });
    } else {
      emit({
        kind: 'error',
        status: 'failed',
        stage: 'initialization',
        requestId: request.requestId,
        contextId: request.contextId,
        fingerprint: null,
        reason,
      });
    }
  }

  function fail(reason: string) {
    if (fatalReason) return;
    fatalReason = reason;
    const request = detail?.request ?? calculation?.request ?? initialization?.request;
    detail = undefined;
    calculation = undefined;
    initialization = undefined;
    if (request) emitFailureFor(request, reason);
  }

  workers.forEach((worker, index) => {
    worker.onerror = () => fail('ranking_worker_failure');
    worker.onmessage = (event) => {
      const response = parseRankingWorkerResponse(event.data);
      if (!response) {
        fail('ranking_worker_response_invalid');
        return;
      }
      if (response.contextId !== contextId) return;
      if (response.kind === 'ready') {
        if (!initialization || response.requestId !== initialization.request.requestId) return;
        initialization.ready.add(index);
        if (initialization.ready.size !== workers.length) return;
        initialization = undefined;
        emit(response);
        return;
      }
      if (response.kind === 'result') {
        if (
          !calculation ||
          response.requestId !== calculation.request.requestId ||
          response.fingerprint !== calculation.fingerprint
        )
          return;
        calculation.parts[index] = response;
        if (calculation.parts.some((part) => !part)) return;
        const { request, fingerprint, parts } = calculation;
        calculation = undefined;
        const rows = parts.flatMap((part) => part!.rows);
        const exclusions = parts.flatMap((part) => part!.exclusions);
        const owners = new Map<string, number>();
        let duplicate = false;
        for (const [workerIndex, part] of parts.entries()) {
          for (const row of part!.rows) {
            if (owners.has(row.entryId)) duplicate = true;
            owners.set(row.entryId, workerIndex);
          }
        }
        if (duplicate) {
          emit({
            kind: 'error',
            status: 'failed',
            stage: 'summary',
            requestId: request.requestId,
            contextId,
            fingerprint,
            reason: 'ranking_duplicate_entry_id',
          });
          return;
        }
        ownerByEntryId = owners;
        emit({
          kind: 'result',
          requestId: request.requestId,
          contextId,
          fingerprint,
          rows,
          exclusions,
        });
        return;
      }
      if (response.kind === 'detail') {
        if (
          detail?.workerIndex !== index ||
          response.requestId !== detail.request.requestId ||
          response.entryId !== detail.request.entryId
        )
          return;
        detail = undefined;
        emit(response);
        return;
      }
      if (response.stage === 'detail') {
        if (
          detail?.workerIndex !== index ||
          response.requestId !== detail.request.requestId ||
          response.entryId !== detail.request.entryId
        )
          return;
        detail = undefined;
      } else if (response.stage === 'summary') {
        if (!calculation || response.requestId !== calculation.request.requestId) return;
        calculation = undefined;
      } else {
        if (!initialization || response.requestId !== initialization.request.requestId) return;
        initialization = undefined;
      }
      emit(response);
    };
  });
  return transport;
}
