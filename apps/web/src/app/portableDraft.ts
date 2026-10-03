import type { Dispatch, SetStateAction } from 'react';
import { portableCalculationFingerprint } from '@fgo-lab/workspace-domain';
import type { ProfileWriteGuard, ProfileWriteResult } from '@fgo-lab/profile-domain';
import type { CalculationResult, LocalProfile, PortableCalculationRequest } from '@fgo-lab/schema';
import type { CalculationWorkspace } from './App';

export type UpdateActiveProfile = (
  update: (profile: LocalProfile) => LocalProfile,
  guard?: ProfileWriteGuard,
) => Promise<ProfileWriteResult>;
export type CalculationMutationGate = {
  begin: () => number;
  isCurrent: (token: number) => boolean;
  signalFor: (token: number) => AbortSignal;
};
export function createCalculationMutationGate(): CalculationMutationGate {
  let token = 0;
  let controller = new AbortController();
  return {
    begin: () => {
      controller.abort();
      controller = new AbortController();
      return ++token;
    },
    isCurrent: (candidate) => candidate === token,
    signalFor: (candidate) => (candidate === token ? controller.signal : AbortSignal.abort()),
  };
}
export type PortableDraftCommitResult =
  { status: 'committed'; published: boolean } | { status: 'aborted'; reason: 'stale' };
export async function commitPortableDraft({
  request,
  result,
  sessionId,
  updateActiveProfile,
  setCalculation,
  source = 'draft',
  mutationToken,
  isCurrent,
  signal,
}: {
  request: PortableCalculationRequest;
  result: CalculationResult;
  sessionId: string;
  source?: 'draft' | 'history';
  updateActiveProfile: UpdateActiveProfile;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  mutationToken: number;
  isCurrent: (token: number) => boolean;
  signal: AbortSignal;
}): Promise<PortableDraftCommitResult> {
  const guard = { signal, isCurrent: () => !signal.aborted && isCurrent(mutationToken) };
  if (!guard.isCurrent()) return { status: 'aborted', reason: 'stale' };
  const fingerprint = await portableCalculationFingerprint(request, (data) =>
    crypto.subtle.digest('SHA-256', new Uint8Array(data)),
  );
  if (!guard.isCurrent()) return { status: 'aborted', reason: 'stale' };
  const now = new Date().toISOString();
  const outcome = await updateActiveProfile(
    (current) => ({
      ...current,
      draft: {
        profileId: current.profileId,
        calculationSessionId: sessionId,
        request,
        result,
        requestFingerprint: fingerprint,
        updatedAt: now,
      },
      updatedAt: now,
    }),
    guard,
  );
  if (outcome.status === 'aborted') return outcome;
  const published = guard.isCurrent();
  if (published) setCalculation({ request, storedResult: result, source });
  return { status: 'committed', published };
}
/** Start a separate calculation only after its durable draft has been committed. */
export async function startPortableDraft({
  setCalculationSessionId,
  ...draft
}: Omit<Parameters<typeof commitPortableDraft>[0], 'sessionId'> & {
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
}) {
  const sessionId = crypto.randomUUID();
  const outcome = await commitPortableDraft({ ...draft, sessionId });
  if (outcome.status === 'committed' && outcome.published && draft.isCurrent(draft.mutationToken))
    setCalculationSessionId(sessionId);
  return outcome;
}
