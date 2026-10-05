import type { ResolvedRankingBasis } from '@fgo-lab/schema';
import {
  actorFormEquals,
  getInitialActorForms,
  type ActorFormId,
  type CanonicalNpResourceSemantics,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';

export function getAttackReachableActorFormStates(
  servant: ServantMaster,
  initialFormId: ActorFormId,
  resourceSemantics: CanonicalNpResourceSemantics,
  skillLevels: ResolvedRankingBasis['skillLevels'],
  npLevel: 1 | 2 | 3 | 4 | 5,
  initialOvercharge: 1 | 2 | 3,
) {
  return planPreNoblePhantasmCandidates(
    servant,
    resourceSemantics,
    skillLevels,
    npLevel,
    initialOvercharge,
    initialOvercharge * resourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
  )
    .candidates.filter(({ terminalState }) =>
      actorFormEquals(terminalState.initialFormId, initialFormId),
    )
    .map(({ terminalState }) => terminalState);
}

export function getAttackReachableInitialActorForms(
  servant: ServantMaster,
  resourceSemantics: CanonicalNpResourceSemantics,
  skillLevels: ResolvedRankingBasis['skillLevels'],
  npLevel: 1 | 2 | 3 | 4 | 5,
  initialOvercharge: 1 | 2 | 3,
) {
  return getInitialActorForms(servant).filter(
    ({ id }) =>
      getAttackReachableActorFormStates(
        servant,
        id,
        resourceSemantics,
        skillLevels,
        npLevel,
        initialOvercharge,
      )
        .length > 0,
  );
}
