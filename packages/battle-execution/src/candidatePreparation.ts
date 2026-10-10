import { hpPermille } from './hpResource';
import {
  cloneInputFacts,
  rejectInputFact,
  seedUnreadInputFacts,
  writeInputFact,
} from './inputFacts';
import type { ConditionFactProof } from './conditionRead';
import { applyWorldFacts, createInitialBattleState } from './state';
import { seedStackQuantities } from './stackQuantities';
import type { DamageResolutionInput } from '@fgo-lab/schema';
import type {
  ActivationContext,
  BattleOperation,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  ExecutableBattleState,
  TargetPredicateAssertion,
} from './contracts';
import { buildActivationContext } from './activationContext';
import type { SatisfiableConditionConstraint } from './constraints';
import { materializeTargetCandidate, type TargetCandidate } from './targetContext';
import type { PreparedOrderedScenario, ResolvedCanonicalInputSet } from './executionTypes';
import { resolveCompileProjections } from './candidateDecisions';
import { resolveStochasticOutcomes, type ResolvedStochasticOutcome } from './stochasticOutcomes';
import { resolveCandidateSelections, type OperationActivation } from './candidateSelection';
import { validateCandidateSelections } from './candidateSelectionValidation';

interface PreparedCandidateBase {
  candidateInput: DamageResolutionInput;
  targetFacts: readonly TargetPredicateAssertion[];
  decisions: ReadonlyMap<string, EffectDecision>;
  stochasticOutcomes: ReadonlyMap<string, ResolvedStochasticOutcome>;
  stochasticOutcomeIssues: readonly ExecutionIssue[];
}

export interface ReadyCandidateExecution extends PreparedCandidateBase {
  status: 'ready';
  selectionBaseState: ExecutableBattleState;
  state: ExecutableBattleState;
  activations: ReadonlyMap<string, OperationActivation>;
  activeDecisionSourceInstances: ReadonlySet<string>;
  activeConditionConstraints: readonly SatisfiableConditionConstraint[];
  activeMutationConstraints: readonly SatisfiableConditionConstraint[];
  finalSelectedNoblePhantasmVariant:
    Extract<BattleOperation, { kind: 'selectNoblePhantasmVariant' }> | undefined;
  preappliedOperationIds: ReadonlySet<string>;
  supersededVariantTransactionKeys: ReadonlySet<string>;
  constraintIssues: readonly ExecutionIssue[];
  invalidDecisionKeys: Set<string>;
  resolvedCompileProjections: readonly EffectProjection[];
}

export interface InvalidActivationCandidateExecution extends PreparedCandidateBase {
  status: 'invalidActivationContext';
  failure: 'preparationUnavailable' | 'activationContext' | 'constraintConflict';
  issues: readonly ExecutionIssue[];
  resolvedCompileProjections: readonly EffectProjection[];
}

export type PreparedCandidateExecution =
  ReadyCandidateExecution | InvalidActivationCandidateExecution;

function prepareCandidateBase(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
): PreparedCandidateBase {
  const { baseInput, scenario, operations } = prepared;
  const materialized = targetCandidate
    ? materializeTargetCandidate(
        baseInput,
        prepared.attackerClass,
        prepared.attackerAttribute,
        targetCandidate,
      )
    : { input: baseInput, facts: [] };
  const candidateInput = materialized.input;
  const targetFacts = materialized.facts;
  const scenarioDecisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  const stochastic = resolveStochasticOutcomes(operations, resolvedInputs);
  return {
    candidateInput,
    targetFacts,
    decisions: scenarioDecisions,
    stochasticOutcomes: stochastic.outcomes,
    stochasticOutcomeIssues: stochastic.issues,
  };
}

function prepareExecutableCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  base: PreparedCandidateBase,
  activationContext: ActivationContext,
): ReadyCandidateExecution {
  const { attackerTraits, attackerPredicates, compileProjections } = prepared;
  const { candidateInput, targetFacts, decisions, stochasticOutcomes } = base;
  const initialState = createInitialBattleState(
    candidateInput,
    prepared.baseNoblePhantasmVariant,
    attackerTraits,
    resolvedInputs.values,
    targetFacts,
    attackerPredicates.map((predicate) => ({
      sourceKey: 'attacker-master',
      predicate,
      present: true,
    })),
    activationContext,
  );
  if (prepared.preparationExecution.kind === 'unavailable')
    throw new TypeError('preparation_execution_state_required');
  const preparationState = prepared.preparationExecution.state;
  const initialPreparationFacts = prepared.preparationExecution.initialFacts;
  initialState.hp = initialPreparationFacts.hp;
  let initialInputFacts = cloneInputFacts(initialPreparationFacts.inputFacts);
  const invalidKeys = new Set(resolvedInputs.invalidInputKeys);
  const rejectedDefinitions = [
    ...resolvedInputs.missingDefinitions,
    ...prepared.inputDefinitions.filter((definition) => invalidKeys.has(definition.key)),
  ];
  for (const definition of rejectedDefinitions) {
    const fact = initialInputFacts.get(definition.key);
    if (fact?.kind === 'known')
      initialInputFacts = rejectInputFact(initialInputFacts, definition, fact);
    else if (fact === undefined)
      initialInputFacts = writeInputFact(initialInputFacts, definition.key, null, []);
  }
  initialState.inputFacts = seedUnreadInputFacts(initialInputFacts, resolvedInputs.values, {
    kind: 'externalAssumption',
    clock: initialState.conditionReadClock,
  });
  initialState.battlePoints = initialPreparationFacts.battlePoints;
  initialState.battlePointDomains = prepared.battlePointDomains;
  initialState.resourceActor = 'attacker';
  initialState.buffInstances = initialPreparationFacts.buffInstances;
  const initialProof: ConditionFactProof = {
    kind: 'selectedInitialResource',
    clock: initialState.conditionReadClock,
  };
  for (const instance of initialState.buffInstances)
    (initialState.conditionFactProofs.markers as Map<string, ConditionFactProof>).set(
      instance.identity,
      initialProof,
    );
  {
    initialState.conditionFactProofs.quantities = new Map([
      ...initialState.conditionFactProofs.quantities,
      ...initialPreparationFacts.quantityProofs,
    ]);
  }
  if (initialPreparationFacts.hp)
    initialState.quantities.attackerHpPermille = hpPermille(
      initialPreparationFacts.hp.actors.attacker,
    );
  seedStackQuantities(initialState, prepared.inputDefinitions);
  const selections = resolveCandidateSelections(
    prepared,
    decisions,
    stochasticOutcomes,
    initialState,
  );
  const validated = validateCandidateSelections(prepared, targetFacts, initialState, selections);
  const preappliedOperations = prepared.operations.filter(({ operationId }) =>
    selections.preappliedOperationIds.has(operationId),
  );
  const hasNativeStructuralCommit = preappliedOperations.some(
    (operation) => operation.runtimeBinding?.sourcePhysicalCommitted,
  );
  const executionState =
    validated.constraintIssues.length || !hasNativeStructuralCommit
      ? validated.state
      : applyWorldFacts(initialState, prepared.scenario.worldFactAssertions);
  if (validated.constraintIssues.length === 0) {
    executionState.hp = preparationState.hp;
    executionState.battlePoints = preparationState.battlePoints;
    const quantityProofs = new Map(executionState.conditionFactProofs.quantities);
    for (const [actor, { domains }] of Object.entries(preparationState.battlePoints.actors))
      for (const subject of Object.keys(domains)) {
        const key = `battlePoint:${actor}:${subject}`;
        const proof = preparationState.conditionFactProofs.quantities.get(key);
        if (!proof) throw new TypeError(`preparation_battle_point_proof_required:${key}`);
        quantityProofs.set(key, proof);
      }
    executionState.conditionFactProofs.quantities = quantityProofs;
    executionState.quantities.attackerHpPermille = hpPermille(preparationState.hp?.actors.attacker);
  }
  return {
    ...base,
    status: 'ready',
    selectionBaseState: initialState,
    ...selections,
    preappliedOperationIds: hasNativeStructuralCommit
      ? new Set()
      : selections.preappliedOperationIds,
    ...validated,
    state: executionState,
    resolvedCompileProjections: resolveCompileProjections(
      compileProjections,
      decisions,
      validated.invalidDecisionKeys,
    ),
  };
}

export function prepareCandidateExecution(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
): PreparedCandidateExecution {
  const base = prepareCandidateBase(prepared, resolvedInputs, targetCandidate);
  if (prepared.preparationExecution.kind === 'unavailable')
    return {
      ...base,
      status: 'invalidActivationContext',
      failure: 'preparationUnavailable',
      issues: prepared.preparationExecution.issues,
      resolvedCompileProjections: [],
    };
  const activation = buildActivationContext(
    prepared.scenario.activationFacts,
    prepared.operations,
    base.decisions,
    base.stochasticOutcomes,
  );
  if (activation.status === 'invalid')
    return {
      ...base,
      status: 'invalidActivationContext',
      failure: 'activationContext',
      issues: activation.issues,
      resolvedCompileProjections: resolveCompileProjections(
        prepared.compileProjections,
        base.decisions,
        new Set(),
      ),
    };
  const candidate = prepareExecutableCandidate(prepared, resolvedInputs, base, activation.context);
  if (candidate.constraintIssues.some((issue) => issue.kind === 'constraintConflict'))
    return {
      ...base,
      status: 'invalidActivationContext',
      failure: 'constraintConflict',
      issues: candidate.constraintIssues,
      resolvedCompileProjections: candidate.resolvedCompileProjections,
    };
  return candidate;
}
