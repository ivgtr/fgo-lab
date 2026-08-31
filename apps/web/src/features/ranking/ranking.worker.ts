/// <reference lib="webworker" />
import type { RankingWorkerRequest } from './rankingWorkerProtocol';
import { createRankingWorkerRuntime } from './rankingWorkerRuntime';

const runtime = createRankingWorkerRuntime();

self.onmessage = (event: MessageEvent<RankingWorkerRequest>) => {
  self.postMessage(runtime.handle(event.data));
};
