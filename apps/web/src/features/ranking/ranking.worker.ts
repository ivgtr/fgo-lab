/// <reference lib="webworker" />
import { calculateRanking, type RankingRequest } from './rankingCalculation';

self.onmessage = (event: MessageEvent<RankingRequest>) => {
  self.postMessage(calculateRanking(event.data));
};
