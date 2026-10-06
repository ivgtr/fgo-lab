import type { ServantMaster } from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type {
  PreparationExecutionContext,
  PreparationCompletedTransitionResult,
} from './preparationContracts';
import type {
  PreparationActionExecution,
  RejectedPreparationDiagnostic,
} from './preparationExecution';
import { reducePreNoblePhantasmAction } from './preNoblePhantasm';

/** A diagnostic continuation never makes a rejected normal action executable. */
export function diagnoseRejectedPreparation(
  servant: ServantMaster,
  rejection: Extract<PreparationCompletedTransitionResult, { status: 'rejected' }>,
  remainingCommands: readonly PreNoblePhantasmCommand[],
  context: PreparationExecutionContext,
): RejectedPreparationDiagnostic {
  const restored = structuredClone(rejection.state);
  let state = restored;
  const transitions: PreparationActionExecution[] = [];
  for (const command of remainingCommands) {
    const result = reducePreNoblePhantasmAction(servant, state, command, context);
    transitions.push(result);
    state = result.state;
  }
  return {
    kind: 'rejectedPreparationDiagnostic',
    rejection,
    restored,
    commands: remainingCommands,
    transitions,
    state,
  };
}
