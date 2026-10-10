import { physicalInputCommitFor } from './executionBinding';
import { exactInputFactValue } from './inputFacts';
import type { ConditionFactProof } from './conditionRead';
import type {
  OperationResult,
  ExecutionIssue,
  BattleOperation,
  ExecutableBattleState,
} from './contracts';
import type {
  ResolvedCanonicalInputSet,
  ContributionApplicationPolicy,
  PreparedOrderedScenario,
} from './executionTypes';
import { contributionIsIncluded } from './effectiveContributions';
import {
  fixedConstraintFactsFromState,
  validateConstraintSet,
  type SatisfiableConditionConstraint,
} from './constraints';
import { applyInitialTraitSuppression, applyTraitAddition, applyTraitRemoval } from './state';
import { needsMutationValidation } from './variantSelection';
import {
  applyOrderedCriticalStarsMutation,
  applyOrderedQuantityMutation,
} from './resourceSemantics';
import { markOperationGroupUnsupported } from './candidateRollback';
import {
  mutationAuditAddress,
  auditValuesEqual,
  battleStateRestoredToGroupStart,
  collectAppliedOperationIds,
  appendExecutionGroupAudit,
  type MutableCandidateStateAudit,
  type PendingMutationAuditEvent,
} from './candidateStateAudit';

export function groupHasMissingActiveInput(
  results: readonly OperationResult[],
  issues: readonly ExecutionIssue[],
  missingDefinitions: ResolvedCanonicalInputSet['missingDefinitions'],
  activations: ReadonlyMap<string, { enabled: boolean }>,
  policy: ContributionApplicationPolicy,
): boolean {
  if (
    issues.some(
      (issue) =>
        issue.kind !== 'unsupportedOperation' || issue.detail !== 'modifier_value_quantity_missing',
    )
  )
    return false;
  return missingDefinitions.some((definition) =>
    results.some(
      (result) =>
        result.operation.inputDefinitions.some((input) => input.key === definition.key) &&
        activations.get(result.operation.operationId)?.enabled === true &&
        result.conditionRead.truth !== false &&
        contributionIsIncluded(result.operation, result.conditionRead, policy) &&
        (result.outcome === 'applied' ||
          (result.valueDependencyRead?.kind === 'inputRequired' &&
            result.valueDependencyRead.evidence.some(
              ({ expression }) =>
                expression.kind === 'inputQuantity' && expression.inputKey === definition.key,
            ))),
    ),
  );
}

export function recordCommittedGroup(args: {
  audit: MutableCandidateStateAudit;
  pendingMutationEvents: PendingMutationAuditEvent[];
  results: readonly OperationResult[];
  initialGroupResultIndex: number;
  groupIndex: number;
  operationGroup: readonly BattleOperation[];
}): void {
  appendExecutionGroupAudit({
    audit: args.audit,
    groupIndex: args.groupIndex,
    operationGroup: args.operationGroup,
    operationIdsApplied: collectAppliedOperationIds(args.results, args.initialGroupResultIndex),
    outcome: 'committed',
    issues: [],
    pendingMutationEvents: args.pendingMutationEvents,
    restoredState: null,
    rollbackProof: null,
  });
}

export function recordMissingInputRollback(args: {
  audit: MutableCandidateStateAudit | undefined;
  pendingMutationEvents: PendingMutationAuditEvent[] | null;
  results: readonly OperationResult[];
  initialGroupResultIndex: number;
  groupIndex: number;
  operationGroup: readonly BattleOperation[];
  initialGroupState: ExecutableBattleState;
  initialGroupInput: PreparedOrderedScenario['baseInput'];
  state: ExecutableBattleState;
  input: PreparedOrderedScenario['baseInput'];
}): void {
  const {
    audit,
    pendingMutationEvents,
    results,
    initialGroupResultIndex,
    groupIndex,
    operationGroup,
    initialGroupState,
    initialGroupInput,
    state,
    input,
  } = args;
  if (!audit || !pendingMutationEvents) return;
  appendExecutionGroupAudit({
    audit,
    groupIndex,
    operationGroup,
    operationIdsApplied: collectAppliedOperationIds(results, initialGroupResultIndex),
    outcome: 'rolledBack',
    issues: [],
    pendingMutationEvents,
    restoredState: initialGroupState,
    rollbackProof: {
      battleStateRestored: battleStateRestoredToGroupStart(initialGroupState, state),
      damageInputRestored: auditValuesEqual(initialGroupInput, input),
    },
  });
}

