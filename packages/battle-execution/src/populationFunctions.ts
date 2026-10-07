import type { PreNoblePhantasmState } from './preparationContracts';
import type { SourceEffect } from './sourceCollection';
import type { PopulationMutation } from './populationCounts';
import type { EffectExecutionOperation } from '@fgo-lab/master-data';
import type { PopulationEvent } from './populationCounts';
export type PopulationFunction = Extract<EffectExecutionOperation, { kind: 'populationFunction' }>;
type PopulationInstance = {
  traits: readonly string[];
  owner: NonNullable<PreNoblePhantasmState['buffInstances'][number]['owner']>;
};
export interface PopulationTargetState {
  buffs: Readonly<Record<string, readonly number[]>>;
  traits: readonly Readonly<Record<string, number>>[];
  instances: readonly (readonly PopulationInstance[])[];
  actionId: string;
  position: number;
  succeeded: readonly boolean[];
}

/** A function reads and updates each enemy independently. Receipts stay inside the transaction. */
export function applyPopulationFunction(
  operation: PopulationFunction,
  events: readonly PopulationEvent[],
  values: Readonly<Record<string, number>>,
  actionId: string,
  source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>,
): { state: PopulationTargetState; granted: readonly number[] } {
  const prior = [...events].reverse().find((event) => event.targetState)?.targetState;
  const count = 1 + (values['population:enemies:additional'] ?? 0);
  const buffs = { ...prior?.buffs };
  const traits = Array.from({ length: count }, (_, index) => ({ ...prior?.traits[index] }));
  const instances = Array.from({ length: count }, (_, index) => [
    ...(prior?.instances[index] ?? []),
  ]);
  const succeeded = Array.from({ length: count }, () => false);
  const granted = Array.from({ length: count }, () => 0);
  const action = operation.action;
  if (action.kind === 'removeOne') {
    const remaining = [...(buffs[action.trait] ?? action.inputKeys.map((key) => values[key] ?? 0))];
    for (let index = 0; index < count; index++) {
      succeeded[index] = (remaining[index] ?? 0) > 0;
      if (succeeded[index]) remaining[index]!--;
    }
    buffs[action.trait] = remaining;
  } else {
    for (let index = 0; index < count; index++) {
      const previous =
        !action.previousSuccess ||
        (prior?.actionId === actionId &&
          prior.position === operation.position - 1 &&
          prior.succeeded[index] === true);
      const condition =
        !action.condition ||
        (traits[index]![action.condition.trait] ?? 0) > 0 ||
        (values[action.condition.inputKeys[index]!] ?? 0) > 0;
      if (!previous || !condition) continue;
      instances[index]!.push({
        traits: action.traits,
        owner: {
          kind: 'populationFunction',
          actionId,
          actorIndex: index,
          grantIndex: instances[index]!.length,
          source: { origin: source.origin, sourceInstanceId: source.sourceInstanceId },
          position: operation.position,
        },
      });
      succeeded[index] = true;
      granted[index] = 1;
      for (const trait of action.traits) traits[index]![trait] = (traits[index]![trait] ?? 0) + 1;
    }
  }
  return {
    state: { buffs, traits, instances, actionId, position: operation.position, succeeded },
    granted,
  };
}

function publishTargetInstances(
  current: PreNoblePhantasmState,
  next: PopulationTargetState,
): PreNoblePhantasmState {
  const instances = (next.instances[0] ?? []).map(({ traits, owner }) => ({
    identity: JSON.stringify([
      'populationFunction',
      owner.actionId,
      owner.actorIndex,
      owner.grantIndex,
    ]),
    owner,
    actor: 'target',
    traits,
    lifetime: 'active' as const,
    count: 1,
  }));
  const owned = current.buffInstances.filter(
    (instance) => instance.owner?.kind === 'populationFunction',
  );
  const removed = owned
    .filter((instance) => !instances.some((next) => next.identity === instance.identity))
    .map((instance) => ({ ...instance, count: 0 }));
  return {
    ...current,
    buffInstances: [
      ...current.buffInstances.filter((instance) => instance.owner?.kind !== 'populationFunction'),
      ...instances,
      ...removed,
    ],
  };
}

export function applyPopulationFunctionToState(
  operation: PopulationFunction,
  current: PreNoblePhantasmState,
  values: Readonly<Record<string, number>>,
  actionId: string,
  source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>,
): PreNoblePhantasmState {
  const applied = applyPopulationFunction(
    operation,
    current.populationEvents,
    values,
    actionId,
    source,
  );
  return {
    ...publishTargetInstances(current, applied.state),
    uncertainContextWrites:
      operation.action.kind === 'removeOne' && applied.state.succeeded[0]
        ? [
            ...current.uncertainContextWrites,
            { scope: 'targetState', trait: operation.action.trait },
          ]
        : current.uncertainContextWrites,
    populationEvents: [
      ...current.populationEvents,
      {
        operation: {
          kind: 'populationMutation',
          mutation: 'grant',
          scope: 'enemies',
          basis: 'buffInstances',
          traits: operation.action.kind === 'grant' ? operation.action.traits : [],
          includePassive: false,
        },
        source: { origin: source.origin, sourceInstanceId: source.sourceInstanceId },
        affectedCount: applied.granted.reduce((sum, count) => sum + count, 0),
        targetState: applied.state,
      },
    ],
  };
}
export function removePopulationFunctionState(
  current: PreNoblePhantasmState,
  operation: PopulationMutation,
): PreNoblePhantasmState {
  if (
    operation.mutation !== 'remove' ||
    operation.basis !== 'buffInstances' ||
    operation.scope !== 'enemies'
  )
    return current;
  const prior = [...current.populationEvents]
    .reverse()
    .find((event) => event.targetState)?.targetState;
  if (!prior) return current;
  const instances = prior.instances.map((buffs) =>
    buffs.filter((instance) => !instance.traits.some((trait) => operation.traits.includes(trait))),
  );
  const traits = instances.map((buffs) => {
    const counts: Record<string, number> = {};
    for (const buff of buffs)
      for (const trait of buff.traits) counts[trait] = (counts[trait] ?? 0) + 1;
    return counts;
  });
  const next = { ...prior, instances, traits };
  return {
    ...publishTargetInstances(current, next),
    populationEvents: current.populationEvents.map((entry, index) =>
      index === current.populationEvents.length - 1 ? { ...entry, targetState: next } : entry,
    ),
  };
}
