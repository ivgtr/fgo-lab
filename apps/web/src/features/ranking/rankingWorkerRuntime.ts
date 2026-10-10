import {
  calculateRankingPolicySummary,
  calculateRankingPolicyDetail,
  type RankingPolicyConditions,
  type RankingProfileInput,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, type VersionContext } from '@fgo-lab/schema';
import {
  rankingConditionsFingerprint,
  rankingWorkerRequestSchema,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';

class RankingWorkerInvalid extends Error {}

interface RankingWorkerCalculators {
  calculate: typeof calculateRankingPolicySummary;
  detail: typeof calculateRankingPolicyDetail;
}

interface RankingWorkerContext {
  contextId: string;
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  versions: VersionContext;
}

interface RankingWorkerSummary {
  fingerprint: string;
  rows: ReturnType<typeof calculateRankingPolicySummary>['rows'];
  exclusions: ReturnType<typeof calculateRankingPolicySummary>['exclusions'];
}

export function createRankingWorkerRuntime(
  calculators: RankingWorkerCalculators = {
    calculate: calculateRankingPolicySummary,
    detail: calculateRankingPolicyDetail,
  },
) {
  let context: RankingWorkerContext | undefined;
  let summaryCache: RankingWorkerSummary | undefined;
  let activeSummaryFingerprint = '';
  let activeConditions: RankingPolicyConditions | undefined;

  const clear = () => {
    context = undefined;
    summaryCache = undefined;
    activeSummaryFingerprint = '';
    activeConditions = undefined;
  };
  const handle = (value: unknown): RankingWorkerResponse => {
    const parsed = rankingWorkerRequestSchema.safeParse(value);
    if (!parsed.success) {
      const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      if (raw.kind === 'initialize') clear();
      const identity = {
        requestId: typeof raw.requestId === 'string' ? raw.requestId : 'invalid',
        contextId: typeof raw.contextId === 'string' ? raw.contextId : 'invalid',
      };
      const fingerprint = typeof raw.fingerprint === 'string' ? raw.fingerprint : null;
      if (raw.kind === 'detail' && typeof raw.entryId === 'string' && fingerprint !== null)
        return {
          kind: 'error',
          status: 'invalid',
          stage: 'detail',
          ...identity,
          fingerprint,
          entryId: raw.entryId,
          reason: 'rankingWorkerRequestInvalid',
        };
      return {
        kind: 'error',
        status: 'invalid',
        stage: raw.kind === 'calculate' ? 'summary' : 'initialization',
        ...identity,
        fingerprint: null,
        reason: 'rankingWorkerRequestInvalid',
      };
    }
    const request = parsed.data;
    const identity = { requestId: request.requestId, contextId: request.contextId };
    try {
      if (request.kind === 'initialize') {
        clear();
        if (
          request.versions.masterDataVersion !== request.master.version ||
          request.versions.engineVersion !== ENGINE_VERSION
        )
          throw new RankingWorkerInvalid('rankingContextVersionMismatch');
        context = {
          contextId: request.contextId,
          master: request.master,
          profile: request.profile,
          versions: request.versions,
        };
        return { kind: 'ready', ...identity };
      }
      if (!context || context.contextId !== request.contextId)
        throw new RankingWorkerInvalid('rankingContextUnavailable');
      if (request.kind === 'calculate') {
        const fingerprint = rankingConditionsFingerprint(request.conditions);
        activeSummaryFingerprint = fingerprint;
        const cached = summaryCache?.fingerprint === fingerprint ? summaryCache : undefined;
        const calculation = cached
          ? null
          : calculators.calculate(
              context.master,
              context.profile,
              request.conditions,
              context.versions,
            );
        if (calculation?.status === 'invalid')
          return {
            kind: 'error',
            stage: 'summary',
            status: 'invalid',
            ...identity,
            fingerprint,
            reason: calculation.reason,
          };
        if (calculation) {
          summaryCache = {
            fingerprint,
            rows: calculation.rows,
            exclusions: calculation.exclusions,
          };
          activeConditions = request.conditions;
        }
        const summary = summaryCache;
        if (!summary || summary.fingerprint !== fingerprint || !activeConditions)
          throw new RankingWorkerInvalid('ranking_summary_unavailable');
        return {
          kind: 'result',
          ...identity,
          fingerprint,
          rows: summary.rows,
          exclusions: summary.exclusions,
        };
      }
      const summary =
        activeSummaryFingerprint === request.fingerprint &&
        summaryCache?.fingerprint === request.fingerprint
          ? summaryCache
          : undefined;
      const conditions =
        activeSummaryFingerprint === request.fingerprint ? activeConditions : undefined;
      const row = summary?.rows.find(({ entryId }) => entryId === request.entryId);
      const servant = context.master.servants.find(({ id }) => id === row?.servantId);
      if (!conditions || !servant || !row)
        throw new RankingWorkerInvalid('ranking_detail_context_missing');
      const result = calculators.detail(
        servant,
        context.master,
        context.profile,
        conditions,
        context.versions,
        row.attackProfile,
        false,
      );
      if (result.status !== 'calculated') {
        const reason =
          result.status === 'inputRequired'
            ? result.inputs.map(({ key }) => key).join(',')
            : result.reason;
        return {
          kind: 'error',
          status: result.status,
          stage: 'detail',
          ...identity,
          fingerprint: request.fingerprint,
          entryId: request.entryId,
          reason,
        };
      }
      return {
        kind: 'detail',
        ...identity,
        fingerprint: request.fingerprint,
        entryId: request.entryId,
        detail: result.detail,
      };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      if (request.kind === 'detail')
        return {
          kind: 'error',
          status: cause instanceof RankingWorkerInvalid ? 'invalid' : 'failed',
          stage: 'detail',
          ...identity,
          fingerprint: request.fingerprint,
          entryId: request.entryId,
          reason,
        };
      return {
        kind: 'error',
        status: cause instanceof RankingWorkerInvalid ? 'invalid' : 'failed',
        stage: request.kind === 'initialize' ? 'initialization' : 'summary',
        ...identity,
        fingerprint:
          request.kind === 'calculate' ? rankingConditionsFingerprint(request.conditions) : null,
        reason,
      };
    }
  };

  return { handle };
}
