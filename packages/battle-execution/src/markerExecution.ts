import type { CanonicalInputDefinition } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  ExecutableBattleState,
  ExecutionIssue,
  OperationResult,
  EffectProjection,
} from './contracts';
import {
  applyBuffInstanceMutation,
  projectBuffInstanceCounts,
  isBuffCountInput,
} from './buffInstances';

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
  inputs: readonly CanonicalInputDefinition[],
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
  const projected = projectBuffInstanceCounts(
    {
      buffInstances: state.buffInstances,
      stackCounts: {
        attackerState: state.traitCounts.attackerState,
        targetState: state.traitCounts.targetState,
        field: state.traitCounts.field,
      },
      stateTraits: { attackerState: new Set<string>(), targetState: new Set<string>() },
    },
    inputs.filter(isBuffCountInput),
  );
  for (const scope of ['attackerState', 'targetState'] as const) {
    state.traitCounts[scope] = projected.stackCounts[scope];
    for (const [trait, count] of Object.entries(projected.stackCounts[scope]))
      (state.traits[scope] as Map<string, boolean>).set(trait, count > 0);
  }
  return null;
}
