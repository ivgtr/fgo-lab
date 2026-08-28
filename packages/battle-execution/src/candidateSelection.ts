import { resolveOperationActivation } from './activation';
import { activationRequirementsSatisfied, evaluateCondition } from './condition';
import {
  fixedConstraintFactsFromState,
  validateConstraintSet,
  type SatisfiableConditionConstraint,
} from './constraints';
import {
  assumedDecisionConstraints,
  collectDecisionConditions,
  resolveSatisfiedDecisionKeys,
} from './decisionConditions';
import type {
  BattleOperation,
  BattleState,
  EffectDecision,
  ExecutionIssue,
  TargetPredicateAssertion,
} from './contracts';
import type { PreparedOrderedScenario } from './executionTypes';
import { applyCardTypeMutation, applyWorldFacts } from './state';

export type OperationActivation = ReturnType<typeof resolveOperationActivation>;

export interface CandidateSelections {
  activations: ReadonlyMap<string, OperationActivation>;
  activeDecisionSourceInstances: ReadonlySet<string>;
  activeConditionConstraints: readonly SatisfiableConditionConstraint[];
  activeMutationConstraints: readonly SatisfiableConditionConstraint[];
  finalSelectedCardMutation: Extract<BattleOperation, { kind: 'changeCardType' }> | undefined;
}

export interface CandidateConstraintResult {
  state: BattleState;
  constraintIssues: readonly ExecutionIssue[];
  invalidDecisionKeys: Set<string>;
}

export function resolveCandidateSelections(
  prepared: PreparedOrderedScenario,
  decisions: ReadonlyMap<string, EffectDecision>,
  state: BattleState,
): CandidateSelections {
  const { operations, scenario } = prepared;
  const conditionsByDecisionKey = collectDecisionConditions(operations);
  const satisfiedDecisionKeys = resolveSatisfiedDecisionKeys(
    decisions,
    conditionsByDecisionKey,
    state,
  );
  const activations = new Map(
    operations.map((operation) => [
      operation.operationId,
      resolveOperationActivation(operation, decisions, satisfiedDecisionKeys),
    ]),
  );
  const activeDecisionSourceInstances = new Set(
    operations
      .filter((operation) => activations.get(operation.operationId)!.activeDecisionKeys.length > 0)
      .map((operation) => operation.source.sourceInstanceId),
  );
  const activeConditionConstraints = assumedDecisionConstraints(
    scenario.effectDecisions,
    conditionsByDecisionKey,
    state,
  );
  const activeMutationConstraints: SatisfiableConditionConstraint[] = operations.flatMap(
    (operation) =>
      activations.get(operation.operationId)!.assumesLocalCondition
        ? [{ sourceKey: operation.operationId, expression: operation.condition }]
        : [],
  );
  const selectedCardMutations = operations.filter((operation) => {
    if (operation.kind !== 'changeCardType') return false;
    if (activations.get(operation.operationId)?.enabled !== true) return false;
    if (operation.decisionPlan.condition !== 'userMayAssume') return true;
    const evaluated = evaluateCondition(operation.condition, state);
    return (
      evaluated === true ||
      (evaluated === null &&
        operation.decisionKey !== null &&
        decisions.get(operation.decisionKey)?.conditionSatisfaction === 'assumeSatisfied' &&
        activationRequirementsSatisfied(operation.condition, state))
    );
  }) as Extract<BattleOperation, { kind: 'changeCardType' }>[];
  return {
    activations,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    finalSelectedCardMutation: selectedCardMutations.at(-1),
  };
}

export function validateCandidateSelections(
  prepared: PreparedOrderedScenario,
  targetFacts: readonly TargetPredicateAssertion[],
  initialState: BattleState,
  selections: CandidateSelections,
): CandidateConstraintResult {
  const { operations, scenario } = prepared;
  const { finalSelectedCardMutation, activeConditionConstraints, activeMutationConstraints } =
    selections;
  const validation = validateConstraintSet({
    fixedFacts: [
      ...fixedConstraintFactsFromState(initialState, 'initial').filter(
        ({ fact }) => !finalSelectedCardMutation || fact.kind !== 'card',
      ),
      ...(finalSelectedCardMutation
        ? [
            {
              sourceKey:
                finalSelectedCardMutation.decisionKey ?? finalSelectedCardMutation.operationId,
              fact: { kind: 'card' as const, card: finalSelectedCardMutation.card },
            },
          ]
        : []),
      ...targetFacts.map((assertion) => ({
        sourceKey: assertion.sourceKey,
        fact: {
          kind: 'targetPredicate' as const,
          scope: 'target' as const,
          predicate: assertion.predicate,
          present: assertion.present,
        },
      })),
      ...scenario.worldFactAssertions.map((assertion) => ({
        sourceKey: assertion.decisionKey,
        fact: assertion.fact,
      })),
    ],
    expressions: [...activeConditionConstraints, ...activeMutationConstraints],
  });
  if (validation.status !== 'satisfied')
    return {
      state: initialState,
      constraintIssues: [validation.issue],
      invalidDecisionKeys: new Set([
        ...activeConditionConstraints.map((constraint) => constraint.sourceKey),
        ...operations.flatMap(
          (operation) => selections.activations.get(operation.operationId)!.activeDecisionKeys,
        ),
      ]),
    };
  const withWorldFacts = applyWorldFacts(initialState, scenario.worldFactAssertions);
  return {
    state: finalSelectedCardMutation
      ? applyCardTypeMutation(withWorldFacts, finalSelectedCardMutation)
      : withWorldFacts,
    constraintIssues: [],
    invalidDecisionKeys: new Set(),
  };
}
