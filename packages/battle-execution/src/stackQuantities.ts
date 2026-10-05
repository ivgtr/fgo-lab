import { ConditionReadIdentityError, type ConditionFactProof } from './conditionRead';
import { readInputFact, writeInputFact } from './inputFacts';
import { commitTraitFact, readTraitQuantity } from './traitFactLayers';
import { isBuffCountInput, markerTraitRead } from './buffInstances';
import type {
  CanonicalInputDefinition,
  StackInputDefinition,
  ServantMaster,
} from '@fgo-lab/master-data';
import { stackInputDefaultsAgree } from '@fgo-lab/master-data';
import type { ExecutableBattleState, ConditionExpression } from './contracts';
import { traitConditionEvaluationSource } from './conditionSemantics';
import type { SourceEffect } from './sourceCollection';
import { resolveResourceTargetPolicy } from './effectRouting';

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
        ...(definition.instanceTraits ? { instanceTraits: definition.instanceTraits } : {}),
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
    const count = readInputFact(state.inputFacts, definition.key).value;
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
    const proof: ConditionFactProof = {
      kind: 'selectedInitialResource',
      clock: state.conditionReadClock,
    };
    commitTraitFact(state.traitFactLayers, scope, trait, count > 0, count, proof, [proof]);
    (state.conditionFactProofs.traits[scope] as Map<string, ConditionFactProof>).set(trait, proof);
    state.inputFacts = writeInputFact(
      state.inputFacts,
      definition.key,
      count,
      [proof],
    );
  }
}

export function liveInputQuantity(
  state: Pick<
    ExecutableBattleState,
    | 'stackQuantitySources'
    | 'traitFactLayers'
    | 'conditionFactProofs'
    | 'inputFacts'
    | 'buffInstances'
  >,
  key: string,
): number | undefined {
  return liveInputQuantityRead(state, key).value;
}

export function liveInputQuantityRead(
  state: Pick<
    ExecutableBattleState,
    | 'stackQuantitySources'
    | 'traitFactLayers'
    | 'conditionFactProofs'
    | 'inputFacts'
    | 'buffInstances'
  >,
  key: string,
): { value: number | undefined; support: readonly ConditionFactProof[] } {
  const source = state.stackQuantitySources[key];
  if (!source) return readInputFact(state.inputFacts, key);
  if (source.scope !== 'field') {
    const actor = source.scope === 'attackerState' ? 'attacker' : 'target';
    const marker = markerTraitRead(state.buffInstances ?? [], actor, source.trait);
    if (marker) {
      if (!marker.known) return { value: undefined, support: [] };
      const support = (state.buffInstances ?? [])
        .filter(
          (instance) =>
            instance.actor === actor &&
            (instance.traits.includes(source.trait) ||
              instance.marker?.actorTrait === source.trait),
        )
        .map((instance) => {
          const proof = state.conditionFactProofs.markers.get(instance.identity);
          if (!proof) throw new ConditionReadIdentityError(`marker:${instance.identity}`);
          return proof;
        });
      return { value: marker.count, support };
    }
  }
  const read = readTraitQuantity(
    state.traitFactLayers,
    source.scope,
    source.trait,
    state.conditionFactProofs.completeTraits[source.scope],
  );
  return { value: read.value === null ? undefined : read.value, support: read.support };
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

export function servantBuffCountInputs(
  servant: ServantMaster,
  additionalSources: readonly SourceEffect[] = [],
) {
  const inputs = [
    ...servant.skills.flatMap((skill) => skill.effects),
    ...servant.passives.flatMap((skill) => skill.effects),
    ...servant.noblePhantasmVariantGroups.flatMap((group) =>
      group.variants.flatMap((variant) => variant.effects),
    ),
    ...additionalSources
      .filter((source) =>
        source.effect.execution.some(
          (operation) =>
            operation.kind === 'resourceMutation' &&
            operation.amount.kind === 'buffCount' &&
            resolveResourceTargetPolicy(source.origin, operation.recipient) === 'attacker',
        ),
      )
      .map((source) => source.effect),
  ]
    .flatMap((effect) => effect.inputDefinitions)
    .filter(isBuffCountInput);
  return mergeInputDefinitions(inputs).filter(isBuffCountInput);
}
