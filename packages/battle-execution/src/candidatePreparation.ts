import type { DamageResolutionInput } from '@fgo-lab/schema';
import type {
  ActivationContext,
  BattleOperation,
  BattleState,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  TargetPredicateAssertion,
} from './contracts';
import { resolveOperationActivation } from './activation';
import { buildActivationContext } from './activationContext';
import { activationRequirementsSatisfied, evaluateCondition } from './condition';
import {
  assumedDecisionConstraints,
  collectDecisionConditions,
  resolveSatisfiedDecisionKeys,
} from './decisionConditions';
import {
  fixedConstraintFactsFromState,
  validateConstraintSet,
  type SatisfiableConditionConstraint,
} from './constraints';
import { applyCardTypeMutation, applyWorldFacts, createInitialBattleState } from './state';
import { materializeTargetCandidate, type TargetCandidate } from './targetContext';
import type { PreparedOrderedScenario, ResolvedCanonicalInputSet } from './executionTypes';
import { decisionsWithProcSelections, resolveCompileProjections } from './candidateDecisions';

export type OperationActivation = ReturnType<typeof resolveOperationActivation>;
interface PreparedCandidateBase {
  candidateInput: DamageResolutionInput;
  targetFacts: readonly TargetPredicateAssertion[];
  decisions: ReadonlyMap<string, EffectDecision>;
  procSelectionIssues: readonly ExecutionIssue[];
}

export interface ReadyCandidateExecution extends PreparedCandidateBase {
  status: 'ready';
  state: BattleState;
  activations: ReadonlyMap<string, OperationActivation>;
  activeDecisionSourceInstances: ReadonlySet<string>;
  activeConditionConstraints: readonly SatisfiableConditionConstraint[];
  activeMutationConstraints: readonly SatisfiableConditionConstraint[];
  finalSelectedCardMutation: Extract<BattleOperation, { kind: 'changeCardType' }> | undefined;
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
  const proc = decisionsWithProcSelections(scenarioDecisions, operations, resolvedInputs.values);
  return {
    candidateInput,
    targetFacts,
    decisions: proc.decisions,
    procSelectionIssues: proc.issues,
  };
}

function prepareExecutableCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  base: PreparedCandidateBase,
  activationContext: ActivationContext,
): ReadyCandidateExecution {
  const { scenario, attackerTraits, attackerPredicates, operations, compileProjections } = prepared;
  const { candidateInput, targetFacts, decisions } = base;
  let state = createInitialBattleState(
    candidateInput,
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
  const conditionsByDecisionKey = collectDecisionConditions(operations);
  const satisfiedDecisionKeys = resolveSatisfiedDecisionKeys(
    decisions,
    conditionsByDecisionKey,
    state,
  );
  const activations = new Map(
    operations.map((operation) => [
      operation.operationId,
      resolveOperationActivation(operation, decisions, satisfiedDecisionKeys),
    ]),
  );
  const activeDecisionSourceInstances = new Set(
    operations
      .filter((operation) => activations.get(operation.operationId)!.activeDecisionKeys.length > 0)
      .map((operation) => operation.source.sourceInstanceId),
  );
  const activeConditionConstraints = assumedDecisionConstraints(
    scenario.effectDecisions,
    conditionsByDecisionKey,
    state,
  );
  const activeMutationConstraints: SatisfiableConditionConstraint[] = operations.flatMap(
    (operation) => {
      const activation = activations.get(operation.operationId)!;
      return activation.assumesLocalCondition
        ? [{ sourceKey: operation.operationId, expression: operation.condition }]
        : [];
    },
  );
  const selectedCardMutations = operations.filter((operation) => {
    if (operation.kind !== 'changeCardType') return false;
    if (activations.get(operation.operationId)?.enabled !== true) return false;
    if (operation.decisionPlan.condition !== 'userMayAssume') return true;
    const evaluated = evaluateCondition(operation.condition, state);
    if (evaluated === true) return true;
    return (
      evaluated === null &&
      operation.decisionKey !== null &&
      decisions.get(operation.decisionKey)?.conditionSatisfaction === 'assumeSatisfied' &&
      activationRequirementsSatisfied(operation.condition, state)
    );
  }) as Extract<BattleOperation, { kind: 'changeCardType' }>[];
  const finalSelectedCardMutation = selectedCardMutations.at(-1);
  const validation = validateConstraintSet({
    fixedFacts: [
      ...fixedConstraintFactsFromState(state, 'initial').filter(
        ({ fact }) => !finalSelectedCardMutation || fact.kind !== 'card',
      ),
      ...(finalSelectedCardMutation
        ? [
            {
              sourceKey:
                finalSelectedCardMutation.decisionKey ?? finalSelectedCardMutation.operationId,
              fact: { kind: 'card' as const, card: finalSelectedCardMutation.card },
            },
          ]
        : []),
      ...targetFacts.map((assertion) => ({
        sourceKey: assertion.sourceKey,
        fact: {
          kind: 'targetPredicate' as const,
          scope: 'target' as const,
          predicate: assertion.predicate,
          present: assertion.present,
        },
      })),
      ...scenario.worldFactAssertions.map((assertion) => ({
        sourceKey: assertion.decisionKey,
        fact: assertion.fact,
      })),
    ],
    expressions: [...activeConditionConstraints, ...activeMutationConstraints],
  });
  if (validation.status === 'satisfied') {
    state = applyWorldFacts(state, scenario.worldFactAssertions);
    if (finalSelectedCardMutation) state = applyCardTypeMutation(state, finalSelectedCardMutation);
  }
  const invalidDecisionKeys = new Set(
    validation.status === 'satisfied'
      ? []
      : [
          ...activeConditionConstraints.map((constraint) => constraint.sourceKey),
          ...operations.flatMap(
            (operation) => activations.get(operation.operationId)!.activeDecisionKeys,
          ),
        ],
  );
  return {
    ...base,
    status: 'ready',
    state,
    activations,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    finalSelectedCardMutation,
    constraintIssues: validation.status === 'satisfied' ? [] : [validation.issue],
    invalidDecisionKeys,
    resolvedCompileProjections: resolveCompileProjections(
      compileProjections,
      decisions,
      invalidDecisionKeys,
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
