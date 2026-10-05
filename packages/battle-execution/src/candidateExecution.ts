import { conditionWriteProof, procIsGuaranteed, type ConditionFactProof } from './conditionRead';
import { physicalInputCommitFor } from './executionBinding';
import {
  applyObservedNpDamage,
  evaluateObservedCondition,
  beginHpCandidateCapture,
  captureHpValueRead,
  resolveObservedModifierValue,
} from './hpExecutionObservation';
import type {
  ExecutionIssue,
  OperationResult,
  BattleOperation,
  ExecutableBattleState,
} from './contracts';
import { markerOperationDisposition, applyOrderedMarkerMutation } from './markerExecution';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import {
  applyInitialTraitSuppression,
  applyTraitAddition,
  applyTraitRemoval,
  cloneBattleState,
  appendModifier,
} from './state';
import type { TargetCandidate } from './targetContext';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  ContributionApplicationPolicy,
} from './executionTypes';
import { prepareCandidateExecution } from './candidatePreparation';
import { assembleCandidateResult } from './candidateResult';
import { assembleInvalidActivationResult } from './candidateFailure';
import { markOperationGroupUnsupported } from './candidateRollback';
import {
  applyOrderedCriticalStarsMutation,
  applyOrderedQuantityMutation,
} from './resourceSemantics';
import {
  applyRuntimeNoblePhantasmVariantSelection,
  needsMutationValidation,
} from './variantSelection';
import {
  includedByPolicy,
  modifierValue,
  operationEnabled,
  userConditionMet,
  applyOrderedActorFormTransition,
  effectOperationGroups,
  resolveOperationDisposition,
} from './candidateOperationContext';
import { createOperationResult } from './operationResult';
import {
  createMutableCandidateStateAudit,
  mutationAuditAddress,
  auditValuesEqual,
  battleStateRestoredToGroupStart,
  collectAppliedOperationIds,
  appendExecutionGroupAudit,
  recordPreGroupContextResolution,
  recordCandidatePreflight,
  type MutableCandidateStateAudit,
  type PendingMutationAuditEvent,
  type CandidateExecutionWithAudit,
} from './candidateStateAudit';

function applyOrderedTraitWrite(
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
  state.traits = changed.traits;
  state.traitCounts = changed.traitCounts;
  state.conditionFactProofs = changed.conditionFactProofs;
  state.initialTraitSuppressions = changed.initialTraitSuppressions;
}

export function executeOrderedScenarioCandidates(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): readonly OrderedScenarioExecution[] {
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidate(prepared, resolvedInputs, candidate, contributionPolicy),
      )
    : [];
}

export function executeOrderedScenarioCandidatesWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): readonly CandidateExecutionWithAudit[] {
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidateWithAudit(
          prepared,
          resolvedInputs,
          candidate,
          contributionPolicy,
        ),
      )
    : [];
}

export function executeOrderedScenarioCandidateWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): CandidateExecutionWithAudit {
  const mutableAudit = createMutableCandidateStateAudit();
  const execution = executeOrderedScenarioCandidateInternal(
    prepared,
    resolvedInputs,
    targetCandidate,
    contributionPolicy,
    mutableAudit,
  );
  return { execution, candidateState: mutableAudit };
}

export function executeOrderedScenarioCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): OrderedScenarioExecution {
  return executeOrderedScenarioCandidateInternal(
    prepared,
    resolvedInputs,
    targetCandidate,
    contributionPolicy,
  );
}

