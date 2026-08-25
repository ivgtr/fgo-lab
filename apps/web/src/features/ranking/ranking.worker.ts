/// <reference lib="webworker" />
import { calculateNpDamage } from '@fgo-lab/calc-core';
import type { DamageResolutionInput, VersionContext } from '@fgo-lab/schema';

export interface RankingCandidate {
  servantId: string;
  name: string;
  input: DamageResolutionInput;
  resolutionPrecision: 'exact' | 'approximate' | 'unsupported';
  resolutionWarnings: string[];
  classId: string;
  rarity: number;
  npCard: string;
  npTarget: string;
  owned: boolean;
}
export interface RankingRequest {
  requestId: string;
  candidates: RankingCandidate[];
  versions: VersionContext;
  releaseValidated: boolean;
}
export interface RankingRow {
  servantId: string;
  name: string;
  average: number;
  minimum: number;
  maximum: number;
  precision: 'exact' | 'approximate';
  classId: string;
  rarity: number;
  npCard: string;
  npTarget: string;
  owned: boolean;
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
    if (result.status === 'unsupported' || candidate.resolutionPrecision === 'unsupported') {
      unsupported.push({
        servantId: candidate.servantId,
        name: candidate.name,
        reason:
          [...result.issues.map((issue) => issue.code), ...candidate.resolutionWarnings].join(
            ',',
          ) || 'unsupported',
      });
      continue;
    }
    const current = result.rows[candidate.input.npLevel - 1];
    if (!current) continue;
    rows.push({
      servantId: candidate.servantId,
      name: candidate.name,
      average: current.average,
      minimum: current.minimum,
      maximum: current.maximum,
      precision:
        !event.data.releaseValidated ||
        result.precision === 'approximate' ||
        candidate.resolutionPrecision === 'approximate'
          ? 'approximate'
          : 'exact',
      classId: candidate.classId,
      rarity: candidate.rarity,
      npCard: candidate.npCard,
      npTarget: candidate.npTarget,
      owned: candidate.owned,
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
