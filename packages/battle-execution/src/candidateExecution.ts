import type { ExecutionIssue, OperationResult } from './contracts';
import { markerOperationDisposition, applyOrderedMarkerMutation } from './markerExecution';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import {
  applyInitialTraitSuppression,
  applyTraitAddition,
  applyTraitRemoval,
  cloneBattleState,
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
import { applyNoblePhantasmDamage } from './npDamageExecution';
import {
  includedByPolicy,
  modifierValue,
  operationEnabled,
  userConditionMet,
  applyOrderedActorFormTransition,
  effectOperationGroups,
  evaluateConditionAgainstKnownFacts,
  resolveOperationDisposition,
} from './candidateOperationContext';
import { createOperationResult } from './operationResult';
import {
  appendConditionReadAudit,
  createMutableCandidateStateAudit,
  mutationAuditAddress,
  auditValuesEqual,
  battleStateRestoredToGroupStart,
  collectAppliedOperationIds,
  appendExecutionGroupAudit,
  recordPreGroupContextResolution,
  type MutableCandidateStateAudit,
  type PendingMutationAuditEvent,
  type CandidateExecutionWithAudit,
} from './candidateStateAudit';

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
  let input = candidateInput;
  recordPreGroupContextResolution(audit, candidate);
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
      const contributionIncluded = includedByPolicy(operation, contributionPolicy, state);
      const enabled = operationEnabled(
        activation,
        operation,
        contributionPolicy,
        contributionIncluded,
      );
      const condition = evaluateConditionAgainstKnownFacts(
        operation,
        state,
        audit
          ? (read) =>
              appendConditionReadAudit(
                audit,
                read,
                operationSequence,
                groupIndex,
                operation.operationId,
              )
          : undefined,
      );
      const resolvedModifierValue = modifierValue(operation, state);
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
        if (preappliedOperationIds.has(operation.operationId)) {
          // Preparation already committed this canonical form/variant mutation.
        } else if (operation.kind === 'preserveSemanticEffect' && operation.buffMutation) {
          issue = applyOrderedMarkerMutation(
            operation,
            candidateState,
            condition,
            prepared.inputDefinitions,
          );
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'resourceMutation') {
          const mutationBefore = audit ? mutationAuditAddress(operation, state) : null;
          issue = applyOrderedCriticalStarsMutation(operation, candidateState);
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
        } else if (operation.kind === 'addTrait') {
          const changed = applyTraitAddition(candidateState, operation.scope, operation.trait);
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'removeTrait') {
          const changed = applyTraitRemoval(candidateState, operation.scope, operation.trait);
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'suppressInitialTrait') {
          const changed = applyInitialTraitSuppression(
            candidateState,
            operation.scope,
            operation.trait,
          );
          candidateState.initialTraitSuppressions = changed.initialTraitSuppressions;
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
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
          candidateState.modifiers = [
            ...candidateState.modifiers,
            {
              operationId: operation.operationId,
              source: operation.source,
              modifier: operation.modifier,
              valuePermille: resolvedModifierValue!,
              card: operation.card,
              order: operation.order,
            },
          ];
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
            input = applyNoblePhantasmDamage(
              input,
              operation,
              state,
              decisions,
              contributionPolicy,
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
      results.push(
        createOperationResult({
          operation,
          outcome,
          code,
          condition,
          choice,
          state,
          decisions,
          resolvedModifierValue,
          activeDecisionSource: activeDecisionSourceInstances.has(
            operation.source.sourceInstanceId,
          ),
          attackerClass,
          issue,
        }),
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
