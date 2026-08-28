import {
  actorFormEquals,
  findNoblePhantasmVariant,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationTransitionResult,
} from './preparationContracts';
import { assemblePreparationActivationFacts } from './preparationEvidence';
import {
  appendPreparationEffects,
  findPreparationTransition,
  formCanReachAttackWithoutPreparationNp,
  resolvePreparationStructuralOutcome,
} from './preparationState';

export function reducePreparationTransformNoblePhantasmAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: Extract<PreNoblePhantasmCommand, { kind: 'useTransformNoblePhantasm' }>,
): PreparationTransitionResult {
  if (state.transformNoblePhantasmUsed)
    return rejectPreparation(state, 'transformNoblePhantasmReused');
  const ref = state.selectedNoblePhantasmVariant;
  const variant = ref ? findNoblePhantasmVariant(servant, ref) : undefined;
  if (!variant || variant.kind !== 'nonAttack')
    return rejectPreparation(state, 'transformNoblePhantasmUnavailable');
  const transition = findPreparationTransition(
    servant,
    state,
    'noblePhantasm',
    variant.ref.noblePhantasmId,
    variant.effects,
  );
  if (typeof transition === 'string') return rejectPreparation(state, transition);
  if (!transition) return rejectPreparation(state, 'transformNoblePhantasmUnavailable');
  const structural = resolvePreparationStructuralOutcome(servant, state, variant.effects);
  if (typeof structural === 'string') return rejectPreparation(state, structural);
  if (!actorFormEquals(transition.to, structural.currentFormId))
    return rejectPreparation(state, 'transitionAtomicity');
  if (!formCanReachAttackWithoutPreparationNp(servant, structural.currentFormId))
    return rejectPreparation(state, 'transformNoblePhantasmDoesNotReachAttack');
  return {
    status: 'applied',
    state: {
      ...state,
      currentFormId: structural.currentFormId,
      selectedNoblePhantasmVariant: structural.selectedVariant,
      transformNoblePhantasmUsed: true,
      activeEffects: appendPreparationEffects(
        state,
        'noblePhantasm',
        variant.ref.noblePhantasmId,
        state.currentFormId,
        variant.effects,
      ),
      activeStateTraits: structural.activeStateTraits,
      appliedActions: [
        ...state.appliedActions,
        {
          command,
          actorFormId: state.currentFormId,
          sourceKind: 'noblePhantasm',
          sourceId: variant.ref.noblePhantasmId,
          selectedEffects: variant.effects.map((effect) => ({
            sourceKind: 'noblePhantasm',
            sourceId: variant.ref.noblePhantasmId,
            actorFormId: state.currentFormId,
            occurrenceId: effect.occurrenceId,
            effect,
          })),
          activationFacts: assemblePreparationActivationFacts(
            servant,
            'noblePhantasm',
            variant.ref.noblePhantasmId,
            state.currentFormId,
            variant.effects,
          ),
          transition,
        },
      ],
    },
  };
}
