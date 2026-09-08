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
): ExecutionIssue | null {
  if (operation.resolution !== 'orderedCriticalStars' || operation.amount === null)
    return unresolvedResourceIssue(operation);
  const current = state.resolvedInputValues['battle:criticalStars'];
  if (current === undefined) return unresolvedResourceIssue(operation);
  state.resolvedInputValues = {
    ...state.resolvedInputValues,
    'battle:criticalStars': Math.min(
      99,
      Math.max(0, current + operation.amount * (operation.direction === 'gain' ? 1 : -1)),
    ),
  };
  return null;
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
