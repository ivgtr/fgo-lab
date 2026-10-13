import type { SourceCertificate } from '@fgo-lab/master-data';

export interface GeneratedAtlasMaster {
  snapshotBytes: ArrayBuffer;
  bytesFetched: number;
}

export function generateAtlasMaster(
  certificate: SourceCertificate,
  signal?: AbortSignal,
): Promise<GeneratedAtlasMaster> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/atlasMasterWorker.ts', import.meta.url), {
      type: 'module',
    });
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => fail(new Error('atlas_master_worker_timeout')), 5 * 60_000);
    const abort = () => fail(new DOMException('Aborted', 'AbortError'));
    const dispose = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const fail = (cause: Error) => {
      dispose();
      reject(cause);
    };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => fail(new Error('atlas_master_worker_error'));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!value || typeof value !== 'object')
        return fail(new TypeError('atlas_master_worker_invalid_reply'));
      const reply = value as Record<string, unknown>;
      if (reply['requestId'] !== requestId)
        return fail(new TypeError('atlas_master_worker_wrong_request'));
      if (reply['kind'] === 'error')
        return fail(
          new Error(
            typeof reply['reason'] === 'string' ? reply['reason'] : 'atlas_master_worker_error',
          ),
        );
      if (
        reply['kind'] !== 'ready' ||
        !(reply['snapshotBytes'] instanceof ArrayBuffer) ||
        typeof reply['bytesFetched'] !== 'number' ||
        !Number.isSafeInteger(reply['bytesFetched']) ||
        reply['bytesFetched'] < 0
      )
        return fail(new TypeError('atlas_master_worker_invalid_reply'));
      dispose();
      resolve({ snapshotBytes: reply['snapshotBytes'], bytesFetched: reply['bytesFetched'] });
    };
    worker.postMessage({ kind: 'generate', requestId, certificate });
  });
}
