import type { CanonicalInputDefinition, EffectExecutionOperation } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import { resolveResourceTargetPolicy } from './effectRouting';

export interface CountedBuffInstance {
  identity: string;
  owner?: {
    kind: 'populationFunction';
    actionId: string;
    actorIndex: number;
    grantIndex: number;
    source: Pick<SourceEffect, 'origin' | 'sourceInstanceId'>;
    position: number;
  };
  actor: string;
  traits: readonly string[];
  lifetime: 'active' | 'constant';
  count: number;
  marker?: Extract<EffectExecutionOperation, { kind: 'buffInstanceMutation' }>['marker'];
  uncertain?: boolean;
  requiredInput?: CanonicalInputDefinition | null;
  constantFormKey?: string;
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
  markers: ReadonlyMap<string, CountedBuffInstance['marker']> = new Map(),
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
      ...(markers.get(input.key) ? { marker: markers.get(input.key) } : {}),
    });
  }
  return [...instances.values()];
}

export function applyBuffInstanceMutation(
  instances: readonly CountedBuffInstance[],
  operation: Extract<EffectExecutionOperation, { kind: 'buffInstanceMutation' }>,
  source: Pick<SourceEffect, 'origin'> &
    Partial<Pick<SourceEffect, 'sourceInstanceId' | 'constantFormKey'>>,
  identity: string,
): readonly CountedBuffInstance[] | null {
  if (operation.mutation === 'move' || operation.mutation === 'unsupported') return null;
  const recipient =
    operation.marker &&
    ['sourceSelf', 'sourceActor'].includes(operation.recipient) &&
    (source.origin === 'support' || source.origin === 'mysticCode')
      ? (source.sourceInstanceId ?? 'unresolved')
      : resolveResourceTargetPolicy(source.origin, operation.recipient);
  if (recipient === 'unresolved') return null;
  if (recipient === null) return instances;
  if (
    operation.marker &&
    operation.marker.recipientSide !== 'both' &&
    operation.marker.recipientSide !== (recipient === 'target' ? 'opponent' : 'ally')
  )
    return instances;
  if (operation.mutation === 'remove')
    return instances.flatMap((instance) => {
      if (
        instance.actor !== recipient ||
        instance.lifetime === 'constant' ||
        instance.marker?.removable === false ||
        !instance.traits.some((trait) => operation.traits.includes(trait))
      )
        return [instance];
      // Keep the known absence after removal; initial facts must not resurrect it.
      return [{ ...instance, count: 0 }];
    });
  if (
    operation.grantLimit &&
    instances.some(
      (instance) =>
        instance.actor === recipient &&
        instance.uncertain &&
        instance.traits.includes(operation.grantLimit!.trait),
    )
  )
    return null;
  if (
    operation.grantLimit &&
    countBuffInstances(instances, operation.grantLimit.trait, recipient, 'all')! >=
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
      ...(operation.marker ? { marker: operation.marker } : {}),
      ...(source.constantFormKey ? { constantFormKey: source.constantFormKey } : {}),
    },
  ];
}

export function countBuffInstances(
  instances: readonly CountedBuffInstance[],
  trait: string,
  actor: string = 'attacker',
  lifetime: 'active' | 'all' = 'active',
): number | null {
  if (
    instances.some(
      (instance) =>
        instance.actor === actor &&
        instance.uncertain &&
        instance.count > 0 &&
        (lifetime === 'all' || instance.lifetime === 'active') &&
        instance.traits.includes(trait),
    )
  )
    return null;
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

/** A buff-count declaration binds to the live instance store, without writing trait totals. */
export function bindBuffCountSources<
  T extends { stackQuantitySources: Record<string, BuffCountInput['quantitySource']> },
>(state: T, inputs: readonly BuffCountInput[]): T {
  return {
    ...state,
    stackQuantitySources: {
      ...state.stackQuantitySources,
      ...Object.fromEntries(inputs.map((input) => [input.key, input.quantitySource])),
    },
  };
}

/** Both read kinds retain multiplicity and observe the same actor-qualified instances. */
export function markerTraitCounts(
  instances: readonly CountedBuffInstance[],
  actor: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const instance of instances) {
    if (!instance.marker || instance.actor !== actor || instance.uncertain) continue;
    for (const trait of new Set([...instance.traits, instance.marker.actorTrait]))
      result[trait] = (result[trait] ?? 0) + instance.count;
  }
  return result;
}

export function markerTraitRead(
  instances: readonly CountedBuffInstance[],
  actor: string,
  trait: string,
): { known: boolean; count: number } | null {
  if (instances.length === 0) return null;
  const matching = instances.filter(
    (instance) =>
      instance.actor === actor &&
      (instance.traits.includes(trait) || instance.marker?.actorTrait === trait),
  );
  if (matching.length === 0) return null;
  return {
    known: !matching.some((instance) => instance.uncertain && instance.count > 0),
    count: matching
      .filter((instance) => !instance.uncertain)
      .reduce((sum, instance) => sum + instance.count, 0),
  };
}

export function reconcileMarkerForm(
  instances: readonly CountedBuffInstance[],
  formKey: string,
): readonly CountedBuffInstance[] {
  return instances.map((instance) =>
    instance.marker &&
    instance.constantFormKey !== undefined &&
    instance.constantFormKey !== formKey
      ? { ...instance, count: 0, uncertain: false }
      : instance,
  );
}
