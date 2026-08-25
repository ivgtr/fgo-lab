import {
  calculateDamageResolution,
  evaluateCalculationEvidence,
} from '@fgo-lab/calculation-application';
import type { DamageResolutionInput, VersionContext } from '@fgo-lab/schema';

export interface RankingCandidate {
  servantId: string;
  name: string;
  input: DamageResolutionInput;
  resolutionUnsupported: boolean;
  resolutionEvidenceKeys: string[];
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

export function calculateRanking(request: RankingRequest): RankingResponse {
  const rows: RankingRow[] = [];
  const unsupported: RankingResponse['unsupported'] = [];
  for (const candidate of request.candidates) {
    const result = calculateDamageResolution(candidate.input, request.versions);
    const evidence = evaluateCalculationEvidence([
      ...result.evidence.map((entry) => entry.key),
      ...candidate.resolutionEvidenceKeys,
    ]);
    if (
      result.status === 'unsupported' ||
      candidate.resolutionUnsupported ||
      evidence.status === 'unsupported'
    ) {
      unsupported.push({
        servantId: candidate.servantId,
        name: candidate.name,
        reason:
          [
            ...result.issues.map((issue) => issue.code),
            ...candidate.resolutionWarnings,
            ...(evidence.status === 'unsupported' ? evidence.missingEvidence : []),
          ].join(',') || 'unsupported',
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
      precision: evidence.precision,
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
  return { requestId: request.requestId, rows, unsupported };
}
