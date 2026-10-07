import type {
  BattleOperation,
  ExecutableBattleState,
  ConditionExpression,
  EffectDecision,
} from './contracts';
import {
  activationRequirementsSatisfied,
  evaluateCondition,
  readOperationCondition,
} from './condition';
import type { SatisfiableConditionConstraint } from './constraints';

interface DecisionCondition {
  readonly expression: ConditionExpression;
  readonly operation: BattleOperation | null;
}

function decisionConditionTruth(
  condition: DecisionCondition,
  state: ExecutableBattleState,
): boolean | null {
  return condition.operation
    ? readOperationCondition(condition.operation, state).truth
    : evaluateCondition(condition.expression, state).truth;
}

export function collectDecisionConditions(
  operations: readonly BattleOperation[],
): ReadonlyMap<string, readonly DecisionCondition[]> {
  const conditionsByDecisionKey = new Map<string, DecisionCondition[]>();
  for (const operation of operations) {
    if (operation.decisionKey) {
      const conditions = conditionsByDecisionKey.get(operation.decisionKey) ?? [];
      conditions.push({ expression: operation.condition, operation });
      conditionsByDecisionKey.set(operation.decisionKey, conditions);
    }
    if (operation.kind === 'executeNpDamage' && operation.specialAttackDecisionKey) {
      const conditions = conditionsByDecisionKey.get(operation.specialAttackDecisionKey) ?? [];
      conditions.push({ expression: operation.specialAttackCondition, operation: null });
      conditionsByDecisionKey.set(operation.specialAttackDecisionKey, conditions);
    }
  }
  return conditionsByDecisionKey;
}

export function resolveSatisfiedDecisionKeys(
  decisions: ReadonlyMap<string, EffectDecision>,
  conditionsByDecisionKey: ReadonlyMap<string, readonly DecisionCondition[]>,
  state: ExecutableBattleState,
): ReadonlySet<string> {
  return new Set(
    [...decisions].flatMap(([decisionKey, decision]) => {
      if (!decision.operationEnabled) return [];
      const conditions = conditionsByDecisionKey.get(decisionKey);
      if (!conditions) return [];
      return conditions.every((condition) => {
        const evaluated = decisionConditionTruth(condition, state);
        return (
          evaluated === true ||
          (evaluated === null &&
            decision.conditionSatisfaction === 'assumeSatisfied' &&
            activationRequirementsSatisfied(condition.expression, state))
        );
      })
        ? [decisionKey]
        : [];
    }),
  );
}

export function assumedDecisionConstraints(
  decisions: readonly EffectDecision[],
  conditionsByDecisionKey: ReadonlyMap<string, readonly DecisionCondition[]>,
  state: ExecutableBattleState,
  enforceKnownFalseDecisionKeys: ReadonlySet<string> = new Set(),
): readonly SatisfiableConditionConstraint[] {
  return decisions.flatMap((decision) => {
    const expressions = conditionsByDecisionKey.get(decision.decisionKey);
    if (
      !decision.operationEnabled ||
      decision.conditionSatisfaction !== 'assumeSatisfied' ||
      !expressions
    )
      return [];
    return expressions.flatMap((condition) => {
      const evaluated = evaluateCondition(condition.expression, state).truth;
      return (evaluated === null ||
        (enforceKnownFalseDecisionKeys.has(decision.decisionKey) && !evaluated)) &&
        activationRequirementsSatisfied(condition.expression, state)
        ? [{ sourceKey: decision.decisionKey, expression: condition.expression }]
        : [];
    });
  });
}
