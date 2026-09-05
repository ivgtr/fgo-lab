import type { Dispatch, SetStateAction } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { RankingPolicyDetail } from '@fgo-lab/calculation-application';
import {
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import type { CalculationWorkspace, Page } from './App';
import { commitPortableDraft, type UpdateActiveProfile } from './portableDraft';

export async function handoffRankingCalculation({
  detail,
  master,
  setCalculation,
  setCalculationSessionId,
  updateActiveProfile,
  replaceRoute,
}: {
  detail: RankingPolicyDetail;
  master: MasterDataSnapshot;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
  updateActiveProfile: UpdateActiveProfile;
  replaceRoute: (page: Page) => void;
}) {
  const request = createRankingPortableRequest(detail, currentCalculationVersionContext(master));
  const outcome = executePortableCalculation(request, master);
  const result =
    outcome.status === 'executed' || outcome.status === 'unsupported'
      ? outcome.execution.result
      : undefined;
  if (!result) return outcome;
  const sessionId = crypto.randomUUID();
  await commitPortableDraft({
    request,
    result,
    sessionId,
    updateActiveProfile,
    setCalculation,
  });
  setCalculationSessionId(sessionId);
  replaceRoute('calculate');
  return outcome;
}
