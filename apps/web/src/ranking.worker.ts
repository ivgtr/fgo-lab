/// <reference lib="webworker" />
import { calculateNpDamage } from '@fgo-lab/calc-core';
import type { CalcInput, VersionContext } from '@fgo-lab/schema';

export interface RankingCandidate {
  servantId: string;
  name: string;
  input: CalcInput;
}
export interface RankingRequest {
  requestId: string;
  candidates: RankingCandidate[];
  versions: VersionContext;
}
export interface RankingRow {
  servantId: string;
  name: string;
  average: number;
  minimum: number;
  maximum: number;
  precision: 'exact' | 'approximate';
}
export interface RankingResponse {
  requestId: string;
  rows: RankingRow[];
  unsupported: { servantId: string; name: string; reason: string }[];
}

self.onmessage = (event: MessageEvent<RankingRequest>) => {
  const rows: RankingRow[] = [];
  const unsupported: RankingResponse['unsupported'] = [];
  for (const candidate of event.data.candidates) {
    const result = calculateNpDamage(candidate.input, event.data.versions);
    if (result.precision === 'unsupported') {
      unsupported.push({
        servantId: candidate.servantId,
        name: candidate.name,
        reason: result.warnings.join(',') || 'unsupported',
      });
      continue;
    }
    const current = result.results[candidate.input.npLevel - 1];
    if (!current) continue;
    rows.push({
      servantId: candidate.servantId,
      name: candidate.name,
      average: current.average,
      minimum: current.minimum,
      maximum: current.maximum,
      precision: 'approximate',
    });
  }
  rows.sort(
    (left, right) => right.average - left.average || left.name.localeCompare(right.name, 'ja'),
  );
  self.postMessage({
    requestId: event.data.requestId,
    rows,
    unsupported,
  } satisfies RankingResponse);
};
