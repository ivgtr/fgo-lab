import type { BattleOperation, ExecutableBattleState } from './contracts';
import type { OperationActivation } from './candidateSelection';
import type { ContributionApplicationPolicy, PreparedOrderedScenario } from './executionTypes';
import { activationRequirementsSatisfied } from './condition';
import { contributionIsIncluded } from './effectiveContributions';
import { resolveModifierValue } from './projection';

export function operationEnabled(
  activation: OperationActivation,
  operation: BattleOperation,
  policy: ContributionApplicationPolicy,
  contributionIncluded: boolean,
): boolean {
  return (
    activation.stochasticOutcome.status === 'success' &&
    (activation.enabled ||
      (policy.kind === 'ranking' && operation.sourceEnabled && contributionIncluded))
  );
}

export function includedByPolicy(
  operation: BattleOperation,
  policy: ContributionApplicationPolicy,
): boolean {
  return contributionIsIncluded(operation, operation.condition, policy);
}

export function modifierValue(
  operation: BattleOperation,
  state: ExecutableBattleState,
): number | null {
  return operation.kind === 'addModifier' ? resolveModifierValue(operation, state) : null;
}

export function userConditionMet(
  operation: BattleOperation,
  condition: boolean | null,
  choice: PreparedOrderedScenario['scenario']['effectDecisions'][number] | undefined,
  state: ExecutableBattleState,
): boolean {
  return (
    condition === null &&
    choice?.conditionSatisfaction === 'assumeSatisfied' &&
    operation.decisionPlan.condition === 'userMayAssume' &&
    activationRequirementsSatisfied(operation.condition, state)
  );
}
