import { resolveOperationActivation } from './activation';
import { validateConstraintSet, type SatisfiableConditionConstraint } from './constraints';
import {
  assumedDecisionConstraints,
  collectDecisionConditions,
  resolveSatisfiedDecisionKeys,
} from './decisionConditions';
import type {
  BattleOperation,
  EffectDecision,
  ExecutionIssue,
  ExecutableBattleState,
  TargetPredicateAssertion,
} from './contracts';
import type { PreparedOrderedScenario } from './executionTypes';
import { applyWorldFacts } from './state';
import {
  initialSelectionFixedFacts,
  validateSelectedFormConstraints,
} from './formConstraintValidation';
import type { ResolvedStochasticOutcome } from './stochasticOutcomes';
import {
  applySelectedNoblePhantasmContext,
  resolveActiveVariantTransactions,
  resolveSelectedNoblePhantasmVariant,
} from './variantSelection';
export type OperationActivation = ReturnType<typeof resolveOperationActivation>;
export interface CandidateSelections {
  activations: ReadonlyMap<string, OperationActivation>;
  activeDecisionSourceInstances: ReadonlySet<string>;
  activeConditionConstraints: readonly SatisfiableConditionConstraint[];
  activeMutationConstraints: readonly SatisfiableConditionConstraint[];
  finalSelectedNoblePhantasmVariant:
    Extract<BattleOperation, { kind: 'selectNoblePhantasmVariant' }> | undefined;
  preappliedOperationIds: ReadonlySet<string>;
  supersededVariantTransactionKeys: ReadonlySet<string>;
}
export interface CandidateConstraintResult {
  state: ExecutableBattleState;
  constraintIssues: readonly ExecutionIssue[];
  invalidDecisionKeys: Set<string>;
}
export function resolveCandidateSelections(
  prepared: PreparedOrderedScenario,
  decisions: ReadonlyMap<string, EffectDecision>,
  stochasticOutcomes: ReadonlyMap<string, ResolvedStochasticOutcome>,
  state: ExecutableBattleState,
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
      resolveOperationActivation(operation, decisions, stochasticOutcomes, satisfiedDecisionKeys),
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
  const variantTransactions = resolveActiveVariantTransactions(
    operations,
    activations,
    decisions,
    state,
  );
  return {
    activations,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    finalSelectedNoblePhantasmVariant: variantTransactions.finalSelection,
    preappliedOperationIds: variantTransactions.preappliedOperationIds,
    supersededVariantTransactionKeys: variantTransactions.supersededTransactionKeys,
  };
}
export function validateCandidateSelections(
  prepared: PreparedOrderedScenario,
  targetFacts: readonly TargetPredicateAssertion[],
  initialState: ExecutableBattleState,
  selections: CandidateSelections,
): CandidateConstraintResult {
  const { operations, scenario } = prepared;
  const {
    finalSelectedNoblePhantasmVariant,
    activeConditionConstraints,
    activeMutationConstraints,
  } = selections;
  const resolvedVariant = resolveSelectedNoblePhantasmVariant(
    prepared,
    finalSelectedNoblePhantasmVariant,
  );
  if (resolvedVariant.status === 'rejected')
    return {
      state: initialState,
      constraintIssues: [resolvedVariant.issue],
      invalidDecisionKeys: new Set(),
    };
  const selectedVariant = resolvedVariant.variant;
  const validation = validateConstraintSet({
    fixedFacts: initialSelectionFixedFacts(
      initialState,
      targetFacts,
      scenario.worldFactAssertions,
      selectedVariant,
      finalSelectedNoblePhantasmVariant,
    ),
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
  const applied = applySelectedNoblePhantasmContext(
    withWorldFacts,
    selectedVariant,
    finalSelectedNoblePhantasmVariant,
    operations,
    selections.preappliedOperationIds,
    selections.activations,
  );
  if (applied.issue)
    return {
      state: initialState,
      constraintIssues: [applied.issue],
      invalidDecisionKeys: new Set(),
    };
  const terminalIssue = validateSelectedFormConstraints(applied.state, [
    ...activeConditionConstraints,
    ...activeMutationConstraints,
  ]);
  if (terminalIssue)
    return {
      state: initialState,
      constraintIssues: [terminalIssue],
      invalidDecisionKeys: new Set([
        ...activeConditionConstraints.map((constraint) => constraint.sourceKey),
        ...activeMutationConstraints.map((constraint) => constraint.sourceKey),
      ]),
    };
  return {
    state: applied.state,
    constraintIssues: [],
    invalidDecisionKeys: new Set(),
  };
}
