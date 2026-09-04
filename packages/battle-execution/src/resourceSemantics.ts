import type { BattleOperation, ConditionExpression, ExecutionIssue } from './contracts';

type Resource = Extract<BattleOperation, { kind: 'resourceMutation' }>['resource'];

function conditionReadsResource(condition: ConditionExpression, resource: Resource): boolean {
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some((expression) => conditionReadsResource(expression, resource));
  if (condition.kind === 'not') return conditionReadsResource(condition.expression, resource);
  if (resource === 'hp')
    return condition.kind === 'quantity' && condition.quantity === 'attackerHpPermille';
  if (resource === 'battlePoint')
    return condition.kind === 'quantity' && condition.quantity === 'battlePointPhase';
  return condition.kind === 'inputQuantity' && condition.inputKey.endsWith('battle:criticalStars');
}

function operationReadsResource(operation: BattleOperation, resource: Resource): boolean {
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
  const readResources = new Set<Resource>();
  for (const resource of ['hp', 'criticalStars', 'battlePoint'] as const)
    if (operations.some((operation) => operationReadsResource(operation, resource)))
      readResources.add(resource);
  return operations.map((operation): BattleOperation => {
    if (operation.kind !== 'resourceMutation') return operation;
    if (operation.resource === 'criticalStars')
      return { ...operation, resolution: 'representedByTerminalInput' };
    if (readResources.has(operation.resource)) return operation;
    return { ...operation, resolution: 'noDamageReader' };
  });
}

export function operationHasNoRuntimeDamageImpact(operation: BattleOperation): boolean {
  return (
    operation.kind === 'preserveSemanticEffect' ||
    (operation.kind === 'resourceMutation' && operation.resolution !== 'resourceStateUnavailable')
  );
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
