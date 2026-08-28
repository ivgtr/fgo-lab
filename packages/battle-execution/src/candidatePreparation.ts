import type { DamageResolutionInput } from '@fgo-lab/schema';
import type {
  BattleOperation,
  BattleState,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  TargetPredicateAssertion,
} from './contracts';
import { resolveOperationActivation } from './activation';
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

export type OperationActivation = ReturnType<typeof resolveOperationActivation>;
export interface PreparedCandidateExecution {
  candidateInput: DamageResolutionInput;
  targetFacts: readonly TargetPredicateAssertion[];
  state: BattleState;
  decisions: ReadonlyMap<string, EffectDecision>;
  activations: ReadonlyMap<string, OperationActivation>;
  activeDecisionSourceInstances: ReadonlySet<string>;
  activeConditionConstraints: readonly SatisfiableConditionConstraint[];
  activeMutationConstraints: readonly SatisfiableConditionConstraint[];
  finalSelectedCardMutation: Extract<BattleOperation, { kind: 'changeCardType' }> | undefined;
  constraintIssues: readonly ExecutionIssue[];
  invalidDecisionKeys: Set<string>;
  resolvedCompileProjections: readonly EffectProjection[];
  procSelectionIssues: readonly ExecutionIssue[];
}

function decisionsWithProcSelections(
  scenarioDecisions: ReadonlyMap<string, EffectDecision>,
  operations: readonly BattleOperation[],
  inputValues: Readonly<Record<string, number>>,
): { decisions: Map<string, EffectDecision>; issues: ExecutionIssue[] } {
  const decisions = new Map(scenarioDecisions);
  const issues: ExecutionIssue[] = [];
  const invalidKeys = new Set<string>();
  for (const operation of operations) {
    if (operation.procSelection.kind !== 'successCount' || operation.decisionKey === null) continue;
    const selection = operation.procSelection;
    const definition = operation.inputDefinitions.find(
      (candidate) => candidate.kind === 'procSuccessCount' && candidate.key === selection.inputKey,
    );
    if (!definition) {
      issues.push({
        kind: 'invalidProcSelection',
        operationId: operation.operationId,
        detail: 'missingSuccessCountDefinition',
      });
      decisions.set(operation.decisionKey, {
        decisionKey: operation.decisionKey,
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      });
      continue;
    }
    if (scenarioDecisions.has(operation.decisionKey)) {
      if (!invalidKeys.has(operation.decisionKey))
        issues.push({
          kind: 'invalidProcSelection',
          operationId: operation.operationId,
          detail: 'duplicateEffectDecision',
        });
      invalidKeys.add(operation.decisionKey);
      decisions.set(operation.decisionKey, {
        decisionKey: operation.decisionKey,
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      });
      continue;
    }
    decisions.set(operation.decisionKey, {
      decisionKey: operation.decisionKey,
      operationEnabled:
        (inputValues[selection.inputKey] ?? definition.minimum) > definition.minimum,
      conditionSatisfaction: 'evaluate',
    });
  }
  return { decisions, issues };
}

function resolveCompileProjections(
  projections: readonly EffectProjection[],
  decisions: ReadonlyMap<string, EffectDecision>,
  invalidDecisionKeys: ReadonlySet<string>,
): EffectProjection[] {
  return projections.map((projection) => {
    const choice = decisions.get(projection.projectionKey);
    const enabled =
      choice?.operationEnabled ??
      (projection.decision.state === 'none' || projection.decision.state === 'enabled');
    if (invalidDecisionKeys.has(projection.projectionKey))
      return {
        ...projection,
        outcome: 'notApplied' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : {
                ...projection.decision,
                state: enabled ? ('enabled' as const) : ('disabled' as const),
              },
        explanation: { ...projection.explanation, code: 'conditionNotMet' as const },
      };
    if (projection.executionSupport === 'unsupported' && enabled)
      return {
        ...projection,
        outcome: 'unsupported' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : { ...projection.decision, state: 'enabled' as const },
        explanation: { ...projection.explanation, code: 'unresolved' as const },
      };
    return enabled
      ? projection
      : {
          ...projection,
          outcome: 'notApplied' as const,
          decision:
            projection.decision.state === 'none'
              ? projection.decision
              : { ...projection.decision, state: 'disabled' as const },
          explanation: { ...projection.explanation, code: 'disabled' as const },
        };
  });
}

export function prepareCandidateExecution(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
): PreparedCandidateExecution {
  const {
    baseInput,
    scenario,
    attackerTraits,
    attackerPredicates,
    operations,
    compileProjections,
  } = prepared;
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
    scenario.activationDecisions,
  );
  const scenarioDecisions = new Map(
    scenario.effectDecisions.map((decision) => [decision.decisionKey, decision]),
  );
  const proc = decisionsWithProcSelections(scenarioDecisions, operations, resolvedInputs.values);
  const decisions = proc.decisions;
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
    candidateInput,
    targetFacts,
    state,
    decisions,
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
    procSelectionIssues: proc.issues,
  };
}
