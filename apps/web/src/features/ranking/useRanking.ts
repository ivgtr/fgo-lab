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
  type RankingWorkerRequest,
  type RankingWorkerResponse,
} from './rankingWorkerProtocol';

interface RankingState {
  rows: RankingRowSummary[];
  exclusions: RankingPolicyExclusion[];
  fingerprint: string;
  error: string;
}

export function useRanking({
  master,
  profile,
  conditions,
  versions,
}: {
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  conditions: RankingPolicyConditions;
  versions: VersionContext;
}) {
  const conditionsFingerprint = useMemo(
    () => rankingConditionsFingerprint(conditions),
    [conditions],
  );
  const profileFingerprint = useMemo(() => JSON.stringify(profile), [profile]);
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
  });
  const [details, setDetails] = useState<{
    fingerprint: string;
    values: Record<string, RankingPolicyDetail>;
  }>({ fingerprint: '', values: {} });
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const worker = new Worker(new URL('./ranking.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const initializeRequestId = crypto.randomUUID();
    worker.onmessage = (event: MessageEvent<RankingWorkerResponse>) => {
      const response = event.data;
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
          fingerprint: response.fingerprint,
          error: '',
        });
        setDetails({ fingerprint: response.fingerprint, values: {} });
        setDetailErrors({});
        return;
      }
      if (response.kind === 'detail') {
        if (response.fingerprint !== activeFingerprintRef.current) return;
        if (detailRequestsRef.current.get(response.entryId) !== response.requestId) return;
        detailRequestsRef.current.delete(response.entryId);
        setDetails((current) =>
          current.fingerprint === response.fingerprint
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
        setState((current) => ({ ...current, error: response.reason }));
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
        response.fingerprint === activeFingerprintRef.current
      )
        setState((current) => ({ ...current, error: response.reason }));
    };
    const request: RankingWorkerRequest = {
      kind: 'initialize',
      requestId: initializeRequestId,
      master,
      profile: stableProfile,
      versions: stableVersions,
    };
    worker.postMessage(request);
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = undefined;
    };
  }, [contextFingerprint, master, stableProfile, stableVersions]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || initializedFingerprint !== contextFingerprint) return;
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    activeFingerprintRef.current = conditionsFingerprint;
    detailRequestsRef.current.clear();
    const request: RankingWorkerRequest = {
      kind: 'calculate',
      requestId,
      conditions,
    };
    worker.postMessage(request);
  }, [conditions, conditionsFingerprint, contextFingerprint, initializedFingerprint]);

  const requestDetail = useCallback(
    (row: Pick<RankingRowSummary, 'entryId' | 'servantId' | 'attackProfile'>) => {
      const worker = workerRef.current;
      if (
        !worker ||
        initializedFingerprint !== contextFingerprint ||
        state.fingerprint !== conditionsFingerprint ||
        (details.fingerprint === conditionsFingerprint && details.values[row.entryId])
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
        servantId: row.servantId,
        attackProfile: row.attackProfile,
      };
      worker.postMessage(request);
    },
    [conditionsFingerprint, contextFingerprint, details, initializedFingerprint, state.fingerprint],
  );

  return {
    ...state,
    details: details.fingerprint === conditionsFingerprint ? details.values : {},
    detailErrors,
    requestDetail,
    loading:
      initializedFingerprint !== contextFingerprint || state.fingerprint !== conditionsFingerprint,
  };
}
