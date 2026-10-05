import type { ActorFormId } from '@fgo-lab/master-data';
import type { SourceActivationReceipt } from './conditionRead';
import type { ConditionReadAudit } from './condition';
import type { BattleOperation } from './contracts';
import type { AppliedPreparationAction } from './preparationContracts';

export interface PhysicalInputCommit {
  readonly operationIndex: number;
  readonly inputKey: string;
  readonly before: number;
  readonly after: number;
}

/** Runtime observations come from the source transaction, never the compilation template. */
export interface SourceExecutionBinding {
  readonly actionId: string;
  readonly actorFormId: ActorFormId;
  readonly sourceInstanceId: string;
  readonly skillId: string;
  readonly occurrenceId: string;
  readonly valueSetIndex: number;
  readonly valueIndex: number;
  readonly activation: SourceActivationReceipt;
  readonly conditionReads: readonly ConditionReadAudit[];
  readonly physicalInputs: readonly PhysicalInputCommit[];
}

export function pendingNoblePhantasmSourceBinding(
  action: AppliedPreparationAction,
  sourceInstanceId: string,
  occurrenceId: string,
  valueIndex: number,
): SourceExecutionBinding {
  if (action.sourceKind !== 'attackNoblePhantasm' || !action.ocUse)
    throw new TypeError('missing_terminal_np_action_receipt');
  return {
    actionId: action.ocUse.actionId,
    actorFormId: action.actorFormId,
    sourceInstanceId,
    skillId: sourceInstanceId,
    occurrenceId,
    valueSetIndex: action.ocUse.effectiveOc - 1,
    valueIndex,
    activation: { kind: 'unread' },
    conditionReads: [],
    physicalInputs: [],
  };
}

export function bindExecutionOperation(
  operation: BattleOperation,
  binding: SourceExecutionBinding,
  canonicalOperationIndex: number,
): void {
  const commit = binding.physicalInputs.find(
    (candidate) => candidate.operationIndex === canonicalOperationIndex,
  );
  operation.runtimeBinding = { source: binding, ...(commit ? { physicalInput: commit } : {}) };
}

export function executionBindingFor(operation: BattleOperation) {
  return operation.runtimeBinding?.source;
}

export function physicalInputCommitFor(operation: BattleOperation) {
  return operation.runtimeBinding?.physicalInput;
}
