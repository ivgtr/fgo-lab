import { rebaseHpMaximum, changeHpModifiers } from './hpResource';
import { resourceFailureCode } from './preparationTransaction';
import {
  actorFormKey,
  findActorForm,
  getPassivesForActorForm,
  type ServantMaster,
} from '@fgo-lab/master-data';
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
            ? execution.result.reason === 'hpMutation'
              ? 'invalidHpExecution'
              : 'invalidOcExecution'
            : [
                  'unknownHpCondition',
                  'missingHpState',
                  'hpMutation',
                  'resourceExecutionSemantics',
                ].includes(execution.result.reason)
              ? 'unsupportedHpExecution'
              : 'unsupportedOcExecution',
      execution.requiredInput,
      execution.requiredInput ? execution.occurrenceId : null,
      execution.recoveryInputDefinitions,
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
  const original = state;
  const formKey = actorFormKey(state.currentFormId);
  if (state.ocState.activeFormKey === formKey) return { status: 'applied', state };
  try {
    if (state.hp) {
      let hp = state.hp;
      if (context.maximumHpByForm) {
        const maximum = context.maximumHpByForm.get(formKey);
        if (maximum === undefined) return rejectPreparation(original, 'invalidHpExecution');
        hp = rebaseHpMaximum(
          hp,
          'attacker',
          maximum,
          `form:${state.appliedActions.length}:${formKey}`,
        );
      } else if (
        !context.planningOnly &&
        findActorForm(servant, state.currentFormId)?.baseHp.kind === 'form'
      )
        return rejectPreparation(original, 'invalidHpExecution');
      for (const actor of Object.keys(hp.actors))
        hp = changeHpModifiers(
          hp,
          actor,
          null,
          (instance) =>
            instance.actor === actor && instance.formKey !== null && instance.formKey !== formKey,
        );
      state = { ...state, hp };
    }
  } catch (error) {
    if (error instanceof RangeError) return rejectPreparation(original, 'invalidHpExecution');
    throw error;
  }
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
  const result = executePreparationPhase(
    servant,
    state,
    context,
    `form:${state.appliedActions.length}:${formKey}`,
    sources,
    formKey,
  );
  return result.status === 'rejected' ? { ...result, state: original } : result;
}
