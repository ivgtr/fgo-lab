import type { Dispatch, SetStateAction } from 'react';
import { portableCalculationFingerprint } from '@fgo-lab/workspace-domain';
import type { CalculationResult, LocalProfile, PortableCalculationRequest } from '@fgo-lab/schema';
import type { CalculationWorkspace } from './App';

export type UpdateActiveProfile = (
  update: (profile: LocalProfile) => LocalProfile,
) => Promise<void>;

export async function commitPortableDraft({
  request,
  result,
  sessionId,
  updateActiveProfile,
  setCalculation,
}: {
  request: PortableCalculationRequest;
  result: CalculationResult;
  sessionId: string;
  updateActiveProfile: UpdateActiveProfile;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
}) {
  const fingerprint = await portableCalculationFingerprint(request, async (data: Uint8Array) =>
    crypto.subtle.digest('SHA-256', new Uint8Array(data)),
  );
  const now = new Date().toISOString();
  await updateActiveProfile((current) => ({
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
  }));
  setCalculation({ request, storedResult: result, source: 'draft' });
}
