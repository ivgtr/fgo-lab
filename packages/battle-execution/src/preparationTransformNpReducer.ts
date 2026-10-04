import { requiredPreparationConditionRead } from './preparationState';
import {
  actorFormEquals,
  findNoblePhantasmVariant,
  noblePhantasmVariantKey,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationExecutionContext,
  type PreparationTransitionResult,
} from './preparationContracts';
import { assemblePreparationActivationFacts } from './preparationEvidence';
import {
  appendPreparationEffects,
  findPreparationTransition,
  formCanReachAttackWithoutPreparationNp,
} from './preparationState';
import { planPreparationResourceTransaction } from './preparationTransaction';

export function reducePreparationTransformNoblePhantasmAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: Extract<PreNoblePhantasmCommand, { kind: 'useTransformNoblePhantasm' }>,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  if (state.transformNoblePhantasmUsed)
    return rejectPreparation(state, 'transformNoblePhantasmReused');
  const ref = state.selectedNoblePhantasmVariant;
  const variant = ref ? findNoblePhantasmVariant(servant, ref) : undefined;
  if (!variant || variant.kind !== 'nonAttack')
    return rejectPreparation(state, 'transformNoblePhantasmUnavailable');
  const resource = planPreparationResourceTransaction({
    context,
    servant,
    state,
    command,
    skill: null,
    effects: variant.effects,
    valueSetIndex: context.overcharge - 1,
    valueIndex: context.npLevel - 1,
    consumeNoblePhantasm: true,
    inputSource: {
      origin: 'np',
      sourceInstanceId: `np:${noblePhantasmVariantKey(variant.ref)}`,
      skillId: `np:${noblePhantasmVariantKey(variant.ref)}`,
    },
  });
  if (resource.status === 'rejected')
    return rejectPreparation(
      state,
      resource.code,
      resource.requiredInput,
      resource.requiredInputEffectOccurrenceId,
      resource.recoveryInputDefinitions,
    );
  const transition = findPreparationTransition(
    servant,
    state,
    'noblePhantasm',
    variant.ref.noblePhantasmId,
    resource.preparationEffects,
  );
  if (typeof transition === 'string') return rejectPreparation(state, transition);
  if (!transition) return rejectPreparation(state, 'transformNoblePhantasmUnavailable');
  if (!actorFormEquals(transition.to, resource.state.currentFormId))
    return rejectPreparation(state, 'transitionAtomicity');
  if (!formCanReachAttackWithoutPreparationNp(servant, resource.state.currentFormId))
    return rejectPreparation(state, 'transformNoblePhantasmDoesNotReachAttack');
  return {
    status: 'applied',
    state: {
      ...resource.state,
      transformNoblePhantasmUsed: true,
      activeEffects: appendPreparationEffects(
        state,
        'noblePhantasm',
        variant.ref.noblePhantasmId,
        state.currentFormId,
        variant.effects,
        resource.activation,
      ),
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
            sourceActivation: requiredPreparationConditionRead(effect, resource.activation),
          })),
          activationFacts: assemblePreparationActivationFacts(
            servant,
            'noblePhantasm',
            variant.ref.noblePhantasmId,
            state.currentFormId,
            variant.effects,
          ),
          transition,
          hpBefore: state.hp,
          hpAfter: resource.state.hp,
          resourceBefore: state.npResource,
          resourceAfter: resource.state.npResource,
          resourceTransaction: resource.resourceTransaction,
          ocUse: resource.ocUse,
          ocOutcomes: resource.ocOutcomes,
          baseOvercharge: resource.baseOvercharge,
        },
      ],
    },
  };
}
