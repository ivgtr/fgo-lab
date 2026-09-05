import type {
  CanonicalInputDefinition,
  StackInputDefinition,
  ServantMaster,
} from '@fgo-lab/master-data';
import { stackInputDefaultsAgree } from '@fgo-lab/master-data';
import type { ExecutableBattleState, ConditionExpression } from './contracts';
import { traitConditionEvaluationSource } from './conditionSemantics';

export function mergeInputDefinitions(
  definitions: readonly CanonicalInputDefinition[],
): CanonicalInputDefinition[] {
  const result = new Map<string, CanonicalInputDefinition>();
  for (const definition of definitions) {
    const previous = result.get(definition.key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(definition)) {
      if (
        previous.kind !== 'effectStackCount' ||
        definition.kind !== 'effectStackCount' ||
        !stackInputDefaultsAgree(previous, definition)
      )
        throw new TypeError(`canonical_input_definition_conflict:${definition.key}`);
      result.set(definition.key, {
        ...previous,
        maximum: Math.max(previous.maximum, definition.maximum),
      });
    } else result.set(definition.key, definition);
  }
  return [...result.values()];
}

/** Seed the initial physical state once. Ordered execution subsequently owns all changes. */
export function seedStackQuantities(
  state: ExecutableBattleState,
  definitions: readonly CanonicalInputDefinition[],
): void {
  for (const definition of definitions) {
    if (definition.kind !== 'effectStackCount') continue;
    const count = state.resolvedInputValues[definition.key];
    if (count === undefined) continue;
    if (!Number.isInteger(count) || count < 0 || count > definition.maximum)
      throw new TypeError(`invalid_stack_count:${definition.key}`);
    const { scope, trait } = definition.quantitySource;
    state.stackQuantitySources[definition.key] = definition.quantitySource;
    state.traitCounts[scope] =
      count === 0
        ? Object.fromEntries(
            Object.entries(state.traitCounts[scope]).filter(([key]) => key !== trait),
          )
        : { ...state.traitCounts[scope], [trait]: count };
    (state.traits[scope] as Map<string, boolean>).set(trait, count > 0);
  }
}

export function liveInputQuantity(state: ExecutableBattleState, key: string): number | undefined {
  const source = state.stackQuantitySources[key];
  return source
    ? (state.traitCounts[source.scope][source.trait] ?? 0)
    : state.resolvedInputValues[key];
}

/** Replace only world-fact presence dimensions already owned by an exact stack assignment. */
export function stackOwnedWitnessCondition(
  condition: ConditionExpression,
  inputs: readonly CanonicalInputDefinition[],
): ConditionExpression {
  if (condition.kind === 'all' || condition.kind === 'any')
    return {
      ...condition,
      expressions: condition.expressions.map((item) => stackOwnedWitnessCondition(item, inputs)),
    };
  if (condition.kind === 'not')
    return { ...condition, expression: stackOwnedWitnessCondition(condition.expression, inputs) };
  if (condition.kind !== 'trait' || traitConditionEvaluationSource(condition) !== 'worldFacts')
    return condition;
  const definition = inputs.find(
    (input): input is StackInputDefinition =>
      input.kind === 'effectStackCount' &&
      input.quantitySource.trait === condition.trait &&
      input.quantitySource.scope === condition.scope,
  );
  return definition
    ? {
        kind: 'inputQuantity',
        inputKey: definition.key,
        comparison: condition.present ? 'atLeast' : 'equal',
        value: condition.present ? 1 : 0,
      }
    : condition;
}

export function servantStackInputs(servant: ServantMaster): StackInputDefinition[] {
  return mergeInputDefinitions(
    [
      ...servant.skills.flatMap((skill) =>
        skill.effects.flatMap((effect) => effect.inputDefinitions),
      ),
      ...servant.passives.flatMap((skill) =>
        skill.effects.flatMap((effect) => effect.inputDefinitions),
      ),
      ...servant.noblePhantasmVariantGroups.flatMap((group) =>
        group.variants.flatMap((variant) => [
          ...variant.effects.flatMap((effect) => effect.inputDefinitions),
          ...(variant.kind === 'attack'
            ? variant.damage.flatMap((damage) =>
                damage.kind === 'traitCount' && damage.quantity.kind === 'stacks'
                  ? damage.quantity.inputs
                  : [],
              )
            : []),
        ]),
      ),
    ].filter((definition) => definition.kind === 'effectStackCount'),
  ).filter(
    (definition): definition is StackInputDefinition => definition.kind === 'effectStackCount',
  );
}
