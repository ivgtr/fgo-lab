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
  SkillSlotRef,
} from './preparationContracts';
export { availablePreparationSkillCommands } from './preparationCommands';

export function createPreNoblePhantasmState(
  servant: ServantMaster,
  initialFormId: ActorFormId,
): PreparationTransitionResult {
  return createPreparationState(servant, initialFormId);
}

export function reducePreNoblePhantasmAction(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: PreNoblePhantasmCommand,
): PreparationTransitionResult {
  if (state.terminated) return rejectPreparation(state, 'actionAfterAttack');
  switch (command.kind) {
    case 'useSkillSlot':
      return reducePreparationSkillAction(servant, state, command);
    case 'useTransformNoblePhantasm':
      return reducePreparationTransformNoblePhantasmAction(servant, state, command);
    case 'executeAttackNoblePhantasm':
      return prepareAttackNoblePhantasm(servant, state, command);
  }
}

export function availableTransformNoblePhantasmCommand(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
): Extract<PreNoblePhantasmCommand, { kind: 'useTransformNoblePhantasm' }> | null {
  if (state.transformNoblePhantasmUsed) return null;
  const result = reducePreparationTransformNoblePhantasmAction(servant, state, {
    kind: 'useTransformNoblePhantasm',
  });
  return result.status === 'applied' ? { kind: 'useTransformNoblePhantasm' } : null;
}

export function currentFormPassives(servant: ServantMaster, state: PreNoblePhantasmState) {
  return getPassivesForActorForm(servant, state.currentFormId);
}
