import { QUANTITY_FACT_DOMAINS, type DamageResolutionInput } from '@fgo-lab/schema';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import type {
  BattleOperation,
  EffectProjection,
  ExecutionIssue,
  ExecutableBattleState,
  OperationResult,
} from './contracts';
import { evaluateCondition } from './condition';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import { createOperationProjection, resolveOperationProjectionEvaluation } from './projection';
import {
  applyActorFormTransition,
  applyTraitAddition,
  cloneBattleState,
  withoutTraitCount,
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
import { operationHasNoRuntimeDamageImpact, unresolvedResourceIssue } from './resourceSemantics';
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
} from './candidateOperationContext';

function effectTransactionKey(operation: BattleOperation): string {
  const { source } = operation;
  return [
    source.origin,
    source.sourceInstanceId,
    source.transactionGroupId ?? `${source.skillId}:${source.effectOccurrenceId}`,
  ].join(':');
}
function effectOperationGroups(operations: readonly BattleOperation[]): BattleOperation[][] {
  const groups: BattleOperation[][] = [];
  for (const operation of operations) {
    const current = groups.at(-1);
    if (!current || effectTransactionKey(current[0]!) !== effectTransactionKey(operation))
      groups.push([operation]);
    else current.push(operation);
  }
  return groups;
}
function evaluateConditionAgainstKnownFacts(
  operation: BattleOperation,
  state: ExecutableBattleState,
): boolean | null {
  const evaluated = evaluateCondition(operation.condition, state);
  if (evaluated !== null) return evaluated;
  const satisfiable = validateConstraintSet({
    fixedFacts: fixedConstraintFactsFromState(state, operation.operationId),
    expressions: [{ sourceKey: operation.operationId, expression: operation.condition }],
  });
  return satisfiable.status === 'conflict' ? false : null;
}
function conditionResult(value: boolean | null): OperationResult['condition'] {
  if (value === null) return 'unresolved';
  return value ? 'satisfied' : 'unsatisfied';
}

function quantityOperationIsNotRelevant(
  operation: BattleOperation,
  candidateInput: DamageResolutionInput,
  damage: PreparedOrderedScenario['damage'],
  baseInput: DamageResolutionInput,
): boolean {
  if (operation.kind !== 'addQuantity') return false;
  const targetId =
    damage?.kind === 'battlePointPhase'
      ? damage.parametersByOvercharge[baseInput.overcharge - 1]?.[baseInput.npLevel - 1]?.targetId
      : null;
  return (
    operation.applicationTiming === 'representedByCurrentInput' ||
    operation.subjectId !== candidateInput.attackerId ||
    damage?.kind !== 'battlePointPhase' ||
    String(targetId) !== operation.subjectId
  );
}

