import type { ExecutableBattleState, ExecutionIssue, TargetPredicateAssertion } from './contracts';
import type { PreparedOrderedScenario } from './executionTypes';
import type { CandidateSelections } from './candidateSelection';
import { validateConstraintSet } from './constraints';
import { applyWorldFacts } from './state';
import {
  initialSelectionFixedFacts,
  validateSelectedFormConstraints,
} from './formConstraintValidation';
import {
  applySelectedNoblePhantasmContext,
  resolveSelectedNoblePhantasmVariant,
} from './variantSelection';

export interface CandidateConstraintResult {
  state: ExecutableBattleState;
  constraintIssues: readonly ExecutionIssue[];
  invalidDecisionKeys: Set<string>;
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