export function rollbackUnsupportedGroup(args: {
  audit: MutableCandidateStateAudit | undefined;
  pendingMutationEvents: PendingMutationAuditEvent[] | null;
  results: OperationResult[];
  initialGroupResultIndex: number;
  groupIndex: number;
  operationGroup: readonly BattleOperation[];
  initialGroupState: ExecutableBattleState;
  initialGroupInput: PreparedOrderedScenario['baseInput'];
  issues: readonly ExecutionIssue[];
}): ExecutableBattleState {
  const attemptedAppliedOperationIds = args.audit
    ? collectAppliedOperationIds(args.results, args.initialGroupResultIndex)
    : null;
  const state = {
    ...args.initialGroupState,
    unresolved: [...args.initialGroupState.unresolved, ...args.issues],
  };
  markOperationGroupUnsupported(args.results, args.initialGroupResultIndex, state, args.issues);
  if (args.audit && args.pendingMutationEvents && attemptedAppliedOperationIds)
    appendExecutionGroupAudit({
      audit: args.audit,
      groupIndex: args.groupIndex,
      operationGroup: args.operationGroup,
      operationIdsApplied: attemptedAppliedOperationIds,
      outcome: 'rolledBack',
      issues: [...args.issues],
      pendingMutationEvents: args.pendingMutationEvents,
      restoredState: args.initialGroupState,
      rollbackProof: {
        battleStateRestored: battleStateRestoredToGroupStart(args.initialGroupState, state),
        damageInputRestored: auditValuesEqual(args.initialGroupInput, args.initialGroupInput),
      },
    });
  return state;
}

export function recordPreparationPhysicalInput(
  operation: BattleOperation,
  operationSequence: number,
  pending: PendingMutationAuditEvent[] | null,
): boolean {
  const physicalInput = physicalInputCommitFor(operation);
  if (!physicalInput) return false;
  if (operation.kind !== 'resourceMutation' || operation.resource !== 'criticalStars')
    throw new TypeError('physical_input_commit_operation_mismatch');
  pending?.push({
    operationSequence,
    operationId: operation.operationId,
    operationKind: operation.kind,
    stateAddress: physicalInput.inputKey,
    before: exactInputFactValue(physicalInput.before) ?? null,
    attemptedAfter: exactInputFactValue(physicalInput.after) ?? null,
  });
  return true;
}

export function validateCandidateMutation(
  operation: BattleOperation,
  state: ExecutableBattleState,
  conditions: readonly SatisfiableConditionConstraint[],
  mutations: readonly SatisfiableConditionConstraint[],
  invalidDecisionKeys: ReadonlySet<string>,
) {
  return needsMutationValidation(operation)
    ? validateConstraintSet({
        fixedFacts: fixedConstraintFactsFromState(state, operation.operationId),
        expressions: conditions
          .filter((constraint) => !invalidDecisionKeys.has(constraint.sourceKey))
          .concat(mutations),
      })
    : { status: 'satisfied' as const, alternativeCount: 1 };
}

export function applyOrderedTraitWrite(
  operation: Extract<
    BattleOperation,
    { kind: 'addTrait' | 'removeTrait' | 'suppressInitialTrait' }
  >,
  state: ExecutableBattleState,
  proof: ConditionFactProof,
): void {
  let changed: ExecutableBattleState;
  switch (operation.kind) {
    case 'addTrait':
      changed = applyTraitAddition(state, operation.scope, operation.trait, proof);
      break;
    case 'removeTrait':
      changed = applyTraitRemoval(state, operation.scope, operation.trait, proof);
      break;
    case 'suppressInitialTrait':
      changed = applyInitialTraitSuppression(state, operation.scope, operation.trait, proof);
      break;
  }
  state.traitFactLayers = changed.traitFactLayers;
  state.conditionFactProofs = changed.conditionFactProofs;
  state.initialTraitSuppressions = changed.initialTraitSuppressions;
}

export function applyAuditedQuantityMutation(
  operation: Extract<BattleOperation, { kind: 'resourceMutation' | 'addQuantity' }>,
  before: ExecutableBattleState,
  after: ExecutableBattleState,
  proof: ConditionFactProof,
  operationSequence: number,
  pending: PendingMutationAuditEvent[] | null,
): ExecutionIssue | null {
  const mutationBefore = pending ? mutationAuditAddress(operation, before) : null;
  const issue =
    operation.kind === 'resourceMutation'
      ? applyOrderedCriticalStarsMutation(operation, after, proof)
      : applyOrderedQuantityMutation(operation, after);
  if (pending && mutationBefore)
    pending.push({
      operationSequence,
      operationId: operation.operationId,
      operationKind: operation.kind,
      stateAddress: mutationBefore.stateAddress,
      before: mutationBefore.value,
      attemptedAfter: mutationAuditAddress(operation, after)?.value ?? null,
    });
  return issue;
}
