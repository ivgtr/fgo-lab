import {
  getBaseNoblePhantasmGroup,
  getBaseNoblePhantasmVariantForForm,
  findActorForm,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import { servantAttribute } from '@fgo-lab/calc-core';
import { activationFactKey, type DamageResolutionInput } from '@fgo-lab/schema';
import { planOperationActivations } from './activation';
import type { BattleOperation, EffectProjection, ExecutionPhase } from './contracts';
import type { PreparedOrderedScenario, ResolvedScenario } from './executionTypes';
import { compileEffectCached, runtimeInputDefinitionsForSource } from './operationCompiler';
import { collectOperationSources } from './sourceCollection';
import {
  activationRequirementOwnerSelected,
  collectActivationRequirementOwners,
} from './activationContext';
import { resolveTargetCandidates } from './targetContext';
import { compileNoblePhantasmDamageOperation } from './npDamageCompilation';
import { effectChangesPreparation } from './preparationTransaction';
import type { ResolvedAttackerFormExecution } from './sourceCollection';
import { closeResourceMutationSemantics } from './resourceSemantics';
export function compileExecutionPlan(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  resolvedFormExecution?: ResolvedAttackerFormExecution,
): PreparedOrderedScenario {
  const attacker = master.servants.find((servant) => servant.id === baseInput.attackerId);
  const collected = collectOperationSources(baseInput, scenario, master, resolvedFormExecution);
  const compiledOperations: BattleOperation[] = [];
  const compileProjections: EffectProjection[] = [];
  const retainedProjections: EffectProjection[] = [];
  for (const source of collected.sources) {
    const compiled = compileEffectCached(
      source,
      compiledOperations.length,
      attacker?.actorFormGraph.forms,
    );
    compiledOperations.push(...compiled.operations);
    for (const projection of compiled.projections)
      if (
        projection.executionSupport === 'supported' &&
        projection.explanation.code === 'stateMutationOnly'
      )
        retainedProjections.push(projection);
      else compileProjections.push(projection);
  }
  const baseVariant = attacker
    ? getBaseNoblePhantasmVariantForForm(attacker, scenario.attacker.initialActorFormId)
    : undefined;
  const variantGroup = attacker ? getBaseNoblePhantasmGroup(attacker) : undefined;
  const damage = baseVariant?.kind === 'attack' ? baseVariant.damage[0] : undefined;
  const initialForm = attacker
    ? findActorForm(attacker, scenario.attacker.initialActorFormId)
    : undefined;
  if (attacker)
    for (const variant of variantGroup?.variants ?? []) {
      if (variant.kind !== 'attack') continue;
      const variantDamage = variant.damage[0];
      if (!variantDamage) throw new TypeError('attack_variant_damage_function_missing');
      const np = compileNoblePhantasmDamageOperation(
        baseInput,
        scenario,
        attacker,
        variant,
        variantDamage,
        compiledOperations.length,
      );
      compileProjections.push(...np.projections);
      compiledOperations.push(np.operation);
    }
  if (!baseVariant)
    throw new TypeError(`missing_base_noble_phantasm_variant:${baseInput.attackerId}`);
  const phaseOrder: Record<ExecutionPhase, number> = {
    passive: 0,
    attackerSkill: 1,
    preparationNoblePhantasm: 1,
    craftEssence: 3,
    support: 4,
    mysticCode: 5,
    beforeNpDamage: 6,
    damageEvaluation: 7,
    npDamage: 8,
  };
  const operations = [
    ...planOperationActivations(closeResourceMutationSemantics(compiledOperations)),
  ]
    .sort(
      (left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || left.order - right.order,
    )
    .map((operation, order) => ({ ...operation, order }));
  const activationRequirements = collectActivationRequirementOwners(operations);
  const requiredFactKeys = new Set(
    activationRequirements.flatMap(({ facts }) => facts.map(activationFactKey)),
  );
  const preparationFacts =
    collected.formExecution?.actions.flatMap(({ activationFacts }) =>
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
          ...scenario.activationFacts.filter(({ source }) => source.origin !== 'attacker'),
          ...derivedFacts.values(),
        ].map((fact) => [activationFactKey(fact), fact]),
      ).values(),
    ].sort((left, right) => activationFactKey(left).localeCompare(activationFactKey(right))),
  };
  const conditionByDecisionKey = new Map(
    operations.flatMap((operation) =>
      operation.decisionKey ? [[operation.decisionKey, operation.condition] as const] : [],
    ),
  );
  const targetConstraints = executionScenario.effectDecisions.flatMap((decision) => {
    const expression = conditionByDecisionKey.get(decision.decisionKey);
    return decision.operationEnabled &&
      decision.conditionSatisfaction === 'assumeSatisfied' &&
      expression
      ? [{ sourceKey: decision.decisionKey, expression }]
      : [];
  });
  const attackerClass = attacker?.classId ?? '';
  const attackerAttribute = servantAttribute(attacker?.traits ?? []);
  const targetResolution = resolveTargetCandidates({
    context: scenario.targetContext,
    attackerClass,
    attackerAttribute,
    domain: master.targetSemantics.execution,
    constraints: targetConstraints,
  });
  const preparationInputDefinitions = collected.sources
    .filter(({ effect }) => effectChangesPreparation(effect))
    .flatMap(runtimeInputDefinitionsForSource);
  const inputDefinitions = new Map(
    [
      ...operations.flatMap((operation) => operation.inputDefinitions),
      ...preparationInputDefinitions,
      ...(collected.formExecution?.requiredInputs ?? []),
    ].map((definition) => [definition.key, definition] as const),
  );
  return {
    baseInput,
    scenario: executionScenario,
    attackerTraits: initialForm?.traits ?? [],
    baseNoblePhantasmVariant: baseVariant,
    noblePhantasmVariants: variantGroup?.variants ?? [],
    attackerPredicates: attacker?.predicates ?? [],
    damage,
    operations,
    compileProjections,
    retainedProjections,
    sourceIssues: [...collected.issues, ...staleAttackerFactIssues],
    targetResolution,
    targetDomain: master.targetSemantics.execution,
    attackerClass,
    attackerAttribute,
    inputDefinitions: [...inputDefinitions.values()],
    preparationRequiredInputs: collected.formExecution?.requiredInputs ?? [],
    preparationInputKeys: new Set([
      ...preparationInputDefinitions.map(({ key }) => key),
      ...(collected.formExecution?.requiredInputs.map(({ key }) => key) ?? []),
    ]),
    appliedPreparationActions: collected.formExecution?.actions ?? [],
  };
}
