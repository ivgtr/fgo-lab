import {
  findNoblePhantasmVariant,
  noblePhantasmVariantKey,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationTransitionResult,
} from './preparationContracts';

export function prepareAttackNoblePhantasm(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: Extract<PreNoblePhantasmCommand, { kind: 'executeAttackNoblePhantasm' }>,
): PreparationTransitionResult {
  const variant = state.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, state.selectedNoblePhantasmVariant)
    : undefined;
  if (!variant || variant.kind !== 'attack')
    return rejectPreparation(state, 'attackNoblePhantasmUnavailable');
  return {
    status: 'applied',
    state: {
      ...state,
      terminated: true,
      appliedActions: [
        ...state.appliedActions,
        {
          command,
          actorFormId: state.currentFormId,
          sourceKind: 'attackNoblePhantasm',
          sourceId: noblePhantasmVariantKey(variant.ref),
          selectedEffects: [],
          activationFacts: [],
          transition: null,
        },
      ],
    },
  };
}
