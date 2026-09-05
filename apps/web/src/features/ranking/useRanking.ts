import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RankingPolicyConditions,
  RankingPolicyDetail,
  RankingPolicyExclusion,
  RankingProfileInput,
  RankingRowSummary,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import {
  rankingConditionsFingerprint,
  parseRankingWorkerResponse,
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';

interface RankingState {
  rows: RankingRowSummary[];
  exclusions: RankingPolicyExclusion[];
  fingerprint: string;
  error: string;
  errorIdentity: string;
}

export function useRanking({
  master,
  profile,
  conditions,
  versions,
}: {
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  conditions: RankingPolicyConditions | null;
  versions: VersionContext;
}) {
  const conditionsFingerprint = useMemo(
    () => (conditions ? rankingConditionsFingerprint(conditions) : ''),
    [conditions],
  );
  const profileFingerprint = useMemo(
    () => JSON.stringify({ servantBuilds: profile.servantBuilds }),
    [profile],
  );
  const versionsFingerprint = useMemo(() => JSON.stringify(versions), [versions]);
  const stableProfile = useMemo(
    () => JSON.parse(profileFingerprint) as RankingProfileInput,
    [profileFingerprint],
  );
  const stableVersions = useMemo(
    () => JSON.parse(versionsFingerprint) as VersionContext,
    [versionsFingerprint],
  );
  const contextFingerprint = `${master.version}:${profileFingerprint}:${versionsFingerprint}`;
  const workerRef = useRef<Worker | undefined>(undefined);
  const activeRequestRef = useRef('');
  const activeFingerprintRef = useRef('');
  const detailRequestsRef = useRef(new Map<string, string>());
  const [initializedFingerprint, setInitializedFingerprint] = useState('');
  const [state, setState] = useState<RankingState>({
    rows: [],
    exclusions: [],
    fingerprint: '',
    error: '',
    errorIdentity: '',
  });
  const [details, setDetails] = useState<{
    fingerprint: string;
    values: Record<string, RankingPolicyDetail>;
  }>({ fingerprint: '', values: {} });
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  const enabled = !!conditions;
  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(new URL('./ranking.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const initializeRequestId = crypto.randomUUID();
    worker.onmessage = (event: MessageEvent<RankingWorkerResponse>) => {
      if (workerRef.current !== worker) return;
      const response = parseRankingWorkerResponse(event.data);
      if (!response || response.contextId !== contextFingerprint) return;
      if (response.kind === 'ready' && response.requestId === initializeRequestId) {
        setInitializedFingerprint(contextFingerprint);
        return;
      }
      if (response.kind === 'result') {
        if (response.requestId !== activeRequestRef.current) return;
        if (response.fingerprint !== activeFingerprintRef.current) return;
        setState({
          rows: response.rows,
          exclusions: response.exclusions,
          fingerprint: `${contextFingerprint}:${response.fingerprint}`,
          error: '',
          errorIdentity: '',
        });
        setDetails({ fingerprint: `${contextFingerprint}:${response.fingerprint}`, values: {} });
        setDetailErrors({});
        return;
      }
      if (response.kind === 'detail') {
        if (response.fingerprint !== activeFingerprintRef.current) return;
        if (detailRequestsRef.current.get(response.entryId) !== response.requestId) return;
        detailRequestsRef.current.delete(response.entryId);
        setDetails((current) =>
          current.fingerprint === `${contextFingerprint}:${response.fingerprint}`
            ? {
                ...current,
                values: { ...current.values, [response.entryId]: response.detail },
              }
            : current,
        );
        return;
      }
      if (
        response.kind === 'error' &&
        response.stage === 'initialization' &&
        response.requestId === initializeRequestId
      ) {
        setState((current) => ({
          ...current,
          error: response.reason,
          errorIdentity: `${contextFingerprint}:${response.fingerprint ?? ''}`,
        }));
        return;
      }
      if (response.kind === 'error' && response.stage === 'detail') {
        if (response.fingerprint !== activeFingerprintRef.current) return;
        if (detailRequestsRef.current.get(response.entryId) !== response.requestId) return;
        detailRequestsRef.current.delete(response.entryId);
        setDetailErrors((current) => ({ ...current, [response.entryId]: response.reason }));
        return;
      }
      if (
        response.kind === 'error' &&
        response.requestId === activeRequestRef.current &&
        (response.fingerprint === null || response.fingerprint === activeFingerprintRef.current)
      )
        setState((current) => ({
          ...current,
          error: response.reason,
          errorIdentity: `${contextFingerprint}:${response.fingerprint ?? ''}`,
        }));
    };
    const request: RankingWorkerRequest = {
      kind: 'initialize',
      requestId: initializeRequestId,
      contextId: contextFingerprint,
      master,
      profile: stableProfile,
      versions: stableVersions,
    };
    worker.postMessage(request);
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = undefined;
    };
  }, [contextFingerprint, master, stableProfile, stableVersions, enabled]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!conditions || !worker || initializedFingerprint !== contextFingerprint) return;
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    activeFingerprintRef.current = conditionsFingerprint;
    detailRequestsRef.current.clear();
    const request: RankingWorkerRequest = {
      kind: 'calculate',
      requestId,
      conditions,
      contextId: contextFingerprint,
    };
    worker.postMessage(request);
  }, [conditions, conditionsFingerprint, contextFingerprint, initializedFingerprint]);

  const requestDetail = useCallback(
    (row: Pick<RankingRowSummary, 'entryId' | 'servantId' | 'attackProfile'>) => {
      const worker = workerRef.current;
      if (
        !worker ||
        initializedFingerprint !== contextFingerprint ||
        state.fingerprint !== `${contextFingerprint}:${conditionsFingerprint}` ||
        (details.fingerprint === `${contextFingerprint}:${conditionsFingerprint}` &&
          details.values[row.entryId])
      )
        return;
      const requestId = crypto.randomUUID();
      setDetailErrors((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== row.entryId)),
      );
      detailRequestsRef.current.set(row.entryId, requestId);
      const request: RankingWorkerRequest = {
        kind: 'detail',
        requestId,
        fingerprint: conditionsFingerprint,
        entryId: row.entryId,
        contextId: contextFingerprint,
      };
      worker.postMessage(request);
    },
    [conditionsFingerprint, contextFingerprint, details, initializedFingerprint, state.fingerprint],
  );

  const current =
    !!conditions && state.fingerprint === `${contextFingerprint}:${conditionsFingerprint}`;
  const error =
    conditions &&
    (state.errorIdentity === `${contextFingerprint}:${conditionsFingerprint}` ||
      state.errorIdentity === `${contextFingerprint}:`)
      ? state.error
      : '';
  return {
    ...state,
    error,
    rows: current ? state.rows : [],
    exclusions: current ? state.exclusions : [],
    details:
      current && details.fingerprint === `${contextFingerprint}:${conditionsFingerprint}`
        ? details.values
        : {},
    detailErrors: current ? detailErrors : {},
    requestDetail,
    loading:
      !!conditions &&
      !error &&
      (initializedFingerprint !== contextFingerprint ||
        state.fingerprint !== `${contextFingerprint}:${conditionsFingerprint}`),
  };
}
