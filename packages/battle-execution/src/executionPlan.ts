import { mergeInputDefinitions } from './stackQuantities';
import {
  getBaseNoblePhantasmGroup,
  getBaseNoblePhantasmVariantForForm,
  findActorForm,
  type EffectExecutionOperation,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import { servantAttribute } from '@fgo-lab/calc-core';
import {
  activationFactKey,
  analyzeActivationFactSet,
  type DamageResolutionInput,
} from '@fgo-lab/schema';
import { analyzeActivationCondition } from './activationCondition';
import { planOperationActivations } from './activation';
import type { BattleOperation, EffectProjection, ExecutionPhase } from './contracts';
import type { PreparedOrderedScenario, ResolvedScenario } from './executionTypes';
import {
  compileEffectCached,
  compileEffectCondition,
  runtimeInputDefinitionsForSource,
} from './operationCompiler';
import {
  collectOperationSources,
  collectDiagnosticOperationSources,
  type ResolvedAttackerFormExecution,
} from './sourceCollection';
import {
  activationRequirementOwnerSelected,
  collectActivationRequirementOwners,
} from './activationContext';
import { resolveTargetCandidates } from './targetContext';
import { compileNoblePhantasmDamageOperation } from './npDamageCompilation';
import { effectChangesPreparation } from './preparationTransaction';
import { operationSourceFor, retainCompiledSources } from './executionSourceObservation';
import { closeResourceMutationSemantics } from './resourceSemantics';
import { bindExecutionOperation, pendingNoblePhantasmSourceBinding } from './executionBinding';
import { noblePhantasmVariantKey } from '@fgo-lab/master-data';
export function compileExecutionPlan(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  resolvedFormExecution?: ResolvedAttackerFormExecution,
): PreparedOrderedScenario {
  return compileExecutionPlanForPurpose(baseInput, scenario, master, resolvedFormExecution, false);
}

export function compileDiagnosticExecutionPlan(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  rejected: ResolvedAttackerFormExecution,
): PreparedOrderedScenario {
  if (!rejected.rejection || rejected.diagnostic?.kind !== 'rejectedPreparationDiagnostic')
    throw new TypeError('rejected_preparation_diagnostic_required');
  return compileExecutionPlanForPurpose(baseInput, scenario, master, rejected, true);
}

function compileExecutionPlanForPurpose(
  baseInput: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  resolvedFormExecution: ResolvedAttackerFormExecution | undefined,
  diagnostic: boolean,
): PreparedOrderedScenario {
  const attacker = master.servants.find((servant) => servant.id === baseInput.attackerId);
  const collected = diagnostic
    ? collectDiagnosticOperationSources(baseInput, scenario, master, resolvedFormExecution!)
    : collectOperationSources(baseInput, scenario, master, resolvedFormExecution);
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
      const action = collected.formExecution?.actions.at(-1);
      const operation =
        action?.sourceKind === 'attackNoblePhantasm' &&
        action.sourceId === noblePhantasmVariantKey(variant.ref)
          ? bindExecutionOperation(
              np.operation,
              pendingNoblePhantasmSourceBinding(
                action,
                np.operation.source.sourceInstanceId,
                np.operation.source.effectOccurrenceId,
                baseInput.npLevel - 1,
              ),
              -1,
            )
          : np.operation;
      compileProjections.push(...np.projections);
      compiledOperations.push(operation);
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
  // A committed preparation choice may select an effect on the source actor only.
  // Validate its original family before removing facts with no damage-phase reader.
  const committedChoiceFamilies = new Set(
    collected.sources.flatMap((source) =>
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
    collected.sources.flatMap((source) => {
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
  const inputDefinitions = mergeInputDefinitions([
    ...operations.flatMap((operation) => operation.inputDefinitions),
    ...preparationInputDefinitions,
    ...(collected.formExecution?.state.ocInputDefinitions ?? []),
    ...(collected.formExecution?.state.hp?.inputDefinitions ?? []),
    ...(collected.formExecution?.requiredInputs.map(({ definition }) => definition) ?? []),
  ]);
  let preparationExecution: PreparedOrderedScenario['preparationExecution'];
  if (diagnostic)
    preparationExecution = {
      kind: 'diagnostic',
      state: collected.formExecution!.state,
      continuation: resolvedFormExecution!.diagnostic!,
    };
  else
    preparationExecution = collected.formExecution
      ? { kind: 'available', state: collected.formExecution.state }
      : { kind: 'unavailable', issues: collected.issues };
  const plan: PreparedOrderedScenario = {
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
    inputDefinitions,
    preparationRequiredInputs: collected.formExecution?.requiredInputs ?? [],
    preparationInputKeys: new Set([
      ...preparationInputDefinitions.map(({ key }) => key),
      ...(collected.formExecution?.state.hp?.inputDefinitions?.map(({ key }) => key) ?? []),
      ...(collected.formExecution?.state.ocInputDefinitions.map(({ key }) => key) ?? []),
      ...(collected.formExecution?.requiredInputs.map(({ definition }) => definition.key) ?? []),
    ]),
    preparationExecution,
    battlePointDomains: master.battlePointDomains,
    appliedPreparationActions: collected.formExecution?.actions ?? [],
  };
  const sourceOperations = new Map<string, EffectExecutionOperation | null>();
  for (const operation of compiledOperations) {
    const original = operationSourceFor(operation);
    if (!original) continue;
    sourceOperations.set(
      operation.operationId,
      sourceOperations.has(operation.operationId) ? null : original,
    );
  }
  retainCompiledSources(plan, collected.sources, sourceOperations);
  return plan;
}
