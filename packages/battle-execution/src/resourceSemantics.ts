import type {
  BattleOperation,
  ConditionExpression,
  ExecutableBattleState,
  ExecutionIssue,
} from './contracts';

type Resource = Extract<BattleOperation, { kind: 'resourceMutation' }>['resource'];

export function conditionReadsResource(
  condition: ConditionExpression,
  resource: Resource,
): boolean {
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some((expression) => conditionReadsResource(expression, resource));
  if (condition.kind === 'not') return conditionReadsResource(condition.expression, resource);
  if (resource === 'hp')
    return condition.kind === 'quantity' && condition.quantity === 'attackerHpPermille';
  if (resource === 'battlePoint')
    return condition.kind === 'quantity' && condition.quantity === 'battlePointPhase';
  return condition.kind === 'inputQuantity' && condition.inputKey.endsWith('battle:criticalStars');
}

export function operationReadsResource(operation: BattleOperation, resource: Resource): boolean {
  if (conditionReadsResource(operation.condition, resource)) return true;
  if (operation.kind === 'executeNpDamage')
    return conditionReadsResource(operation.specialAttackDependency, resource);
  if (operation.kind !== 'addModifier' || operation.valueExpression === null) return false;
  if (resource === 'hp')
    return (
      (operation.valueExpression.kind === 'inverseHpLinear' ||
        operation.valueExpression.kind === 'hpRangeLinear') &&
      operation.valueExpression.quantitySource.kind === 'attackerHpPermille'
    );
  if (resource === 'criticalStars' && operation.valueExpression.kind === 'inputLinear')
    return operation.valueExpression.inputKey.endsWith('battle:criticalStars');
  return false;
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
