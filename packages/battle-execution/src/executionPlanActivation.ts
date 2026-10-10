import { activationFactKey, analyzeActivationFactSet } from '@fgo-lab/schema';
import { analyzeActivationCondition } from './activationCondition';
import { compileEffectCondition } from './operationCompiler';
import {
  activationRequirementOwnerSelected,
  collectActivationRequirementOwners,
} from './activationContext';
import type { BattleOperation } from './contracts';
import type { SourceEffect, ResolvedAttackerFormExecution } from './sourceCollection';
import type { ResolvedScenario } from './executionTypes';

export function executionPlanActivation(
  scenario: ResolvedScenario,
  operations: readonly BattleOperation[],
  sources: readonly SourceEffect[],
  formExecution: ResolvedAttackerFormExecution | null,
) {
  const activationRequirements = collectActivationRequirementOwners(operations);
  const requiredFactKeys = new Set(
    activationRequirements.flatMap(({ facts }) => facts.map(activationFactKey)),
  );
  // A committed preparation choice may select an effect on the source actor only.
  // Validate its original family before removing facts with no damage-phase reader.
  const committedChoiceFamilies = new Set(
    sources.flatMap((source) =>
      source.hpExecutionCommitted && source.effect.selection?.kind === 'playerChoice'
        ? [
            JSON.stringify([
              source.origin,
              source.sourceInstanceId,
              source.skillId,
              source.effect.selection.group.key,
            ]),
          ]
        : [],
    ),
  );
  const preparationChoiceKeys = new Set(
    sources.flatMap((source) => {
      const selection = source.effect.selection;
      if (
        selection?.kind !== 'playerChoice' ||
        !committedChoiceFamilies.has(
          JSON.stringify([
            source.origin,
            source.sourceInstanceId,
            source.skillId,
            selection.group.key,
          ]),
        )
      )
        return [];
      const analysis = analyzeActivationCondition(
        compileEffectCondition(
          source.effect,
          source.origin,
          source.sourceId,
          source.sourceInstanceId,
          source.skillId,
        ),
      );
      return analysis.status === 'supported'
        ? analysis.atoms.filter((fact) => fact.kind === 'choice').map(activationFactKey)
        : [];
    }),
  );
  const validPreparationChoices =
    analyzeActivationFactSet(scenario.activationFacts).status === 'valid';
  const preparationFacts =
    formExecution?.actions.flatMap(({ activationFacts }) =>
      activationFacts.filter((fact) => requiredFactKeys.has(activationFactKey(fact))),
    ) ?? [];
  const decisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  const intrinsicFacts = activationRequirements.flatMap((owner) =>
    activationRequirementOwnerSelected(owner, decisions)
      ? owner.facts.filter(
          (fact) =>
            fact.kind === 'operationTrigger' &&
            !preparationFacts.some(
              (candidate) => activationFactKey(candidate) === activationFactKey(fact),
            ),
        )
      : [],
  );
  const derivedFacts = new Map(
    [...preparationFacts, ...intrinsicFacts].map((fact) => [activationFactKey(fact), fact]),
  );
  const staleAttackerFactIssues = scenario.activationFacts.flatMap((fact) =>
    fact.source.origin === 'attacker'
      ? [
          {
            kind: 'invalidActivationContext' as const,
            detail: 'orphanFact' as const,
            factKey: activationFactKey(fact),
          },
        ]
      : [],
  );
  const executionScenario: ResolvedScenario = {
    ...scenario,
    activationFacts: [
      ...new Map(
        [
          ...scenario.activationFacts.filter(
            (fact) =>
              fact.source.origin !== 'attacker' &&
              !(
                validPreparationChoices &&
                preparationChoiceKeys.has(activationFactKey(fact)) &&
                !requiredFactKeys.has(activationFactKey(fact))
              ),
          ),
          ...derivedFacts.values(),
        ].map((fact) => [activationFactKey(fact), fact]),
      ).values(),
    ].sort((left, right) => activationFactKey(left).localeCompare(activationFactKey(right))),
  };
  return { executionScenario, staleAttackerFactIssues };
}
