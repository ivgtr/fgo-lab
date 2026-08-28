import {
  actorFormEquals,
  getInitialActorForms,
  type ActorFormId,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';

export function getAttackReachableActorFormStates(
  servant: ServantMaster,
  initialFormId: ActorFormId,
) {
  return planPreNoblePhantasmCandidates(servant)
    .candidates.filter(({ terminalState }) =>
      actorFormEquals(terminalState.initialFormId, initialFormId),
    )
    .map(({ terminalState }) => terminalState);
}

export function getAttackReachableInitialActorForms(servant: ServantMaster) {
  return getInitialActorForms(servant).filter(
    ({ id }) => getAttackReachableActorFormStates(servant, id).length > 0,
  );
}
