import {
  analyzeActivationCondition,
  activationRequirementOwnerSelected,
  type ActivationRequirementOwner,
  type EffectProjection,
} from '@fgo-lab/battle-execution';
import {
  activationChoiceGroupKey,
  activationFactKey,
  type ActivationFact,
  type CalculationScenario,
} from '@fgo-lab/schema';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

function materializableActivationFacts(projection: EffectProjection): readonly ActivationFact[] {
  if (projection.explanation.condition === null) return [];
  const analysis = analyzeActivationCondition(projection.explanation.condition);
  if (analysis.status === 'unsupported')
    throw new TypeError('negated_activation_condition_unsupported');
  if (analysis.materialization.kind === 'ambiguous')
    throw new TypeError('ambiguous_activation_condition_alternative');
  return analysis.materialization.kind === 'deterministic' ? analysis.materialization.facts : [];
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
      fact.kind === 'choice'
        ? [[activationChoiceGroupKey(fact.source, fact.family), fact.candidate] as const]
        : [],
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
      selectedChoiceGroups.has(activationChoiceGroupKey(fact.source, fact.family)) &&
      selectedChoiceGroups.get(activationChoiceGroupKey(fact.source, fact.family)) !==
        fact.candidate
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
    [...materializableActivationFacts(projection), ...linkedFacts].map((fact) => [
      activationFactKey(fact),
      fact,
    ]),
  );
  return applyActivationFactSelection(scenario, [...factsByKey.values()], enabled, owners);
}
