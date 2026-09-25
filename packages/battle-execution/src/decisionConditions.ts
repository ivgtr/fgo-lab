import type {
  BattleOperation,
  ExecutableBattleState,
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
    if (operation.decisionKey) {
      const conditions = conditionsByDecisionKey.get(operation.decisionKey) ?? [];
      conditions.push(operation.condition);
      conditionsByDecisionKey.set(operation.decisionKey, conditions);
    }
    if (operation.kind === 'executeNpDamage' && operation.specialAttackDecisionKey) {
      const conditions = conditionsByDecisionKey.get(operation.specialAttackDecisionKey) ?? [];
      conditions.push(operation.specialAttackCondition);
      conditionsByDecisionKey.set(operation.specialAttackDecisionKey, conditions);
    }
  }
  return conditionsByDecisionKey;
}

export function resolveSatisfiedDecisionKeys(
  decisions: ReadonlyMap<string, EffectDecision>,
  conditionsByDecisionKey: ReadonlyMap<string, readonly ConditionExpression[]>,
  state: ExecutableBattleState,
): ReadonlySet<string> {
  return new Set(
    [...decisions].flatMap(([decisionKey, decision]) => {
      if (!decision.operationEnabled) return [];
      const conditions = conditionsByDecisionKey.get(decisionKey);
      if (!conditions) return [];
      return conditions.every((condition) => {
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
    return expressions.flatMap((expression) => {
      const evaluated = evaluateCondition(expression, state);
      return (evaluated === null ||
        (enforceKnownFalseDecisionKeys.has(decision.decisionKey) && !evaluated)) &&
        activationRequirementsSatisfied(expression, state)
        ? [{ sourceKey: decision.decisionKey, expression }]
        : [];
    });
  });
}
