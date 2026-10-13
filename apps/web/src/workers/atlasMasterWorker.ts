import { z } from 'zod';
import { normalizeCertifiedAtlasSnapshot } from '@fgo-lab/data-pipeline/browser';
import { sourceCertificateSchema } from '@fgo-lab/master-data';
import { fetchAtlasVerifiedBodies } from '../adapters/atlasSource';

const requestSchema = z.strictObject({
  kind: z.literal('generate'),
  requestId: z.string().min(1),
  certificate: sourceCertificateSchema,
});

type WorkerScope = {
  addEventListener(type: 'message', callback: (event: MessageEvent<unknown>) => void): void;
  postMessage(value: unknown, transfer?: Transferable[]): void;
};

const worker = self as unknown as WorkerScope;
worker.addEventListener('message', (event) => {
  const request = requestSchema.safeParse(event.data);
  if (!request.success) {
    worker.postMessage({ kind: 'error', requestId: null, reason: 'invalid_request' });
    return;
  }
  void (async () => {
    try {
      const verified = await fetchAtlasVerifiedBodies(request.data.certificate);
      const master = normalizeCertifiedAtlasSnapshot(verified);
      const bytes = new TextEncoder().encode(JSON.stringify(master)).buffer;
      worker.postMessage(
        {
          kind: 'ready',
          requestId: request.data.requestId,
          snapshotBytes: bytes,
          bytesFetched: verified.bytesFetched,
        },
        [bytes],
      );
    } catch (cause) {
      worker.postMessage({
        kind: 'error',
        requestId: request.data.requestId,
        reason: cause instanceof Error ? cause.message : 'unknown_error',
      });
    }
  })();
});
