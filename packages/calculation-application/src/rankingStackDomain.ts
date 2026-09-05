import {
  canonicalExclusiveGroup,
  noblePhantasmDamageDependency,
  type BattleOperation,
  type ConditionExpression,
} from '@fgo-lab/battle-execution';
import type { NpDamageSpec, StackInputDefinition } from '@fgo-lab/master-data';

function readsStack(
  condition: ConditionExpression,
  input: StackInputDefinition,
  unknownIsDependency = true,
): boolean {
  if (condition.kind === 'unsupported') return unknownIsDependency;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some((part) => readsStack(part, input, unknownIsDependency));
  if (condition.kind === 'not') return readsStack(condition.expression, input, unknownIsDependency);
  if (condition.kind === 'trait') return condition.trait === input.quantitySource.trait;
  if (condition.kind === 'traitCount') return condition.traits.includes(input.quantitySource.trait);
  return condition.kind === 'inputQuantity' && condition.inputKey === input.key;
}

function hasExclusiveSource(input: StackInputDefinition): boolean {
  return canonicalExclusiveGroup(input.quantitySource.scope, input.quantitySource.trait) !== null;
}

/** A single nondecreasing NP multiplier, with no other reader/writer, needs only its endpoints.
 * Do not use this proof for signed modifier products or count-dependent action activation.
 */
export function monotoneNpStackKeys(
  damage: readonly NpDamageSpec[],
  operations: readonly BattleOperation[],
): ReadonlySet<string> {
  if (damage.length !== 1) return new Set();
  const item = damage[0]!;
  if (
    item.kind !== 'traitCount' ||
    item.quantity.kind !== 'stacks' ||
    item.quantity.inputs.length !== 1 ||
    item.parametersByOvercharge
      .flat()
      .some(
        (cell) => (cell.correctionPermille ?? -1) < 0 || (cell.secondaryValuePermille ?? 0) < 1000,
      )
  )
    return new Set();
  const input = item.quantity.inputs[0]!;
  if (hasExclusiveSource(input)) return new Set();
  if (
    operations.some(
      (operation) =>
        operation.inputDefinitions.some(({ key }) => key === input.key) ||
        readsStack(operation.condition, input, operation.kind !== 'preserveSemanticEffect') ||
        operation.kind === 'transformActorForm' ||
        ('trait' in operation && operation.trait === input.quantitySource.trait),
    )
  )
    return new Set();
  return new Set([input.key]);
}

export class UnsupportedStackQuantity extends Error {}

/** Isolated positive NP-buff sums observe only a capped total. One physical source can
 * witness that total; other constituents remain zero. Any additional reader/writer disables it.
 */
export function stackDomainWitnesses(
  damage: readonly NpDamageSpec[],
  operations: readonly BattleOperation[],
): ReadonlyMap<string, readonly number[]> {
  const witnesses = new Map<string, readonly number[]>();
  for (const key of monotoneNpStackKeys(damage, operations)) {
    const input = damage
      .flatMap((item) =>
        item.kind === 'traitCount' && item.quantity.kind === 'stacks' ? item.quantity.inputs : [],
      )
      .find((item) => item.key === key)!;
    witnesses.set(
      key,
      [...new Set([0, input.defaultValue, input.maximum])].sort((a, b) => a - b),
    );
  }
  if (damage.some((item) => item.kind === 'traitCount')) return witnesses;
  let damageDependencies: readonly ConditionExpression[] | undefined;
  for (const operation of operations) {
    if (operation.kind !== 'addModifier' || operation.modifier !== 'npDamageBuff') continue;
    const expression = operation.valueExpression;
    if (
      expression?.kind !== 'stackLinear' ||
      expression.perUnitPermille < 0 ||
      expression.basePermille < 0
    )
      continue;
    const dependencies = (damageDependencies ??= damage.flatMap((item) =>
      item.parametersByOvercharge.flatMap((row, oc) =>
        row.map((_, level) => noblePhantasmDamageDependency(item, oc + 1, level + 1)),
      ),
    ));
    const sources = [...expression.sources].sort((a, b) => a.key.localeCompare(b.key));
    if (
      sources.some(
        (source) =>
          source.defaultValue !== 0 ||
          source.maximum < expression.maximumUnits ||
          hasExclusiveSource(source) ||
          dependencies.some((condition) => readsStack(condition, source)),
      )
    )
      continue;
    if (
      operations.some(
        (other) =>
          (other.kind === 'changeModifierRate' && other.modifier === 'npDamageBuff') ||
          other.kind === 'transformActorForm' ||
          sources.some(
            (source) =>
              readsStack(other.condition, source, other.kind !== 'preserveSemanticEffect') ||
              ('trait' in other && other.trait === source.quantitySource.trait) ||
              (other !== operation && other.inputDefinitions.some(({ key }) => key === source.key)),
          ),
      )
    )
      continue;
    sources.forEach((source, index) =>
      witnesses.set(source.key, index === 0 ? [0, source.maximum] : [0]),
    );
  }
  return witnesses;
}
