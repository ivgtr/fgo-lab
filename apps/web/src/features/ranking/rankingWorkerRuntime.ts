import {
  calculateRankingPolicy,
  calculateRankingPolicyDetail,
  type RankingPolicyCalculation,
  type RankingPolicyConditions,
  type RankingPolicyDetail,
  type RankingProfileInput,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import {
  rankingConditionsFingerprint,
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';

interface RankingWorkerCalculators {
  calculate: typeof calculateRankingPolicy;
  detail: typeof calculateRankingPolicyDetail;
}

interface RankingWorkerContext {
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  versions: VersionContext;
}

export function createRankingWorkerRuntime(
  calculators: RankingWorkerCalculators = {
    calculate: calculateRankingPolicy,
    detail: calculateRankingPolicyDetail,
  },
) {
  let context: RankingWorkerContext | undefined;
  const conditionsByFingerprint = new Map<string, RankingPolicyConditions>();
  const calculationCache = new Map<string, RankingPolicyCalculation>();
  const detailCache = new Map<string, Map<string, RankingPolicyDetail>>();

  const handle = (request: RankingWorkerRequest): RankingWorkerResponse => {
    try {
      if (request.kind === 'initialize') {
        context = { master: request.master, profile: request.profile, versions: request.versions };
        conditionsByFingerprint.clear();
        calculationCache.clear();
        detailCache.clear();
        return { kind: 'ready', requestId: request.requestId };
      }
      if (!context) throw new TypeError('ranking_worker_not_initialized');
      if (request.kind === 'calculate') {
        const fingerprint = rankingConditionsFingerprint(request.conditions);
        const calculation =
          calculationCache.get(fingerprint) ??
          calculators.calculate(
            context.master,
            context.profile,
            request.conditions,
            context.versions,
          );
        conditionsByFingerprint.set(fingerprint, request.conditions);
        calculationCache.set(fingerprint, calculation);
        return {
          kind: 'result',
          requestId: request.requestId,
          fingerprint,
          rows: calculation.rows,
          exclusions: calculation.exclusions,
        };
      }
      const conditions = conditionsByFingerprint.get(request.fingerprint);
      const servant = context.master.servants.find(({ id }) => id === request.servantId);
      if (!conditions || !servant) throw new TypeError('ranking_detail_context_missing');
      const cached = detailCache.get(request.fingerprint)?.get(request.entryId);
      if (cached)
        return {
          kind: 'detail',
          requestId: request.requestId,
          fingerprint: request.fingerprint,
          entryId: request.entryId,
          detail: cached,
        };
      const result = calculators.detail(
        servant,
        context.master,
        context.profile,
        conditions,
        context.versions,
        request.attackProfile,
      );
      if (result.status !== 'calculated')
        throw new TypeError(`ranking_detail_${result.status}:${result.reason}`);
      const details =
        detailCache.get(request.fingerprint) ?? new Map<string, RankingPolicyDetail>();
      details.set(request.entryId, result.detail);
      detailCache.set(request.fingerprint, details);
      return {
        kind: 'detail',
        requestId: request.requestId,
        fingerprint: request.fingerprint,
        entryId: request.entryId,
        detail: result.detail,
      };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      if (request.kind === 'detail')
        return {
          kind: 'error',
          stage: 'detail',
          requestId: request.requestId,
          fingerprint: request.fingerprint,
          entryId: request.entryId,
          reason,
        };
      return {
        kind: 'error',
        stage: request.kind === 'initialize' ? 'initialization' : 'summary',
        requestId: request.requestId,
        fingerprint:
          request.kind === 'calculate' ? rankingConditionsFingerprint(request.conditions) : null,
        reason,
      };
    }
  };

  return { handle };
}
