import {
  conditionHasActivationFact,
  type ConditionExpression,
  type EffectProjection,
} from '@fgo-lab/battle-execution';
import {
  activationFactKey,
  type ActivationFact,
  type ActivationWitness,
  type CalculationScenario,
} from '@fgo-lab/schema';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function activationFactsForCondition(
  condition: ConditionExpression | null,
): ActivationFact[] {
  if (condition === null) return [];
  if (
    condition.kind === 'choice' ||
    condition.kind === 'operationTrigger' ||
    condition.kind === 'sourceQuantity'
  )
    return [condition];
  if (condition.kind === 'all') return condition.expressions.flatMap(activationFactsForCondition);
  if (condition.kind === 'any') {
    const branches = condition.expressions.filter(conditionHasActivationFact);
    if (branches.length === 0) return [];
    if (branches.length !== 1) throw new TypeError('ambiguous_activation_condition_alternative');
    return activationFactsForCondition(branches[0]!);
  }
  if (condition.kind === 'not' && conditionHasActivationFact(condition.expression))
    throw new TypeError('negated_activation_condition_unsupported');
  return [];
}

export function conditionHasNonActivationDecision(condition: ConditionExpression | null): boolean {
  if (condition === null) return false;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(conditionHasNonActivationDecision);
  if (condition.kind === 'not') return conditionHasNonActivationDecision(condition.expression);
  return (
    condition.kind === 'trait' ||
    condition.kind === 'traitCount' ||
    condition.kind === 'targetPredicate' ||
    condition.kind === 'quantity' ||
    condition.kind === 'inputQuantity'
  );
}

export function setActivationFactsForProjection(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  enabled: boolean,
): ResolvedScenario {
  if (projection.decision.state === 'none') return scenario;
  const decisionKey = projection.decision.decisionKey;
  const facts = activationFactsForCondition(projection.explanation.condition);
  return {
    ...scenario,
    activationWitnesses: setActivationWitnessesForConsumer(
      scenario.activationWitnesses,
      decisionKey,
      facts,
      enabled,
    ),
  };
}

export function setActivationWitnessesForConsumer(
  currentWitnesses: readonly ActivationWitness[],
  decisionKey: string,
  facts: readonly ActivationFact[],
  enabled: boolean,
): ActivationWitness[] {
  const selectedChoices = new Map(
    facts.flatMap((fact) =>
      fact.kind === 'choice' ? [[fact.group, fact.candidate] as const] : [],
    ),
  );
  const withoutConsumer = currentWitnesses.flatMap((witness) => {
    const consumerDecisionKeys = witness.consumerDecisionKeys.filter((key) => key !== decisionKey);
    return consumerDecisionKeys.length > 0 ? [{ ...witness, consumerDecisionKeys }] : [];
  });
  const compatible = withoutConsumer.filter(
    ({ fact }) =>
      !(
        enabled &&
        fact.kind === 'choice' &&
        selectedChoices.has(fact.group) &&
        selectedChoices.get(fact.group) !== fact.candidate
      ),
  );
  const activationWitnesses = enabled
    ? facts.reduce<ActivationWitness[]>((witnesses, fact) => {
        const factKey = activationFactKey(fact);
        const existing = witnesses.find((witness) => activationFactKey(witness.fact) === factKey);
        if (!existing)
          return [...witnesses, { fact, consumerDecisionKeys: [decisionKey] }].sort((left, right) =>
            activationFactKey(left.fact).localeCompare(activationFactKey(right.fact)),
          );
        return witnesses.map((witness) =>
          witness === existing
            ? {
                ...witness,
                consumerDecisionKeys: [
                  ...new Set([...witness.consumerDecisionKeys, decisionKey]),
                ].sort(),
              }
            : witness,
        );
      }, compatible)
    : compatible;
  return activationWitnesses;
}
