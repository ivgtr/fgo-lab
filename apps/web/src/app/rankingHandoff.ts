import type { Dispatch, SetStateAction } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { AttackProfile, RankingPolicyDetail } from '@fgo-lab/calculation-application';
import type { ServantBuild } from '@fgo-lab/schema';
import {
  createCalculatorPortableRequestForAttackProfile,
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
} from '@fgo-lab/calculation-application';
import type { CalculationWorkspace, Page } from './App';
import {
  commitPortableDraft,
  type CalculationMutationGate,
  type UpdateActiveProfile,
} from './portableDraft';

export async function handoffRankingCalculation({
  detail,
  master,
  setCalculation,
  setCalculationSessionId,
  updateActiveProfile,
  replaceRoute,
  calculationMutation,
  mutationToken,
}: {
  detail: RankingPolicyDetail;
  master: MasterDataSnapshot;
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
  updateActiveProfile: UpdateActiveProfile;
  replaceRoute: (page: Page) => void;
  calculationMutation: CalculationMutationGate;
  mutationToken?: number;
}) {
  const activeMutationToken = mutationToken ?? calculationMutation.begin();
  const request = createRankingPortableRequest(detail, currentCalculationVersionContext(master));
  const outcome = executePortableCalculation(request, master);
  const result =
    outcome.status === 'executed' || outcome.status === 'unsupported'
      ? outcome.execution.result
      : undefined;
  if (!result) return outcome;
  const sessionId = crypto.randomUUID();
  const committed = await commitPortableDraft({
    request,
    result,
    sessionId,
    updateActiveProfile,
    setCalculation,
    mutationToken: activeMutationToken,
    isCurrent: calculationMutation.isCurrent,
  });
  if (!committed || !calculationMutation.isCurrent(activeMutationToken)) return outcome;
  setCalculationSessionId(sessionId);
  replaceRoute('calculate');
  return outcome;
}

export async function handoffRankingAttackProfileCalculation({
  servantId,
  attackProfile,
  master,
  profile,
  setCalculation,
  setCalculationSessionId,
  updateActiveProfile,
  replaceRoute,
  calculationMutation,
  mutationToken,
}: {
  servantId: string;
  attackProfile: AttackProfile;
  master: MasterDataSnapshot;
  profile: { servantBuilds: Readonly<Record<string, ServantBuild>> };
  setCalculation: Dispatch<SetStateAction<CalculationWorkspace>>;
  setCalculationSessionId: Dispatch<SetStateAction<string>>;
  updateActiveProfile: UpdateActiveProfile;
  replaceRoute: (page: Page) => void;
  calculationMutation: CalculationMutationGate;
  mutationToken?: number;
}) {
  const activeMutationToken = mutationToken ?? calculationMutation.begin();
  const servant = master.servants.find(({ id }) => id === servantId);
  if (!servant) return null;
  let request;
  try {
    request = createCalculatorPortableRequestForAttackProfile(
      master,
      profile.servantBuilds[servantId],
      servant,
      attackProfile,
    );
  } catch {
    return null;
  }
  const outcome = executePortableCalculation(request, master);
  const result =
    outcome.status === 'executed' || outcome.status === 'unsupported'
      ? outcome.execution.result
      : undefined;
  if (!result) return outcome;
  const sessionId = crypto.randomUUID();
  const committed = await commitPortableDraft({
    request,
    result,
    sessionId,
    updateActiveProfile,
    setCalculation,
    mutationToken: activeMutationToken,
    isCurrent: calculationMutation.isCurrent,
  });
  if (!committed || !calculationMutation.isCurrent(activeMutationToken)) return outcome;
  setCalculationSessionId(sessionId);
  replaceRoute('calculate');
  return outcome;
}
