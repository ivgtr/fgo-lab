import type { ConditionFactProof } from './conditionRead';
import type {
  BattleOperation,
  ExecutableBattleState,
  ExecutionIssue,
  OperationResult,
  EffectProjection,
} from './contracts';
import { applyBuffInstanceMutation } from './buffInstances';

export function markerOperationDisposition(
  operation: BattleOperation,
  state: ExecutableBattleState,
  condition: boolean | null,
): [OperationResult['outcome'], EffectProjection['explanation']['code']] | null {
  if (operation.kind !== 'preserveSemanticEffect') return null;
  if (condition === null && operation.markerNonIntersection)
    return ['notRelevant', 'stateMutationOnly'];
  // Preserve missing world facts; policy assumptions cannot guarantee an instance.
  if (condition === null && operation.buffMutation?.marker) return ['applied', 'applied'];
  const mutation = operation.buffMutation;
  if (
    mutation?.mutation === 'remove' &&
    !(state.buffInstances ?? []).some(
      (instance) =>
        instance.count > 0 && instance.traits.some((trait) => mutation.traits.includes(trait)),
    )
  )
    return ['notRelevant', 'stateMutationOnly'];
  return null;
}

export function applyOrderedMarkerMutation(
  operation: Extract<BattleOperation, { kind: 'preserveSemanticEffect' }>,
  state: ExecutableBattleState,
  condition: boolean | null,
  proof: ConditionFactProof,
): ExecutionIssue | null {
  if (!operation.buffMutation) return null;
  const prior = state.buffInstances ?? [];
  const instances = applyBuffInstanceMutation(
    prior,
    operation.buffMutation,
    operation.source,
    operation.operationId,
  );
  if (instances === null)
    return {
      kind: 'unsupportedOperation',
      operationId: operation.operationId,
      detail: 'unboundBuffInstanceMutation',
    };
  state.buffInstances =
    condition === null
      ? instances.map((instance) =>
          prior.includes(instance) ? instance : { ...instance, uncertain: true },
        )
      : instances;
  for (const instance of state.buffInstances)
    if (!prior.includes(instance))
      (state.conditionFactProofs.markers as Map<string, ConditionFactProof>).set(
        instance.identity,
        proof,
      );
  return null;
}
