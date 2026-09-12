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
  resolvePreparationIdentityOutcome,
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
  const structural = resolvePreparationIdentityOutcome(servant, state, resource.preparationEffects);
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
        resource.activation,
      ),
      ...resource.contextState,
      npResource: resource.resource.state,
      buffInstances: resource.buffInstances,
      ocState: resource.ocState,
      ocInputDefinitions: resource.ocInputDefinitions,
      uncertainContextWrites: resource.uncertainContextWrites,
      baseOvercharge: resource.resource.baseOvercharge,
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
            stochasticOutcome: resource.activation.get(effect)?.procOutcome ?? null,
          })),
          activationFacts: assemblePreparationActivationFacts(
            servant,
            'noblePhantasm',
            variant.ref.noblePhantasmId,
            state.currentFormId,
            variant.effects,
          ),
          transition,
          resourceBefore: state.npResource,
          resourceAfter: resource.resource.state,
          ocUse: resource.ocUse,
          ocOutcomes: resource.ocOutcomes,
          baseOvercharge: resource.resource.baseOvercharge,
        },
      ],
    },
  };
}
