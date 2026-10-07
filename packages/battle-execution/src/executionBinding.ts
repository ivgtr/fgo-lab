import type { ActorFormId } from '@fgo-lab/master-data';
import type { SourceActivationReceipt } from './conditionRead';
import type { ConditionReadAudit } from './condition';
import type { BattleOperation } from './contracts';
import type { AppliedPreparationAction } from './preparationContracts';
import type { InputFact } from './inputFacts';
import type { ResolvedModifierValue } from './projection';
import type { PreNoblePhantasmState } from './preparationContracts';
import type { ConditionFactProof } from './conditionRead';
import type { TraitFact } from './traitFactLayers';
import type { TraitScope } from './contracts';

type MapDelta<T> = ReadonlyMap<string, T | null>;
type ScopedMapDelta<T> = Partial<Record<TraitScope, MapDelta<T>>>;

export interface PhysicalInputCommit {
  readonly operationIndex: number;
  readonly inputKey: string;
  readonly before: InputFact;
  readonly after: InputFact;
}

export interface ModifierValueRead {
  readonly operationIndex: number;
  readonly result: ResolvedModifierValue;
}

export interface PhysicalOperationTransition {
  readonly operationIndex: number;
  readonly inputFacts?: MapDelta<InputFact>;
  readonly traitWrites?: ScopedMapDelta<TraitFact>;
  readonly externalTraits?: ScopedMapDelta<TraitFact>;
  readonly intrinsicAttacker?: PreNoblePhantasmState['traitFactLayers']['intrinsic']['attacker'];
  readonly closedScopes?: readonly [TraitScope, ConditionFactProof | null][];
  readonly traitProofs?: ScopedMapDelta<ConditionFactProof>;
  readonly suppressionProofs?: Partial<Record<'attacker' | 'target', MapDelta<ConditionFactProof>>>;
  readonly quantityProofs?: MapDelta<ConditionFactProof>;
  readonly markerProofs?: MapDelta<ConditionFactProof>;
  readonly buffInstances?: PreNoblePhantasmState['buffInstances'];
  readonly hp?: PreNoblePhantasmState['hp'];
  readonly currentFormId?: PreNoblePhantasmState['currentFormId'];
  readonly noblePhantasmVariant?: PreNoblePhantasmState['noblePhantasmVariant'];
  readonly initialTraitSuppressions?: PreNoblePhantasmState['initialTraitSuppressions'];
}

/** Runtime observations come from the source transaction, never the compilation template. */
export interface SourceExecutionBinding {
  readonly modifierReadOwner: 'nativePreparation' | 'orderedExecution';
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
  readonly modifierValueReads: readonly ModifierValueRead[];
  readonly committedPhysicalOperationIndexes: readonly number[];
  readonly sourcePhysicalCommitted: boolean;
  readonly physicalTransitions: readonly PhysicalOperationTransition[];
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
    modifierReadOwner: 'orderedExecution',
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
    modifierValueReads: [],
    committedPhysicalOperationIndexes: [],
    sourcePhysicalCommitted: false,
    physicalTransitions: [],
  };
}

export function bindExecutionOperation<TOperation extends BattleOperation>(
  operation: TOperation,
  binding: SourceExecutionBinding,
  canonicalOperationIndex: number,
): TOperation {
  if (
    binding.sourcePhysicalCommitted &&
    canonicalOperationIndex < 0 &&
    (operation.kind === 'resourceMutation' ||
      operation.kind === 'addTrait' ||
      operation.kind === 'removeTrait' ||
      operation.kind === 'suppressInitialTrait' ||
      operation.kind === 'transformActorForm' ||
      operation.kind === 'selectNoblePhantasmVariant' ||
      (operation.kind === 'preserveSemanticEffect' && operation.buffMutation !== undefined))
  )
    throw new TypeError('missing_canonical_physical_operation_binding');
  const commit = binding.physicalInputs.find(
    (candidate) => candidate.operationIndex === canonicalOperationIndex,
  );
  const modifierValueRead = binding.modifierValueReads.find(
    (candidate) => candidate.operationIndex === canonicalOperationIndex,
  );
  const physicalTransition = binding.physicalTransitions.find(
    (candidate) => candidate.operationIndex === canonicalOperationIndex,
  );
  return {
    ...operation,
    runtimeBinding: Object.freeze({
      source: binding,
      ...(commit ? { physicalInput: commit } : {}),
      ...(modifierValueRead ? { modifierValueRead } : {}),
      committedPhysical:
        binding.committedPhysicalOperationIndexes.includes(canonicalOperationIndex),
      sourcePhysicalCommitted: binding.sourcePhysicalCommitted,
      ...(physicalTransition ? { physicalTransition } : {}),
    }),
  };
}

export function executionBindingFor(operation: BattleOperation) {
  return operation.runtimeBinding?.source;
}

export function physicalInputCommitFor(operation: BattleOperation) {
  return operation.runtimeBinding?.physicalInput;
}
