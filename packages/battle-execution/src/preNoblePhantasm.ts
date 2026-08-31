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

export type {
  AppliedPreparationAction,
  AppliedPreparationEffect,
  PreNoblePhantasmState,
  PreparationFailureCode,
  PreparationTransitionResult,
  PreparationExecutionContext,
  SkillSlotRef,
} from './preparationContracts';
export { availablePreparationSkillCommands } from './preparationCommands';

export function createPreNoblePhantasmState(
  servant: ServantMaster,
  initialFormId: ActorFormId,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  return createPreparationState(servant, initialFormId, context);
}

export function reducePreNoblePhantasmAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: PreNoblePhantasmCommand,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  if (state.terminated) return rejectPreparation(state, 'actionAfterAttack');
  switch (command.kind) {
    case 'useSkillSlot':
      return reducePreparationSkillAction(servant, state, command, context);
    case 'useTransformNoblePhantasm':
      return reducePreparationTransformNoblePhantasmAction(servant, state, command, context);
    case 'executeAttackNoblePhantasm':
      return prepareAttackNoblePhantasm(servant, state, command, context);
  }
}

export function availableTransformNoblePhantasmCommand(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
): Extract<PreNoblePhantasmCommand, { kind: 'useTransformNoblePhantasm' }> | null {
  if (state.transformNoblePhantasmUsed) return null;
  const result = reducePreparationTransformNoblePhantasmAction(
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
