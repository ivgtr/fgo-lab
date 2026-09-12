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
export type BuffCountInput = Extract<CanonicalInputDefinition, { kind: 'buffInstanceCount' }>;

export function seedBuffInstances(
  inputs: readonly BuffCountInput[],
  values: Readonly<Record<string, number>>,
): readonly CountedBuffInstance[] {
  const instances = new Map<string, CountedBuffInstance>();
  for (const input of inputs) {
    const count = values[input.key] ?? input.defaultValue;
    if (
      input.owner !== 'attacker' ||
      count === null ||
      !Number.isSafeInteger(count) ||
      count < input.minimum ||
      count > input.maximum ||
      !input.instanceTraits.includes(input.trait)
    )
      throw new TypeError('invalid_initial_buff_count');
    const traits = [...new Set(input.instanceTraits)].sort();
    const signature = JSON.stringify(traits);
    const previous = instances.get(signature);
    if (previous && previous.count !== count)
      throw new TypeError('conflicting_initial_buff_counts');
    if (
      inputs.some(
        (other) =>
          other.key !== input.key &&
          other.instanceTraits.includes(input.trait) &&
          JSON.stringify([...new Set(other.instanceTraits)].sort()) !== signature,
      )
    )
      throw new TypeError('ambiguous_initial_buff_counts');
    instances.set(signature, {
      identity: `initial:${signature}`,
      actor: 'attacker',
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
  source: SourceEffect,
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
): number {
  return instances.reduce(
    (count, instance) =>
      instance.actor === 'attacker' &&
      instance.lifetime === 'active' &&
      instance.traits.includes(trait)
        ? count + instance.count
        : count,
    0,
  );
}
