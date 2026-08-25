import { useEffect, useState } from 'react';
import type { VersionContext } from '@fgo-lab/schema';
import type { RankingCandidate, RankingResponse } from './rankingCalculation';

export function useRanking(candidates: RankingCandidate[], versions: VersionContext) {
  const fingerprint = JSON.stringify({ candidates, versions });
  const [state, setState] = useState<RankingResponse & { fingerprint: string }>({
    requestId: '',
    rows: [],
    unsupported: [],
    fingerprint: '',
  });
  useEffect(() => {
    const worker = new Worker(new URL('./ranking.worker.ts', import.meta.url), { type: 'module' });
    const requestId = crypto.randomUUID();
    const payload = JSON.parse(fingerprint) as {
      candidates: RankingCandidate[];
      versions: VersionContext;
    };
    worker.onmessage = (event: MessageEvent<RankingResponse>) => {
      if (event.data.requestId === requestId) {
        setState({ ...event.data, fingerprint });
      }
    };
    worker.postMessage({ requestId, ...payload });
    return () => worker.terminate();
  }, [fingerprint]);
  return { ...state, loading: state.fingerprint !== fingerprint };
}
