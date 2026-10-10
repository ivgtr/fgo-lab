import { mergeInputDefinitions } from './stackQuantities';
import {
  getBaseNoblePhantasmGroup,
  getBaseNoblePhantasmVariantForForm,
  findActorForm,
  type EffectExecutionOperation,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import { servantAttribute } from '@fgo-lab/calc-core';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import { planOperationActivations } from './activation';
import type {
  BattleOperation,
  EffectProjection,
  ExecutionIssue,
  ExecutionPhase,
} from './contracts';
import type { PreparedOrderedScenario, ResolvedScenario } from './executionTypes';
import { compileEffectCached, runtimeInputDefinitionsForSource } from './operationCompiler';
import {
  collectOperationSources,
  collectDiagnosticOperationSources,
  completedPreparationStateFor,
  type ResolvedAttackerFormExecution,
} from './sourceCollection';
import { executionPlanActivation } from './executionPlanActivation';
import { resolveTargetCandidates } from './targetContext';
import { compileNoblePhantasmDamageOperation } from './npDamageCompilation';
import { effectChangesPreparation } from './preparationTransaction';
import { operationSourceFor, retainCompiledSources } from './executionSourceObservation';
import { closeResourceMutationSemantics } from './resourceSemantics';
import { bindExecutionOperation, pendingNoblePhantasmSourceBinding } from './executionBinding';
import { captureInitialPreparationFacts } from './preparationInitialFacts';
import { noblePhantasmVariantKey } from '@fgo-lab/master-data';

function preparedPreparationExecution(
  formExecution: ResolvedAttackerFormExecution | null,
  issues: readonly ExecutionIssue[],
  diagnostic: boolean,
  continuation: ResolvedAttackerFormExecution['diagnostic'],
): PreparedOrderedScenario['preparationExecution'] {
  if (!formExecution) {
    if (diagnostic) throw new TypeError('diagnostic_preparation_state_required');
    return { kind: 'unavailable', issues };
  }
  const initial = formExecution.initializationExecution?.before;
  if (!initial) throw new TypeError('missing_initial_preparation_execution');
  const initialFacts = captureInitialPreparationFacts(initial);
  if (diagnostic) {
    if (!continuation) throw new TypeError('diagnostic_preparation_continuation_required');
    return { kind: 'diagnostic', state: formExecution.state, initialFacts, continuation };
  }
  return { kind: 'available', state: completedPreparationStateFor(formExecution), initialFacts };
}

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
  const { executionScenario, staleAttackerFactIssues } = executionPlanActivation(
    scenario,
    operations,
    collected.sources,
    collected.formExecution,
  );
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
    readExpressions: operations.flatMap((operation) =>
      operation.kind === 'executeNpDamage' ? [operation.specialAttackDependency] : [],
    ),
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
  const preparationExecution = preparedPreparationExecution(
    collected.formExecution,
    collected.issues,
    diagnostic,
    resolvedFormExecution?.diagnostic,
  );
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
