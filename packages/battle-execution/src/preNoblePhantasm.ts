import { preparationBattlePointScope } from './preparationAttemptObservation';
import {
  beginPreparationExecution,
  finishPreparationExecution,
  abandonPreparationExecution,
} from './preparationExecution';
import { activatePreparationForm, executePreparationPhase } from './preparationPhases';
import {
  getPassivesForActorForm,
  type ActorFormId,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import { prepareAttackNoblePhantasm } from './preparationAttackNp';
import {
  rejectPreparation,
  type PreNoblePhantasmState,
  type PreparationTransitionResult,
  type PreparationExecutionContext,
} from './preparationContracts';
import { reducePreparationSkillAction } from './preparationSkillReducer';
import { createPreparationState } from './preparationState';
import { reducePreparationTransformNoblePhantasmAction } from './preparationTransformNpReducer';
import { reconcilePreparationBattlePoints } from './battlePointResource';

export type {
  AppliedPreparationAction,
  AppliedPreparationEffect,
  PreNoblePhantasmState,
  PreparationFailureCode,
  PreparationCompletedTransitionResult as PreparationTransitionResult,
  PreparationExecutionContext,
  SkillSlotRef,
} from './preparationContracts';
export { availablePreparationSkillCommands } from './preparationCommands';

export function createPreNoblePhantasmState(
  servant: ServantMaster,
  initialFormId: ActorFormId,
  context: PreparationExecutionContext,
): import('./preparationExecution').PreparationInitializationExecution {
  const created = createPreparationState(servant, initialFormId, context);
  beginPreparationExecution(context);
  try {
    const initialized =
      created.status === 'rejected'
        ? created
        : initializePreparation(servant, created.state, context);
    return finishPreparationExecution(context, null, created.state, initialized);
  } catch (error) {
    abandonPreparationExecution(context);
    throw error;
  }
}

function initializePreparation(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  const form = activatePreparationForm(servant, state, context);
  if (form.status === 'rejected') return { ...form, state };
  const initial = executePreparationPhase(
    servant,
    form.state,
    context,
    'initial',
    context.initialSources ?? [],
  );
  return initial.status === 'rejected'
    ? { ...initial, state }
    : { ...initial, state: reconcilePreparationBattlePoints(servant, initial.state, context) };
}

export function reducePreNoblePhantasmAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: PreNoblePhantasmCommand,
  context: PreparationExecutionContext,
): import('./preparationExecution').PreparationActionExecution {
  beginPreparationExecution(context);
  try {
    const result = reducePreparationAction(servant, state, command, context);
    return finishPreparationExecution(context, command, state, result);
  } catch (error) {
    abandonPreparationExecution(context);
    throw error;
  }
}

function reducePreparationAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: PreNoblePhantasmCommand,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  if (state.terminated) return rejectPreparation(state, 'actionAfterAttack');
  const reduce = (): PreparationTransitionResult => {
    switch (command.kind) {
      case 'useSkillSlot':
        return reducePreparationSkillAction(servant, state, command, context);
      case 'useTransformNoblePhantasm':
        return reducePreparationTransformNoblePhantasmAction(servant, state, command, context);
      case 'executeAttackNoblePhantasm': {
        let current = state;
        const groups = new Map<
          string,
          NonNullable<PreparationExecutionContext['terminalSources']>[number][]
        >();
        for (const source of context.terminalSources ?? []) {
          const key = JSON.stringify([source.origin, source.sourceInstanceId, source.skillId]);
          const group = groups.get(key) ?? [];
          group.push(source);
          groups.set(key, group);
        }
        for (const [key, sources] of groups) {
          const phase = executePreparationPhase(
            servant,
            current,
            context,
            `external:${key}`,
            sources,
          );
          if (phase.status === 'rejected') return { ...phase, state };
          current = phase.state;
        }
        const result = prepareAttackNoblePhantasm(servant, current, command, context);
        return result.status === 'rejected' ? { ...result, state } : result;
      }
    }
  };
  const result = reduce();
  if (result.status === 'rejected') return result;
  const form = activatePreparationForm(servant, result.state, context);
  if (form.status === 'rejected') return { ...form, state };
  const reconciled = reconcilePreparationBattlePoints(servant, form.state, context);
  const capture = preparationBattlePointScope(context);
  if (capture)
    capture.push({
      kind: 'reconcile',
      owner: 'reducer',
      actionId: null,
      source: null,
      before: form.state,
      after: reconciled,
      domains: context.battlePointDomains,
    });
  const actions = reconciled.appliedActions;
  const last = actions.at(-1);
  return {
    ...form,
    state: last
      ? {
          ...reconciled,
          appliedActions: [
            ...actions.slice(0, -1),
            { ...last, resourceAfter: reconciled.npResource, hpAfter: reconciled.hp },
          ],
        }
      : reconciled,
  };
}

export function availableTransformNoblePhantasmCommand(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
): Extract<PreNoblePhantasmCommand, { kind: 'useTransformNoblePhantasm' }> | null {
  if (state.transformNoblePhantasmUsed) return null;
  const result = reducePreNoblePhantasmAction(
    servant,
    state,
    { kind: 'useTransformNoblePhantasm' },
    context,
  );
  return result.status === 'applied' ? { kind: 'useTransformNoblePhantasm' } : null;
}

export function currentFormPassives(servant: ServantMaster, state: PreNoblePhantasmState) {
  return getPassivesForActorForm(servant, state.currentFormId);
}
