import type { PreNoblePhantasmState } from './preparationContracts';
import type { SourceEffect } from './sourceCollection';
import type { PopulationMutation } from './populationCounts';
import type { EffectExecutionOperation } from '@fgo-lab/master-data';
import type { PopulationEvent } from './populationCounts';
export type PopulationFunction = Extract<EffectExecutionOperation, { kind: 'populationFunction' }>;
export interface PopulationTargetState {
  buffs: Readonly<Record<string, readonly number[]>>;
  traits: readonly Readonly<Record<string, number>>[];
  instances: readonly (readonly (readonly string[])[])[];
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
      instances[index]!.push(action.traits);
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

function projectTargetState(
  current: PreNoblePhantasmState,
  next: PopulationTargetState,
): PreNoblePhantasmState {
  const prior = [...current.populationEvents]
    .reverse()
    .find((event) => event.targetState)?.targetState;
  const counts = { ...current.stackCounts.targetState };
  const traits = new Set(current.stateTraits.targetState);
  for (const trait of new Set([
    ...Object.keys(prior?.traits[0] ?? {}),
    ...Object.keys(next.traits[0] ?? {}),
  ])) {
    const delta = (next.traits[0]?.[trait] ?? 0) - (prior?.traits[0]?.[trait] ?? 0);
    if (!delta) continue;
    const count = (counts[trait] ?? Number(traits.has(trait))) + delta;
    if (count > 0) {
      counts[trait] = count;
      traits.add(trait);
    } else {
      Reflect.deleteProperty(counts, trait);
      traits.delete(trait);
    }
  }
  return {
    ...current,
    stackCounts: { ...current.stackCounts, targetState: counts },
    stateTraits: { ...current.stateTraits, targetState: traits },
  };
}
export function applyPopulationFunctionToState(
  operation: PopulationFunction,
  current: PreNoblePhantasmState,
  values: Readonly<Record<string, number>>,
  actionId: string,
  source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>,
): PreNoblePhantasmState {
  const applied = applyPopulationFunction(operation, current.populationEvents, values, actionId);
  return {
    ...projectTargetState(current, applied.state),
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
    buffs.filter((traits) => !traits.some((trait) => operation.traits.includes(trait))),
  );
  const traits = instances.map((buffs) => {
    const counts: Record<string, number> = {};
    for (const buff of buffs) for (const trait of buff) counts[trait] = (counts[trait] ?? 0) + 1;
    return counts;
  });
  const next = { ...prior, instances, traits };
  return {
    ...projectTargetState(current, next),
    populationEvents: current.populationEvents.map((entry, index) =>
      index === current.populationEvents.length - 1 ? { ...entry, targetState: next } : entry,
    ),
  };
}
