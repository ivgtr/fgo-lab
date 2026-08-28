import type {
  BattleOperation,
  BattleState,
  ConditionExpression,
  EffectDecision,
} from './contracts';
import { activationRequirementsSatisfied, evaluateCondition } from './condition';
import type { SatisfiableConditionConstraint } from './constraints';

export function collectDecisionConditions(
  operations: readonly BattleOperation[],
): ReadonlyMap<string, readonly ConditionExpression[]> {
  const conditionsByDecisionKey = new Map<string, ConditionExpression[]>();
  for (const operation of operations) {
    if (!operation.decisionKey) continue;
    const conditions = conditionsByDecisionKey.get(operation.decisionKey) ?? [];
    conditions.push(operation.condition);
    conditionsByDecisionKey.set(operation.decisionKey, conditions);
  }
  return conditionsByDecisionKey;
}

export function resolveSatisfiedDecisionKeys(
  decisions: ReadonlyMap<string, EffectDecision>,
  conditionsByDecisionKey: ReadonlyMap<string, readonly ConditionExpression[]>,
  state: BattleState,
): ReadonlySet<string> {
  return new Set(
    [...decisions].flatMap(([decisionKey, decision]) => {
      if (!decision.operationEnabled) return [];
      const conditions = conditionsByDecisionKey.get(decisionKey);
      if (!conditions) return [];
      return conditions.some((condition) => {
        const evaluated = evaluateCondition(condition, state);
        return (
          evaluated === true ||
          (evaluated === null &&
            decision.conditionSatisfaction === 'assumeSatisfied' &&
            activationRequirementsSatisfied(condition, state))
        );
      })
        ? [decisionKey]
        : [];
    }),
  );
}

export function assumedDecisionConstraints(
  decisions: readonly EffectDecision[],
  conditionsByDecisionKey: ReadonlyMap<string, readonly ConditionExpression[]>,
  state: BattleState,
): readonly SatisfiableConditionConstraint[] {
  return decisions.flatMap((decision) => {
    const expressions = conditionsByDecisionKey.get(decision.decisionKey);
    if (
      !decision.operationEnabled ||
      decision.conditionSatisfaction !== 'assumeSatisfied' ||
      !expressions
    )
      return [];
    return expressions.flatMap((expression) =>
      evaluateCondition(expression, state) === null &&
      activationRequirementsSatisfied(expression, state)
        ? [
            {
              sourceKey: decision.decisionKey,
              expression,
            },
          ]
        : [],
    );
  });
}
