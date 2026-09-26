import { resolveOperationActivation } from './activation';
import type { SatisfiableConditionConstraint } from './constraints';
import {
  assumedDecisionConstraints,
  collectDecisionConditions,
  resolveSatisfiedDecisionKeys,
} from './decisionConditions';
import type { BattleOperation, EffectDecision, ExecutableBattleState } from './contracts';
import type { PreparedOrderedScenario } from './executionTypes';
import type { ResolvedStochasticOutcome } from './stochasticOutcomes';
import { resolveActiveVariantTransactions } from './variantSelection';
export type OperationActivation = ReturnType<typeof resolveOperationActivation>;
export interface CandidateSelections {
  activations: ReadonlyMap<string, OperationActivation>;
  activeDecisionSourceInstances: ReadonlySet<string>;
  activeConditionConstraints: readonly SatisfiableConditionConstraint[];
  activeMutationConstraints: readonly SatisfiableConditionConstraint[];
  finalSelectedNoblePhantasmVariant:
    Extract<BattleOperation, { kind: 'selectNoblePhantasmVariant' }> | undefined;
  preappliedOperationIds: ReadonlySet<string>;
  supersededVariantTransactionKeys: ReadonlySet<string>;
}
export function resolveCandidateSelections(
  prepared: PreparedOrderedScenario,
  decisions: ReadonlyMap<string, EffectDecision>,
  stochasticOutcomes: ReadonlyMap<string, ResolvedStochasticOutcome>,
  state: ExecutableBattleState,
): CandidateSelections {
  const { operations, scenario } = prepared;
  const conditionsByDecisionKey = collectDecisionConditions(operations);
  const satisfiedDecisionKeys = resolveSatisfiedDecisionKeys(
    decisions,
    conditionsByDecisionKey,
    state,
  );
  const activations = new Map(
    operations.map((operation) => [
      operation.operationId,
      resolveOperationActivation(operation, decisions, stochasticOutcomes, satisfiedDecisionKeys),
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
    new Set(
      operations.flatMap((operation) =>
        operation.kind === 'executeNpDamage' &&
        operation.damage.kind === 'targetRarity' &&
        operation.specialAttackDecisionKey
          ? [operation.specialAttackDecisionKey]
          : [],
      ),
    ),
  );
  const activeMutationConstraints: SatisfiableConditionConstraint[] = operations.flatMap(
    (operation) =>
      activations.get(operation.operationId)!.assumesLocalCondition
        ? [{ sourceKey: operation.operationId, expression: operation.condition }]
        : [],
  );
  const variantTransactions = resolveActiveVariantTransactions(
    operations,
    activations,
    decisions,
    state,
  );
  return {
    activations,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    finalSelectedNoblePhantasmVariant: variantTransactions.finalSelection,
    preappliedOperationIds: variantTransactions.preappliedOperationIds,
    supersededVariantTransactionKeys: variantTransactions.supersededTransactionKeys,
  };
}
