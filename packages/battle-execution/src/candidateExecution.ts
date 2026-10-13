import {
  conditionWriteProof,
  contributionOperandRead,
  procIsGuaranteed,
  type ConditionRead,
} from './conditionRead';
import { physicalInputCommitFor, type SourceExecutionBinding } from './executionBinding';
import { contributionIsIncluded as isIncluded } from './effectiveContributions';
import { applyCommittedPreparationTransition } from './preparationPhysicalTransition';
import {
  applyObservedNpDamage,
  evaluateObservedCondition,
  beginHpCandidateCapture,
  captureHpValueRead,
  resolveObservedModifierValue,
  type CandidateSourceRead,
} from './hpExecutionObservation';
import type { ExecutionIssue, OperationResult } from './contracts';
import { markerOperationDisposition, applyOrderedMarkerMutation } from './markerExecution';
import { cloneBattleState, appendModifier } from './state';
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
import { markOperationGroupInputRequired } from './candidateRollback';
import { applyRuntimeNoblePhantasmVariantSelection } from './variantSelection';
import {
  modifierValue,
  operationEnabled,
  userConditionMet,
  applyOrderedActorFormTransition,
  effectOperationGroups,
  resolveOperationDisposition,
  scalarBattlePointSubjectFor,
} from './candidateOperationContext';
import { createOperationResult } from './operationResult';
import {
  recordPreGroupContextResolution,
  recordCandidatePreflight,
  type MutableCandidateStateAudit,
  type PendingMutationAuditEvent,
} from './candidateStateAudit';
import {
  groupHasMissingActiveInput,
  recordMissingInputRollback,
  rollbackUnsupportedGroup,
  recordPreparationPhysicalInput,
  validateCandidateMutation,
  applyOrderedTraitWrite,
  applyAuditedQuantityMutation,
  recordCommittedGroup,
} from './candidateTransaction';

export function executeOrderedCandidate(
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
    preappliedOperationIds,
    supersededVariantTransactionKeys,
    invalidDecisionKeys,
  } = candidate;
  let { state } = candidate;
  const results: OperationResult[] = [];
  const sourceReads = new Map<SourceExecutionBinding, CandidateSourceRead>();
  // A declared scalar writer binds the later NP read even when its transaction rolls back.
  let scalarBattlePointSubject: string | undefined;
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
      scalarBattlePointSubject =
        scalarBattlePointSubjectFor(operation, candidateInput.attackerId) ??
        scalarBattlePointSubject;
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
      let damageDependencyRead: ConditionRead | null = null;
      const condition = conditionRead.truth;
      const writeProof = conditionWriteProof(
        conditionRead,
        procIsGuaranteed(operation.proc, operation.procRatePermille),
      );
      const observedValue = hpCapture
        ? resolveObservedModifierValue(operation, state, hpCapture)
        : undefined;
      const resolved = observedValue ?? modifierValue(operation, state);
      const resolvedModifierValue = resolved.value;
      const valueDependencyRead = resolved.dependency;
      const applicationRead = contributionOperandRead(conditionRead, valueDependencyRead);
      const contributionIncluded = isIncluded(operation, applicationRead, contributionPolicy);
      const enabled = operationEnabled(
        activation,
        operation,
        contributionPolicy,
        contributionIncluded,
      );
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
        const nativePhysical = applyCommittedPreparationTransition(operation, candidateState);
        if (recordPreparationPhysicalInput(operation, operationSequence, pendingMutationEvents)) {
          const committed = physicalInputCommitFor(operation)!;
          candidateState.inputFacts = new Map([
            ...candidateState.inputFacts,
            [committed.inputKey, committed.after],
          ]);
        } else if (nativePhysical) {
          // The sealed source has already handled this physical operation.
        } else if (preappliedOperationIds.has(operation.operationId)) {
          // Preparation already committed this canonical form/variant mutation.
        } else if (operation.kind === 'preserveSemanticEffect' && operation.buffMutation) {
          issue = applyOrderedMarkerMutation(operation, candidateState, condition, writeProof);
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'resourceMutation' || operation.kind === 'addQuantity') {
          issue = applyAuditedQuantityMutation(
            operation,
            state,
            candidateState,
            writeProof,
            operationSequence,
            pendingMutationEvents,
          );
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (
          operation.kind === 'addTrait' ||
          operation.kind === 'removeTrait' ||
          operation.kind === 'suppressInitialTrait'
        ) {
          applyOrderedTraitWrite(operation, candidateState, writeProof);
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
              (read) => (damageDependencyRead = read),
              scalarBattlePointSubject,
            );
        }
        const mutationValidation = validateCandidateMutation(
          operation,
          candidateState,
          candidate.activeConditionConstraints,
          candidate.activeMutationConstraints,
          invalidDecisionKeys,
        );
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
        valueDependencyRead,
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
        combatRules: prepared.combatRules,
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
    const missingActiveInput = groupHasMissingActiveInput(
      results.slice(initialGroupResultIndex),
      groupIssues,
      resolvedInputs.missingDefinitions,
      candidate.activations,
      contributionPolicy,
    );
    if (missingActiveInput) {
      state = initialGroupState;
      input = initialGroupInput;
      recordMissingInputRollback({
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
      });
      markOperationGroupInputRequired(results, initialGroupResultIndex, state);
      continue;
    }
    if (groupIssues.length === 0) {
      if (audit && pendingMutationEvents)
        recordCommittedGroup({
          audit,
          groupIndex,
          operationGroup,
          results,
          initialGroupResultIndex,
          pendingMutationEvents,
        });
      continue;
    }
    input = initialGroupInput;
    state = rollbackUnsupportedGroup({
      audit,
      pendingMutationEvents,
      results,
      initialGroupResultIndex,
      groupIndex,
      operationGroup,
      initialGroupState,
      initialGroupInput,
      issues: groupIssues,
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
