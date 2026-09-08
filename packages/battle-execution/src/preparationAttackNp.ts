import { terminalOcPreparationEffects } from './ocSourceProgram';
import {
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
import { planPreparationResourceTransaction } from './preparationTransaction';

export function prepareAttackNoblePhantasm(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: Extract<PreNoblePhantasmCommand, { kind: 'executeAttackNoblePhantasm' }>,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  const variant = state.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, state.selectedNoblePhantasmVariant)
    : undefined;
  if (!variant || variant.kind !== 'attack')
    return rejectPreparation(state, 'attackNoblePhantasmUnavailable');
  const resource = planPreparationResourceTransaction({
    context,
    servant,
    state,
    command,
    skill: null,
    effects: terminalOcPreparationEffects(variant.effects),
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
  return {
    status: 'applied',
    state: {
      ...state,
      terminated: true,
      npResource: resource.resource.state,
      ocState: resource.ocState,
      ocInputDefinitions: resource.ocInputDefinitions,
      uncertainContextWrites: resource.uncertainContextWrites,
      baseOvercharge: resource.resource.baseOvercharge,
      appliedActions: [
        ...state.appliedActions,
        {
          command,
          actorFormId: state.currentFormId,
          sourceKind: 'attackNoblePhantasm',
          sourceId: noblePhantasmVariantKey(variant.ref),
          selectedEffects: terminalOcPreparationEffects(variant.effects).map((effect) => ({
            sourceKind: 'noblePhantasm',
            sourceId: variant.ref.noblePhantasmId,
            actorFormId: state.currentFormId,
            occurrenceId: effect.occurrenceId,
            effect,
            stochasticOutcome: resource.activation.get(effect)?.procOutcome ?? null,
          })),
          activationFacts: [],
          transition: null,
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
