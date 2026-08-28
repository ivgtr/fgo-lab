import {
  activationRequirementOwnerSelected,
  conditionHasActivationFact,
  type ActivationRequirementOwner,
  type ConditionExpression,
  type EffectProjection,
} from '@fgo-lab/battle-execution';
import { activationFactKey, type ActivationFact, type CalculationScenario } from '@fgo-lab/schema';

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

function choiceGroupKey(fact: Extract<ActivationFact, { kind: 'choice' }>): string {
  return JSON.stringify([fact.source, fact.family]);
}

function selectedRequirementKeys(
  scenario: ResolvedScenario,
  owners: readonly ActivationRequirementOwner[],
): Set<string> {
  const decisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  return new Set(
    owners.flatMap((owner) =>
      activationRequirementOwnerSelected(owner, decisions)
        ? owner.facts.map(activationFactKey)
        : [],
    ),
  );
}

/** Updates primary selections and prunes facts no selected compiled operation reads. */
export function applyActivationFactSelection(
  scenario: ResolvedScenario,
  facts: readonly ActivationFact[],
  selected: boolean,
  owners: readonly ActivationRequirementOwner[],
): ResolvedScenario {
  const selectedChoiceGroups = new Map(
    facts.flatMap((fact) =>
      fact.kind === 'choice' ? [[choiceGroupKey(fact), fact.candidate] as const] : [],
    ),
  );
  const requestedKeys = new Set(facts.map(activationFactKey));
  const referenced = selectedRequirementKeys(scenario, owners);
  const next = scenario.activationFacts.filter((fact) => {
    if (
      !selected &&
      requestedKeys.has(activationFactKey(fact)) &&
      !referenced.has(activationFactKey(fact))
    )
      return false;
    return !(
      selected &&
      fact.kind === 'choice' &&
      selectedChoiceGroups.has(choiceGroupKey(fact)) &&
      selectedChoiceGroups.get(choiceGroupKey(fact)) !== fact.candidate
    );
  });
  if (selected) {
    const keys = new Set(next.map(activationFactKey));
    for (const fact of facts) {
      const key = activationFactKey(fact);
      if (!keys.has(key)) {
        next.push(fact);
        keys.add(key);
      }
    }
  }
  return {
    ...scenario,
    activationFacts: next
      .filter((fact) => referenced.has(activationFactKey(fact)))
      .sort((left, right) => activationFactKey(left).localeCompare(activationFactKey(right))),
  };
}

/** Materializes action facts that are fixed by the compiled source itself, not by a user choice. */
export function materializeIntrinsicActivationFacts(
  scenario: ResolvedScenario,
  owners: readonly ActivationRequirementOwner[],
): ResolvedScenario {
  const decisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  const intrinsic = owners.flatMap((owner) =>
    activationRequirementOwnerSelected(owner, decisions)
      ? owner.facts.filter((fact) => fact.kind === 'operationTrigger')
      : [],
  );
  const factsByKey = new Map(
    [...scenario.activationFacts, ...intrinsic].map((fact) => [activationFactKey(fact), fact]),
  );
  return {
    ...scenario,
    activationFacts: [...factsByKey.values()].sort((left, right) =>
      activationFactKey(left).localeCompare(activationFactKey(right)),
    ),
  };
}

export function setActivationFactsForProjection(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  enabled: boolean,
  owners: readonly ActivationRequirementOwner[],
): ResolvedScenario {
  if (projection.decision.state === 'none') return scenario;
  const decisionKey = projection.decision.decisionKey;
  const linkedFacts = owners.flatMap((owner) => {
    const linked =
      owner.decisionKey === decisionKey ||
      (owner.activation.kind === 'linkedDecisions' &&
        owner.activation.links.some((link) => link.decisionKey === decisionKey));
    return linked ? owner.facts : [];
  });
  const factsByKey = new Map(
    [...activationFactsForCondition(projection.explanation.condition), ...linkedFacts].map(
      (fact) => [activationFactKey(fact), fact],
    ),
  );
  return applyActivationFactSelection(scenario, [...factsByKey.values()], enabled, owners);
}
