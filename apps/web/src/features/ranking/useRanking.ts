import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingProfileInput,
  RankingRowSummary,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { RankingWorkerRequest, RankingWorkerResponse } from './rankingWorkerProtocol';

interface RankingState {
  rows: RankingRowSummary[];
  failures: RankingFailure[];
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
  conditions: RankingConditions;
  versions: VersionContext;
}) {
  const conditionsFingerprint = useMemo(() => JSON.stringify(conditions), [conditions]);
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
    failures: [],
    fingerprint: '',
    error: '',
  });
  const [details, setDetails] = useState<{
    fingerprint: string;
    values: Record<string, RankingDetail>;
  }>({ fingerprint: '', values: {} });

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
        setState({
          rows: response.rows,
          failures: response.failures,
          fingerprint: response.fingerprint,
          error: '',
        });
        setDetails({ fingerprint: response.fingerprint, values: {} });
        return;
      }
      if (response.kind === 'detail') {
        if (response.fingerprint !== activeFingerprintRef.current) return;
        if (detailRequestsRef.current.get(response.servantId) !== response.requestId) return;
        detailRequestsRef.current.delete(response.servantId);
        if (response.detail)
          setDetails((current) =>
            current.fingerprint === response.fingerprint
              ? {
                  ...current,
                  values: { ...current.values, [response.servantId]: response.detail! },
                }
              : current,
          );
        return;
      }
      if (response.kind === 'error' && response.requestId === activeRequestRef.current)
        setState((current) => ({ ...current, error: response.message }));
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
      fingerprint: conditionsFingerprint,
      conditions,
    };
    worker.postMessage(request);
  }, [conditions, conditionsFingerprint, contextFingerprint, initializedFingerprint]);

  const requestDetail = useCallback(
    (servantId: string) => {
      const worker = workerRef.current;
      if (
        !worker ||
        initializedFingerprint !== contextFingerprint ||
        state.fingerprint !== conditionsFingerprint ||
        (details.fingerprint === conditionsFingerprint && details.values[servantId])
      )
        return;
      const requestId = crypto.randomUUID();
      detailRequestsRef.current.set(servantId, requestId);
      const request: RankingWorkerRequest = {
        kind: 'detail',
        requestId,
        fingerprint: conditionsFingerprint,
        servantId,
      };
      worker.postMessage(request);
    },
    [conditionsFingerprint, contextFingerprint, details, initializedFingerprint, state.fingerprint],
  );

  return {
    ...state,
    details: details.fingerprint === conditionsFingerprint ? details.values : {},
    requestDetail,
    loading:
      initializedFingerprint !== contextFingerprint || state.fingerprint !== conditionsFingerprint,
  };
}
