import type { ConditionExpression } from '@fgo-lab/battle-execution';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';

function alignedBoundaryValues(
  definition: CanonicalInputDefinition,
  boundaries: readonly number[],
): readonly number[] {
  const values = new Set<number>([definition.minimum, definition.maximum]);
  for (const boundary of boundaries)
    for (const candidate of [boundary - definition.step, boundary, boundary + definition.step]) {
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

export function createCanonicalInputValueDomains(
  definitions: readonly CanonicalInputDefinition[],
  conditions: readonly (ConditionExpression | null)[],
  mode: 'baseline' | 'satisfied',
  stackWitnesses: ReadonlyMap<string, readonly number[]> = new Map(),
): readonly { key: string; values: readonly number[] }[] {
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
      values:
        mode === 'baseline'
          ? [definition.defaultValue ?? definition.minimum]
          : definition.kind === 'effectStackCount'
            ? stackWitnesses.has(definition.key)
              ? stackWitnesses.get(definition.key)!
              : Array.from({ length: definition.maximum + 1 }, (_, count) => count)
            : boundaries.has(definition.key)
              ? alignedBoundaryValues(definition, boundaries.get(definition.key)!)
              : [definition.maximum],
    }));
}
