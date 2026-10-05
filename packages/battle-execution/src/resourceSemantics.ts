import { QUANTITY_FACT_DOMAINS } from '@fgo-lab/schema';
import { readInputFact, writeInputFact, type InputFacts } from './inputFacts';
import type { ConditionFactProof } from './conditionRead';
import {
  conditionQuantityReads,
  expressionQuantityReads,
  readsResource,
  resourceSourceActor,
  type ResourceKind,
  ATTACKER_RESOURCE_ACTOR,
} from './resourceQueries';
import type {
  BattleOperation,
  ConditionExpression,
  ExecutableBattleState,
  ExecutionIssue,
} from './contracts';

type Resource = ResourceKind;

export function conditionReadsResource(
  condition: ConditionExpression,
  resource: Resource,
): boolean {
  return readsResource(conditionQuantityReads(condition), resource);
}

export function operationReadsResource(operation: BattleOperation, resource: Resource): boolean {
  const context = {
    actor: ATTACKER_RESOURCE_ACTOR,
    sourceActor: resourceSourceActor(operation.source),
    inputDefinitions: operation.inputDefinitions,
  };
  if (readsResource(conditionQuantityReads(operation.condition, context), resource)) return true;
  if (operation.kind === 'executeNpDamage')
    return readsResource(
      conditionQuantityReads(operation.specialAttackDependency, context),
      resource,
    );
  if (operation.kind !== 'addModifier' || operation.valueExpression === null) return false;
  return readsResource(expressionQuantityReads(operation.valueExpression, context), resource);
}

/**
 * A resource transition may be erased only after the complete ordered program proves that no
 * damage operation reads that resource. Otherwise its absent runtime state is a typed blocker.
 */
export function closeResourceMutationSemantics(
  operations: readonly BattleOperation[],
): readonly BattleOperation[] {
  return operations.map((operation, index): BattleOperation => {
    if (operation.kind !== 'resourceMutation') return operation;
    const suffixHasReader = operations
      .slice(index + 1)
      .some((candidate) => operationReadsResource(candidate, operation.resource));
    if (!suffixHasReader) return { ...operation, resolution: 'noDamageReader' };
    if (operation.resource === 'criticalStars') {
      return operation.unit === 'fixed' && operation.amount !== null
        ? { ...operation, resolution: 'orderedCriticalStars' }
        : operation;
    }
    return operation;
  });
}

export function operationHasNoRuntimeDamageImpact(operation: BattleOperation): boolean {
  return (
    operation.kind === 'preserveSemanticEffect' ||
    (operation.kind === 'resourceMutation' && operation.resolution === 'noDamageReader')
  );
}

export function applyOrderedCriticalStarsMutation(
  operation: Extract<BattleOperation, { kind: 'resourceMutation' }>,
  state: ExecutableBattleState,
  proof: ConditionFactProof,
): ExecutionIssue | null {
  if (operation.resolution !== 'orderedCriticalStars' || operation.amount === null)
    return unresolvedResourceIssue(operation);
  const result = mutateCriticalStars(state.inputFacts, operation.amount, operation.direction, proof);
  if (result.status !== 'applied') return unresolvedResourceIssue(operation);
  state.inputFacts = result.facts;
  return null;
}

/** Preparation and ordinary execution use the same physical writer and exact-value dependencies. */
export function mutateCriticalStars(
  facts: InputFacts,
  amount: number | null,
  direction: 'gain' | 'loss',
  proof: ConditionFactProof,
) {
  const read = readInputFact(facts, 'battle:criticalStars');
  if (read.value === undefined)
    return { status: 'inputRequired' as const, facts, reason: 'unknownCriticalStars' };
  if (amount === null || !Number.isInteger(amount) || amount < 0)
    return { status: 'unsupported' as const, facts, reason: 'unresolvedCriticalStarsAmount' };
  const before = read.value;
  const after = Math.min(99, Math.max(0, before + amount * (direction === 'gain' ? 1 : -1)));
  return {
    status: 'applied' as const,
    facts: writeInputFact(facts, 'battle:criticalStars', after, [...read.support, proof]),
    before,
    after,
  };
}

export function unresolvedResourceIssue(
  operation: Extract<BattleOperation, { kind: 'resourceMutation' }>,
): ExecutionIssue {
  return {
    kind: 'unsupportedOperation',
    operationId: operation.operationId,
    detail: `${operation.resolution}:${operation.resource}`,
  };
}

export function applyOrderedQuantityMutation(
  operation: Extract<BattleOperation, { kind: 'addQuantity' }>,
  state: ExecutableBattleState,
): ExecutionIssue | null {
  const current = state.quantities[operation.quantity];
  if (current === null)
    return {
      kind: 'unsupportedOperation',
      operationId: operation.operationId,
      detail: `quantity_missing:${operation.quantity}`,
    };
  state.quantities[operation.quantity] = Math.min(
    QUANTITY_FACT_DOMAINS[operation.quantity].max,
    Math.max(QUANTITY_FACT_DOMAINS[operation.quantity].min, current + operation.amount),
  );
  return null;
}
