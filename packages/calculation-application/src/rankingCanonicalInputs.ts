import { UnsupportedStackQuantity } from './rankingStackDomain';
import type { ConditionExpression } from '@fgo-lab/battle-execution';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';

export type PopulationInputDefinition = Extract<
  CanonicalInputDefinition,
  {
    kind: 'transferDonor' | 'populationCount' | 'populationSize' | 'populationActorValue';
  }
>;

export function isPopulationInputDefinition(
  definition: CanonicalInputDefinition,
): definition is PopulationInputDefinition {
  switch (definition.kind) {
    case 'transferDonor':
    case 'populationCount':
    case 'populationSize':
    case 'populationActorValue':
      return true;
    default:
      return false;
  }
}

function alignedBoundaryValues(
  definition: CanonicalInputDefinition,
  boundaries: readonly number[],
): readonly number[] {
  const values = new Set<number>([definition.minimum, definition.maximum]);
  for (const boundary of boundaries)
    // Boundary and its predecessor are complete representatives for ordered integer predicates;
    // the next boundary predecessor (or the domain maximum) represents the open interval above.
    for (const candidate of [boundary - definition.step, boundary]) {
      const offset = candidate - definition.minimum;
      if (
        candidate >= definition.minimum &&
        candidate <= definition.maximum &&
        offset % definition.step === 0
      )
        values.add(candidate);
    }
  return [...values].sort((left, right) => left - right);
}

function conditionInputBoundaries(
  condition: ConditionExpression | null,
): readonly { key: string; value: number }[] {
  if (!condition) return [];
  if (condition.kind === 'inputQuantity')
    return [{ key: condition.inputKey, value: condition.value }];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(conditionInputBoundaries);
  return condition.kind === 'not' ? conditionInputBoundaries(condition.expression) : [];
}

function resolveCanonicalInputValues(
  definition: CanonicalInputDefinition,
  mode: 'baseline' | 'satisfied',
  boundaries: ReadonlyMap<string, readonly number[]>,
  stackWitnesses: ReadonlyMap<string, readonly number[]>,
  populationSaturation: ReadonlyMap<string, number>,
): readonly number[] {
  if (mode === 'baseline') return [definition.defaultValue ?? definition.minimum];
  if (isPopulationInputDefinition(definition))
    return Array.from(
      {
        length:
          Math.min(
            definition.maximum,
            populationSaturation.get(definition.key) ?? definition.maximum,
          ) -
          definition.minimum +
          1,
      },
      (_, index) => definition.minimum + index,
    );
  if (definition.kind === 'effectStackCount') {
    if (definition.instanceTraits === undefined && stackWitnesses.has(definition.key))
      return stackWitnesses.get(definition.key)!;
    return Array.from({ length: definition.maximum + 1 }, (_, count) => count);
  }
  const inputBoundaries = boundaries.get(definition.key);
  return inputBoundaries
    ? alignedBoundaryValues(definition, inputBoundaries)
    : [definition.maximum];
}

export function createCanonicalInputValueDomains(
  definitions: readonly CanonicalInputDefinition[],
  conditions: readonly (ConditionExpression | null)[],
  mode: 'baseline' | 'satisfied',
  stackWitnesses: ReadonlyMap<string, readonly number[]> = new Map(),
  populationSaturation: ReadonlyMap<string, number> = new Map(),
): readonly { key: string; values: readonly number[] }[] {
  if (
    mode === 'satisfied' &&
    definitions.some(
      (definition) =>
        definition.kind === 'transferDonor' &&
        (populationSaturation.get(definition.key) ?? definition.maximum) - definition.minimum + 1 >
          4096,
    )
  )
    throw new UnsupportedStackQuantity('transfer_input_domain_exceeds_candidate_limit');
  const boundaries = new Map<string, number[]>();
  for (const { key, value } of conditions.flatMap(conditionInputBoundaries)) {
    const values = boundaries.get(key) ?? [];
    values.push(value);
    boundaries.set(key, values);
  }
  return [...definitions]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((definition) => ({
      key: definition.key,
      values: resolveCanonicalInputValues(
        definition,
        mode,
        boundaries,
        stackWitnesses,
        populationSaturation,
      ),
    }));
}
