import type { Dispatch, SetStateAction } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { AttackProfile, RankingPolicyDetail } from '@fgo-lab/calculation-application';
import type { ServantBuild } from '@fgo-lab/schema';
import {
  AttackProfileRequestFailure,
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
  if (!calculationMutation.isCurrent(activeMutationToken))
    return { status: 'aborted' as const, reason: 'stale' as const };
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
    signal: calculationMutation.signalFor(activeMutationToken),
  });
  if (
    committed.status !== 'committed' ||
    !committed.published ||
    !calculationMutation.isCurrent(activeMutationToken)
  )
    return { ...outcome, persistence: committed };
  setCalculationSessionId(sessionId);
  replaceRoute('calculate');
  return { ...outcome, persistence: committed };
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
  if (!calculationMutation.isCurrent(activeMutationToken))
    return { status: 'aborted' as const, reason: 'stale' as const };
  const servant = master.servants.find(({ id }) => id === servantId);
  if (!servant) return { status: 'rejected' as const, reason: 'servantUnavailable' as const };
  let request;
  try {
    request = createCalculatorPortableRequestForAttackProfile(
      master,
      profile.servantBuilds[servantId],
      servant,
      attackProfile,
    );
  } catch (error) {
    if (!(error instanceof AttackProfileRequestFailure)) throw error;
    return { status: 'rejected' as const, reason: error.reason };
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
    signal: calculationMutation.signalFor(activeMutationToken),
  });
  if (
    committed.status !== 'committed' ||
    !committed.published ||
    !calculationMutation.isCurrent(activeMutationToken)
  )
    return { ...outcome, persistence: committed };
  setCalculationSessionId(sessionId);
  replaceRoute('calculate');
  return { ...outcome, persistence: committed };
}