function operationTransactionKey(operation: BattleOperation): string {
  return (
    operation.source.transactionGroupId ??
    `${operation.source.skillId}:${operation.source.effectOccurrenceId}`
  );
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

export function executeOrderedScenarioCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
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
  for (const operationGroup of effectOperationGroups(operations)) {
    const initialGroupState = cloneBattleState(state);
    const initialGroupInput = input;
    const initialGroupResultIndex = results.length;
    const groupIssues: ExecutionIssue[] = [];
    for (const operation of operationGroup) {
      const choice = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
      const activation = candidate.activations.get(operation.operationId)!;
      const contributionIncluded = includedByPolicy(operation, contributionPolicy, state);
      const enabled = operationEnabled(
        activation,
        operation,
        contributionPolicy,
        contributionIncluded,
      );
      const condition = evaluateConditionAgainstKnownFacts(operation, state);
      const resolvedModifierValue = modifierValue(operation, state);
      const decisionConditionSatisfied = userConditionMet(operation, condition, choice, state);
      const localConditionSatisfied =
        decisionConditionSatisfied || activation.assumesLocalCondition;
      let outcome: OperationResult['outcome'] = 'applied';
      let code: EffectProjection['explanation']['code'] = 'applied';
      let issue: ExecutionIssue | null = null;
      if (
        (operation.decisionKey && invalidDecisionKeys.has(operation.decisionKey)) ||
        activation.activeDecisionKeys.some((key) => invalidDecisionKeys.has(key))
      ) {
        outcome = 'notApplied';
        code = 'conditionNotMet';
      } else if (!enabled) {
        outcome = 'notApplied';
        code = 'disabled';
      } else if (quantityOperationIsNotRelevant(operation, candidateInput, damage, baseInput)) {
        outcome = 'notRelevant';
        code = 'disabled';
      } else if (supersededVariantTransactionKeys.has(operationTransactionKey(operation))) {
        outcome = 'notRelevant';
        code = 'disabled';
      } else if (operation.kind === 'addModifier' && resolvedModifierValue === null) {
        outcome = 'unsupported';
        code = 'unresolved';
        issue = {
          kind: 'unsupportedOperation',
          operationId: operation.operationId,
          detail: 'modifier_value_quantity_missing',
        };
      } else if (
        decisionConditionSatisfied &&
        (operation.kind === 'addTrait' ||
          operation.kind === 'removeTrait' ||
          operation.kind === 'suppressInitialTrait')
      ) {
        outcome = 'unsupported';
        code = 'unresolved';
        issue = {
          kind: 'unsafeLocalConditionDecision',
          operationId: operation.operationId,
          detail: 'condition_satisfaction_would_create_world_fact',
        };
      } else if (condition === null && localConditionSatisfied) {
        outcome = 'applied';
      } else if (
        condition === null &&
        operation.decisionKey &&
        choice?.conditionSatisfaction !== 'assumeSatisfied'
      ) {
        outcome = 'notApplied';
        code = 'unresolved';
      } else if (
        condition === null &&
        (operation.kind === 'addTrait' ||
          operation.kind === 'removeTrait' ||
          operation.kind === 'suppressInitialTrait' ||
          operation.kind === 'addQuantity')
      ) {
        outcome = 'notApplied';
        code = 'unresolved';
      } else if (condition === null) {
        outcome = 'unsupported';
        code = 'unresolved';
        issue = {
          kind: 'unsupportedCondition',
          operationId: operation.operationId,
          detail: 'quantity_missing',
        };
      } else if (!condition && !localConditionSatisfied) {
        outcome = 'notApplied';
        code = 'conditionNotMet';
      } else if (operationHasNoRuntimeDamageImpact(operation)) {
        [outcome, code] = ['notRelevant', 'stateMutationOnly'];
      }
      if (outcome === 'applied') {
        const candidateState = cloneBattleState(state);
        const contributes = contributionIncluded;
        if (preappliedOperationIds.has(operation.operationId)) {
          // Preparation already committed this canonical form/variant mutation.
        } else if (operation.kind === 'resourceMutation') {
          outcome = 'unsupported';
          code = 'unresolved';
          issue = unresolvedResourceIssue(operation);
        } else if (operation.kind === 'addTrait') {
          const changed = applyTraitAddition(candidateState, operation.scope, operation.trait);
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'removeTrait') {
          (candidateState.traits[operation.scope] as Map<string, boolean>).set(
            operation.trait,
            false,
          );
          candidateState.traitCounts[operation.scope] = withoutTraitCount(
            candidateState.traitCounts[operation.scope],
            operation.trait,
          );
        } else if (operation.kind === 'suppressInitialTrait') {
          candidateState.initialTraitSuppressions[operation.scope] = new Set([
            ...candidateState.initialTraitSuppressions[operation.scope],
            operation.trait,
          ]);
        } else if (operation.kind === 'addQuantity') {
          const current = candidateState.quantities[operation.quantity];
          if (current === null) {
            outcome = 'unsupported';
            code = 'unresolved';
            issue = {
              kind: 'unsupportedOperation',
              operationId: operation.operationId,
              detail: `quantity_missing:${operation.quantity}`,
            };
          } else
            candidateState.quantities[operation.quantity] = Math.min(
              QUANTITY_FACT_DOMAINS[operation.quantity].max,
              Math.max(QUANTITY_FACT_DOMAINS[operation.quantity].min, current + operation.amount),
            );
        } else if (operation.kind === 'addModifier' && contributes)
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
        else if (operation.kind === 'changeModifierRate' && contributes)
          candidateState.modifierRates = {
            ...candidateState.modifierRates,
            [operation.modifier]: Math.max(
              candidateState.modifierRates[operation.modifier] ?? 0,
              operation.ratePermille,
            ),
          };
        else if (operation.kind === 'transformActorForm') {
          const changed = applyActorFormTransition(candidateState, operation);
          candidateState.actorFormId = changed.actorFormId;
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
          if (contributes) candidateState.ignoreDefense = true;
        } else if (operation.kind === 'ignoreDamageCut') {
          if (contributes) candidateState.ignoreDamageCut = true;
        } else if (operation.kind === 'executeNpDamage') {
          if (contributes)
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
        if (mutationValidation.status !== 'satisfied') {
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
      const projected = resolveOperationProjectionEvaluation(
        operation,
        outcome,
        code,
        condition,
        choice,
        state,
        decisions,
      );
      results.push({
        operation,
        outcome,
        condition: conditionResult(condition),
        state: cloneBattleState(state),
        projection: createOperationProjection(
          operation,
          projected.outcome,
          projected.code,
          projected.condition,
          projected.choice,
          resolvedModifierValue,
          activeDecisionSourceInstances.has(operation.source.sourceInstanceId),
          {
            kind: 'relative',
            relation: defaultTargetClassRelation(attackerClass),
          },
          { kind: 'relative', relation: 'neutral' },
        ),
        issue,
      });
    }
    if (groupIssues.length === 0) continue;
    state = {
      ...initialGroupState,
      unresolved: [...initialGroupState.unresolved, ...groupIssues],
    };
    input = initialGroupInput;
    markOperationGroupUnsupported(results, initialGroupResultIndex, state, groupIssues);
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
