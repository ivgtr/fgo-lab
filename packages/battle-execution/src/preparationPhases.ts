import { resourceFailureCode } from './preparationTransaction';
import { actorFormKey, getPassivesForActorForm, type ServantMaster } from '@fgo-lab/master-data';
import { executePreparationOc, preparationEffectSource } from './preparationOc';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationExecutionContext,
  type PreparationTransitionResult,
} from './preparationContracts';
import type { SourceEffect } from './sourceCollection';

export function executePreparationPhase(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
  actionId: string,
  sources: readonly SourceEffect[],
  activateFormKey?: string,
): PreparationTransitionResult {
  const execution = executePreparationOc({
    servant,
    state,
    context,
    actionId,
    sources,
    activationFacts: [],
    npUse: null,
    ...(activateFormKey === undefined ? {} : { activateFormKey }),
  });
  if (execution.result.status !== 'committed')
    return rejectPreparation(
      state,
      execution.resourceFailure
        ? resourceFailureCode(execution.resourceFailure)
        : execution.result.status === 'inputRequired'
          ? 'preparationInputRequired'
          : execution.result.status === 'invalid'
            ? 'invalidOcExecution'
            : 'unsupportedOcExecution',
      execution.requiredInput,
      execution.requiredInput ? execution.occurrenceId : null,
    );
  return {
    status: 'applied',
    state: {
      ...execution.structuralState,
      ocState: execution.result.state,
      ocInputDefinitions: execution.inputDefinitions,
    },
  };
}

export function activatePreparationForm(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  const formKey = actorFormKey(state.currentFormId);
  if (state.ocState.activeFormKey === formKey) return { status: 'applied', state };
  const sources = getPassivesForActorForm(servant, state.currentFormId).flatMap((skill) =>
    skill.effects.map((effect) => ({
      ...preparationEffectSource({
        servant,
        state,
        effect,
        origin: 'passive',
        sourceInstanceId: `passive:${servant.id}`,
        skillId: skill.id,
        skillName: skill.name,
        valueSetIndex: 0,
        valueIndex: 0,
      }),
      constantFormKey: formKey,
    })),
  );
  return executePreparationPhase(
    servant,
    state,
    context,
    `form:${state.appliedActions.length}:${formKey}`,
    sources,
    formKey,
  );
}
