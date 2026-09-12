import type { CanonicalInputDefinition, EffectExecutionOperation } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import { resolveResourceTargetPolicy } from './effectRouting';

export interface CountedBuffInstance {
  identity: string;
  actor: 'attacker' | 'target';
  traits: readonly string[];
  lifetime: 'active' | 'constant';
  count: number;
}
export type BuffCountInput = Extract<CanonicalInputDefinition, { kind: 'effectStackCount' }> & {
  instanceTraits: string[];
};
export function isBuffCountInput(input: CanonicalInputDefinition): input is BuffCountInput {
  return input.kind === 'effectStackCount' && input.instanceTraits !== undefined;
}

export function seedBuffInstances(
  inputs: readonly BuffCountInput[],
  values: Readonly<Record<string, number>>,
): readonly CountedBuffInstance[] {
  const instances = new Map<string, CountedBuffInstance>();
  for (const input of inputs) {
    const count = values[input.key] ?? input.defaultValue;
    if (
      (input.owner !== 'attacker' && input.owner !== 'target') ||
      !Number.isSafeInteger(count) ||
      count < input.minimum ||
      count > input.maximum ||
      !input.instanceTraits.includes(input.quantitySource.trait)
    )
      throw new TypeError('invalid_initial_buff_count');
    const traits = [...new Set(input.instanceTraits)].sort();
    const signature = JSON.stringify([input.owner, traits]);
    const previous = instances.get(signature);
    if (previous && previous.count !== count)
      throw new TypeError('conflicting_initial_buff_counts');
    if (
      inputs.some(
        (other) =>
          other.key !== input.key &&
          other.owner === input.owner &&
          other.instanceTraits.includes(input.quantitySource.trait) &&
          JSON.stringify([other.owner, [...new Set(other.instanceTraits)].sort()]) !== signature,
      )
    )
      throw new TypeError('ambiguous_initial_buff_counts');
    instances.set(signature, {
      identity: `initial:${signature}`,
      actor: input.owner,
      traits,
      lifetime: 'active',
      count,
    });
  }
  return [...instances.values()];
}

export function applyBuffInstanceMutation(
  instances: readonly CountedBuffInstance[],
  operation: Extract<EffectExecutionOperation, { kind: 'buffInstanceMutation' }>,
  source: Pick<SourceEffect, 'origin'>,
  identity: string,
): readonly CountedBuffInstance[] | null {
  if (operation.mutation === 'move' || operation.mutation === 'unsupported') return null;
  const recipient = resolveResourceTargetPolicy(source.origin, operation.recipient);
  if (recipient === 'unresolved') return null;
  if (recipient !== 'attacker' && recipient !== 'target') return instances;
  if (operation.mutation === 'remove')
    return instances.filter(
      (instance) =>
        instance.actor !== recipient ||
        instance.lifetime === 'constant' ||
        !instance.traits.some((trait) => operation.traits.includes(trait)),
    );
  if (
    operation.grantLimit &&
    countBuffInstances(instances, operation.grantLimit.trait, recipient, 'all') >=
      operation.grantLimit.maximum
  )
    return instances;
  return [
    ...instances,
    {
      identity,
      actor: recipient,
      traits: operation.traits,
      lifetime: operation.lifetime,
      count: 1,
    },
  ];
}

export function countBuffInstances(
  instances: readonly CountedBuffInstance[],
  trait: string,
  actor: 'attacker' | 'target' = 'attacker',
  lifetime: 'active' | 'all' = 'active',
): number {
  return instances.reduce(
    (count, instance) =>
      instance.actor === actor &&
      (lifetime === 'all' || instance.lifetime === 'active') &&
      instance.traits.includes(trait)
        ? count + instance.count
        : count,
    0,
  );
}

/** Stack readers and NP count readers observe one instance store, including after removal. */
export function projectBuffInstanceCounts<
  T extends {
    buffInstances: readonly CountedBuffInstance[];
    stackCounts: {
      attackerState: Readonly<Record<string, number>>;
      targetState: Readonly<Record<string, number>>;
      field: Readonly<Record<string, number>>;
    };
    stateTraits: { attackerState: ReadonlySet<string>; targetState: ReadonlySet<string> };
  },
>(state: T, inputs: readonly BuffCountInput[]): T {
  if (!inputs.length) return state;
  const stackCounts = { ...state.stackCounts };
  const stateTraits = { ...state.stateTraits };
  for (const input of inputs) {
    const { scope, trait } = input.quantitySource;
    if (scope === 'field') throw new TypeError('invalid_buff_count_scope');
    const count = countBuffInstances(
      state.buffInstances,
      trait,
      scope === 'attackerState' ? 'attacker' : 'target',
      'all',
    );
    stackCounts[scope] = { ...stackCounts[scope], [trait]: count };
    const traits = new Set(stateTraits[scope]);
    if (count) traits.add(trait);
    else traits.delete(trait);
    stateTraits[scope] = traits;
  }
  return { ...state, stackCounts, stateTraits };
}
