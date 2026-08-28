import { QUANTITY_FACT_DOMAINS, type DamageResolutionInput } from '@fgo-lab/schema';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import type {
  BattleOperation,
  BattleState,
  EffectProjection,
  ExecutionIssue,
  OperationResult,
} from './contracts';
import { activationRequirementsSatisfied, evaluateCondition } from './condition';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import { applyNpDamageOperation } from './npDamageOperation';
import { createOperationProjection, resolveModifierValue } from './projection';
import {
  applyCardTypeMutation,
  cloneBattleState,
  combinedTraitCounts,
  withoutTraitCount,
} from './state';
import type { TargetCandidate } from './targetContext';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
} from './executionTypes';
import { prepareCandidateExecution } from './candidatePreparation';
import { assembleCandidateResult } from './candidateResult';

function applyNp(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: BattleState,
  effectLocalConditionSatisfied: boolean,
): DamageResolutionInput {
  const attackerTraits = combinedTraitCounts(
    state.traitCounts.attacker,
    state.traitCounts.attackerState,
  );
  const targetTraits = state.traitCounts.target;
  const targetStateTraits = state.traitCounts.targetState;
  return applyNpDamageOperation(input, operation.damage, {
    overcharge: operation.overcharge,
    attackerTraitCounts: attackerTraits,
    targetTraitCounts: targetTraits,
    targetCombinedTraitCounts: combinedTraitCounts(
      state.traitCounts.target,
      state.traitCounts.targetState,
    ),
    targetStateTraitCounts: targetStateTraits,
    targetPredicateValues: new Map(
      [...state.actorPredicates.target].map(([key, value]) => [key, value.present]),
    ),
    attackerHpPermille: state.quantities.attackerHpPermille,
    targetRarity: state.quantities.targetRarity,
    battlePointPhase: state.quantities.battlePointPhase,
    effectLocalConditionSatisfied,
  });
}

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
  state: BattleState,
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

export function executeOrderedScenarioCandidates(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
): readonly OrderedScenarioExecution[] {
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidate(prepared, resolvedInputs, candidate),
      )
    : [];
}

export function executeOrderedScenarioCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
): OrderedScenarioExecution {
  const { baseInput, damage, operations, attackerClass } = prepared;
  const candidate = prepareCandidateExecution(prepared, resolvedInputs, targetCandidate);
  const {
    candidateInput,
    decisions,
    activations,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    finalSelectedCardMutation,
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
      const activation = activations.get(operation.operationId)!;
      const enabled = activation.enabled;
      const condition = evaluateConditionAgainstKnownFacts(operation, state);
      const resolvedModifierValue =
        operation.kind === 'addModifier' ? resolveModifierValue(operation, state) : null;
      const decisionConditionSatisfied =
        condition === null &&
        choice?.conditionSatisfaction === 'assumeSatisfied' &&
        operation.decisionPlan.condition === 'userMayAssume' &&
        activationRequirementsSatisfied(operation.condition, state);
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
      } else if (
        operation.kind === 'addQuantity' &&
        (operation.applicationTiming === 'representedByCurrentInput' ||
          operation.subjectId !== candidateInput.attackerId ||
          damage?.kind !== 'battlePointPhase' ||
          String(
            damage.parametersByOvercharge[baseInput.overcharge - 1]?.[baseInput.npLevel - 1]
              ?.targetId,
          ) !== operation.subjectId)
      ) {
        outcome = 'notRelevant';
        code = 'disabled';
      } else if (
        operation.kind === 'changeCardType' &&
        finalSelectedCardMutation !== undefined &&
        operation.operationId !== finalSelectedCardMutation.operationId &&
        operation.order < finalSelectedCardMutation.order
      ) {
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
      }
      if (outcome === 'applied') {
        const candidateState = cloneBattleState(state);
        if (operation.kind === 'addTrait') {
          (candidateState.traits[operation.scope] as Map<string, boolean>).set(
            operation.trait,
            true,
          );
          candidateState.traitCounts[operation.scope] = {
            ...candidateState.traitCounts[operation.scope],
            [operation.trait]:
              (candidateState.traitCounts[operation.scope][operation.trait] ?? 0) + 1,
          };
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
        } else if (operation.kind === 'addModifier')
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
        else if (operation.kind === 'changeModifierRate')
          candidateState.modifierRates = {
            ...candidateState.modifierRates,
            [operation.modifier]: Math.max(
              candidateState.modifierRates[operation.modifier] ?? 0,
              operation.ratePermille,
            ),
          };
        else if (operation.kind === 'changeCardType') {
          const changed = applyCardTypeMutation(candidateState, operation);
          candidateState.card = changed.card;
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'ignoreDefense') candidateState.ignoreDefense = true;
        else if (operation.kind === 'ignoreDamageCut') candidateState.ignoreDamageCut = true;
        else input = applyNp(input, operation, state, localConditionSatisfied);
        const mutationValidation =
          operation.kind === 'addTrait' ||
          operation.kind === 'removeTrait' ||
          operation.kind === 'suppressInitialTrait' ||
          operation.kind === 'changeCardType'
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
      results.push({
        operation,
        outcome,
        condition: conditionResult(condition),
        state: cloneBattleState(state),
        projection: createOperationProjection(
          operation,
          outcome,
          code,
          condition,
          choice,
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
    for (let index = initialGroupResultIndex; index < results.length; index += 1) {
      const result = results[index]!;
      results[index] = {
        ...result,
        outcome: 'unsupported',
        state: cloneBattleState(state),
        projection: {
          ...result.projection,
          outcome: 'unsupported',
          explanation: { ...result.projection.explanation, code: 'unresolved' },
        },
        issue: result.issue ?? groupIssues[0]!,
      };
    }
  }
  return assembleCandidateResult({ prepared, resolvedInputs, candidate, state, input, results });
}