function executeOrderedScenarioCandidateInternal(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy,
  audit?: MutableCandidateStateAudit,
): OrderedScenarioExecution {
  const { baseInput, damage, operations, attackerClass } = prepared;
  const candidate = prepareCandidateExecution(prepared, resolvedInputs, targetCandidate);
  recordCandidatePreflight(audit, candidate);
  if (candidate.status === 'invalidActivationContext')
    return assembleInvalidActivationResult({ prepared, resolvedInputs, candidate });
  const {
    candidateInput,
    decisions,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    preappliedOperationIds,
    supersededVariantTransactionKeys,
    invalidDecisionKeys,
  } = candidate;
  let { state } = candidate;
  const results: OperationResult[] = [];
  const sourceReads = new Map<
    import('./executionBinding').SourceExecutionBinding,
    import('./hpExecutionObservation').CandidateSourceRead
  >();
  let input = candidateInput;
  recordPreGroupContextResolution(audit, candidate);
  const hpCapture = audit && beginHpCandidateCapture(audit, candidate.state);
  const operationGroups = effectOperationGroups(operations);
  for (const [groupIndex, operationGroup] of operationGroups.entries()) {
    const initialGroupState = cloneBattleState(state);
    const initialGroupInput = input;
    const initialGroupResultIndex = results.length;
    const groupIssues: ExecutionIssue[] = [];
    const pendingMutationEvents: PendingMutationAuditEvent[] | null = audit ? [] : null;
    for (const operation of operationGroup) {
      const operationSequence = results.length;
      const choice = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
      const activation = candidate.activations.get(operation.operationId)!;
      const conditionRead = evaluateObservedCondition(
        operation,
        state,
        audit,
        operationSequence,
        groupIndex,
        sourceReads,
      );
      let damageDependencyRead: import('./conditionRead').ConditionRead | null = null;
      const condition = conditionRead.truth;
      const writeProof = conditionWriteProof(
        conditionRead,
        procIsGuaranteed(operation.proc, operation.procRatePermille),
      );
      const contributionIncluded = includedByPolicy(operation, contributionPolicy, conditionRead);
      const enabled = operationEnabled(
        activation,
        operation,
        contributionPolicy,
        contributionIncluded,
      );
      const observedValue = hpCapture
        ? resolveObservedModifierValue(operation, state, hpCapture)
        : undefined;
      const resolvedModifierValue = observedValue
        ? observedValue.value
        : modifierValue(operation, state);
      const decisionConditionSatisfied = userConditionMet(operation, condition, choice, state);
      const localConditionSatisfied =
        decisionConditionSatisfied || activation.assumesLocalCondition;
      const markerDisposition = markerOperationDisposition(operation, state, condition);
      let { outcome, code, issue } = resolveOperationDisposition({
        operation,
        invalidDecisionKeys,
        activation,
        enabled,
        markerDisposition,
        candidateInput,
        damage,
        baseInput,
        supersededVariantTransactionKeys,
        resolvedModifierValue,
        decisionConditionSatisfied,
        choice,
        condition,
        localConditionSatisfied,
      });
      if (outcome === 'applied') {
        const candidateState = cloneBattleState(state);
        const physicalInput = physicalInputCommitFor(operation);
        if (physicalInput) {
          if (operation.kind !== 'resourceMutation' || operation.resource !== 'criticalStars')
            throw new TypeError('physical_input_commit_operation_mismatch');
          if (audit && pendingMutationEvents)
            pendingMutationEvents.push({
              operationSequence,
              operationId: operation.operationId,
              operationKind: operation.kind,
              stateAddress: physicalInput.inputKey,
              before: physicalInput.before,
              attemptedAfter: physicalInput.after,
            });
        } else if (preappliedOperationIds.has(operation.operationId)) {
          // Preparation already committed this canonical form/variant mutation.
        } else if (operation.kind === 'preserveSemanticEffect' && operation.buffMutation) {
          issue = applyOrderedMarkerMutation(
            operation,
            candidateState,
            condition,
            prepared.inputDefinitions,
            writeProof,
          );
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'resourceMutation') {
          const mutationBefore = audit ? mutationAuditAddress(operation, state) : null;
          issue = applyOrderedCriticalStarsMutation(operation, candidateState, writeProof);
          if (audit && mutationBefore && pendingMutationEvents)
            pendingMutationEvents.push({
              operationSequence,
              operationId: operation.operationId,
              operationKind: operation.kind,
              stateAddress: mutationBefore.stateAddress,
              before: mutationBefore.value,
              attemptedAfter: mutationAuditAddress(operation, candidateState)?.value ?? null,
            });
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (
          operation.kind === 'addTrait' ||
          operation.kind === 'removeTrait' ||
          operation.kind === 'suppressInitialTrait'
        ) {
          applyOrderedTraitWrite(operation, candidateState, writeProof);
        } else if (operation.kind === 'addQuantity') {
          const mutationBefore = audit ? mutationAuditAddress(operation, state) : null;
          issue = applyOrderedQuantityMutation(operation, candidateState);
          if (audit && mutationBefore && pendingMutationEvents)
            pendingMutationEvents.push({
              operationSequence,
              operationId: operation.operationId,
              operationKind: operation.kind,
              stateAddress: mutationBefore.stateAddress,
              before: mutationBefore.value,
              attemptedAfter: mutationAuditAddress(operation, candidateState)?.value ?? null,
            });
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'addModifier' && contributionIncluded)
          appendModifier(candidateState, operation, resolvedModifierValue!);
        else if (operation.kind === 'changeModifierRate' && contributionIncluded)
          candidateState.modifierRates = {
            ...candidateState.modifierRates,
            [operation.modifier]: Math.max(
              candidateState.modifierRates[operation.modifier] ?? 0,
              operation.ratePermille,
            ),
          };
        else if (operation.kind === 'transformActorForm') {
          issue = applyOrderedActorFormTransition(candidateState, operation);
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'selectNoblePhantasmVariant') {
          const selection = applyRuntimeNoblePhantasmVariantSelection(
            candidateState,
            operation,
            prepared.noblePhantasmVariants,
          );
          if (selection.issue) {
            outcome = 'unsupported';
            code = 'unresolved';
            issue = selection.issue;
          } else {
            candidateState.card = selection.state.card;
            candidateState.noblePhantasmVariant = selection.state.noblePhantasmVariant;
          }
        } else if (operation.kind === 'ignoreDefense') {
          if (contributionIncluded) candidateState.ignoreDefense = true;
        } else if (operation.kind === 'ignoreDamageCut') {
          if (contributionIncluded) candidateState.ignoreDamageCut = true;
        } else if (operation.kind === 'executeNpDamage') {
          if (contributionIncluded)
            input = applyObservedNpDamage(
              input,
              operation,
              state,
              decisions,
              contributionPolicy,
              audit,
              hpCapture,
              operationSequence,
              groupIndex,
              (read) => {
                damageDependencyRead = read;
              },
            );
        }
        const mutationValidation = needsMutationValidation(operation)
          ? validateConstraintSet({
              fixedFacts: fixedConstraintFactsFromState(candidateState, operation.operationId),
              expressions: activeConditionConstraints
                .filter((constraint) => !invalidDecisionKeys.has(constraint.sourceKey))
                .concat(activeMutationConstraints),
            })
          : { status: 'satisfied' as const, alternativeCount: 1 };
        if (issue) {
          // The enclosing effect group rolls back every state and input mutation.
        } else if (mutationValidation.status !== 'satisfied') {
          outcome = 'unsupported';
          code = 'unresolved';
          issue = mutationValidation.issue;
          mutationValidation.issue.sourceKeys.forEach((key) => invalidDecisionKeys.add(key));
          activation.activeDecisionKeys.forEach((key) => invalidDecisionKeys.add(key));
        } else {
          state = candidateState;
          state.evidence = [...state.evidence, operation.evidence];
        }
      }
      if (issue) groupIssues.push(issue);
      const result = createOperationResult({
        conditionRead,
        damageDependencyRead,
        operation,
        outcome,
        code,
        condition,
        choice,
        state,
        decisions,
        resolvedModifierValue,
        activeDecisionSource: activeDecisionSourceInstances.has(operation.source.sourceInstanceId),
        attackerClass,
        issue,
      });
      results.push(result);
      captureHpValueRead(
        hpCapture,
        operation,
        result,
        operationSequence,
        groupIndex,
        state,
        observedValue,
        contributionIncluded,
      );
    }
    if (groupIssues.length === 0) {
      if (audit && pendingMutationEvents)
        appendExecutionGroupAudit({
          audit,
          groupIndex,
          operationGroup,
          operationIdsApplied: collectAppliedOperationIds(results, initialGroupResultIndex),
          outcome: 'committed',
          issues: [],
          pendingMutationEvents,
          restoredState: null,
          rollbackProof: null,
        });
      continue;
    }
    const attemptedAppliedOperationIds = audit
      ? collectAppliedOperationIds(results, initialGroupResultIndex)
      : null;
    state = {
      ...initialGroupState,
      unresolved: [...initialGroupState.unresolved, ...groupIssues],
    };
    input = initialGroupInput;
    markOperationGroupUnsupported(results, initialGroupResultIndex, state, groupIssues);
    if (audit && pendingMutationEvents && attemptedAppliedOperationIds)
      appendExecutionGroupAudit({
        audit,
        groupIndex,
        operationGroup,
        operationIdsApplied: attemptedAppliedOperationIds,
        outcome: 'rolledBack',
        issues: [...groupIssues],
        pendingMutationEvents,
        restoredState: initialGroupState,
        rollbackProof: {
          battleStateRestored: battleStateRestoredToGroupStart(initialGroupState, state),
          damageInputRestored: auditValuesEqual(initialGroupInput, input),
        },
      });
  }
  return assembleCandidateResult({
    prepared,
    resolvedInputs,
    candidate,
    state,
    input,
    results,
    contributionPolicy,
  });
}
