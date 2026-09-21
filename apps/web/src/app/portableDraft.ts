import type { Dispatch, SetStateAction } from 'react';
import { portableCalculationFingerprint } from '@fgo-lab/workspace-domain';
import type { CalculationResult, LocalProfile, PortableCalculationRequest } from '@fgo-lab/schema';
import type { CalculationWorkspace } from './App';

export type UpdateActiveProfile = (
  update: (profile: LocalProfile) => LocalProfile,
) => Promise<void>;

export type CalculationMutationGate = {
  begin: () => number;
  isCurrent: (token: number) => boolean;
};

export async function commitPortableDraft({
  request,
  result,
  sessionId,
  updateActiveProfile,
  setCalculation,
  source = 'draft',
  mutationToken,
  isCurrent,
}: {
  request: PortableCalculationRequest;
  result: CalculationResult;
  sessionId: string;
  source?: 'draft' | 'history';
  updateActiveProfile: UpdateActiveProfile;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  mutationToken: number;
  isCurrent: (token: number) => boolean;
}): Promise<boolean> {
  const fingerprint = await portableCalculationFingerprint(request, async (data: Uint8Array) =>
    crypto.subtle.digest('SHA-256', new Uint8Array(data)),
  );
  if (!isCurrent(mutationToken)) return false;
  const now = new Date().toISOString();
  let accepted: true | undefined;
  await updateActiveProfile((current) => {
    if (!isCurrent(mutationToken)) return current;
    accepted = true;
    return {
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
    };
  });
  if (accepted !== true || !isCurrent(mutationToken)) return false;
  setCalculation({ request, storedResult: result, source });
  return true;
}

/** Start a separate calculation only after its durable draft has been committed. */
export async function startPortableDraft({
  setCalculationSessionId,
  ...draft
}: Omit<Parameters<typeof commitPortableDraft>[0], 'sessionId'> & {
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
}) {
  const sessionId = crypto.randomUUID();
  const committed = await commitPortableDraft({ ...draft, sessionId });
  if (committed && draft.isCurrent(draft.mutationToken)) setCalculationSessionId(sessionId);
  return committed;
}
