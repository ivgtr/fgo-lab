import { hpPermille } from './hpResource';
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
import { createInitialBattleState } from './state';
import { materializeTargetCandidate, type TargetCandidate } from './targetContext';
import type { PreparedOrderedScenario, ResolvedCanonicalInputSet } from './executionTypes';
import { resolveCompileProjections } from './candidateDecisions';
import { resolveStochasticOutcomes, type ResolvedStochasticOutcome } from './stochasticOutcomes';
import {
  resolveCandidateSelections,
  validateCandidateSelections,
  type OperationActivation,
} from './candidateSelection';

interface PreparedCandidateBase {
  candidateInput: DamageResolutionInput;
  targetFacts: readonly TargetPredicateAssertion[];
  decisions: ReadonlyMap<string, EffectDecision>;
  stochasticOutcomes: ReadonlyMap<string, ResolvedStochasticOutcome>;
  stochasticOutcomeIssues: readonly ExecutionIssue[];
}

export interface ReadyCandidateExecution extends PreparedCandidateBase {
  status: 'ready';
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
  initialState.hp = prepared.hp;
  if (prepared.hp)
    initialState.quantities.attackerHpPermille = hpPermille(prepared.hp.actors.attacker);
  seedStackQuantities(initialState, prepared.inputDefinitions);
  const selections = resolveCandidateSelections(
    prepared,
    decisions,
    stochasticOutcomes,
    initialState,
  );
  const validated = validateCandidateSelections(prepared, targetFacts, initialState, selections);
  return {
    ...base,
    status: 'ready',
    ...selections,
    ...validated,
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
      issues: activation.issues,
      resolvedCompileProjections: resolveCompileProjections(
        prepared.compileProjections,
        base.decisions,
        new Set(),
      ),
    };
  return prepareExecutableCandidate(prepared, resolvedInputs, base, activation.context);
}
