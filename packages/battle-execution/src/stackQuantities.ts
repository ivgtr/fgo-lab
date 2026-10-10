import { ConditionReadIdentityError, type ConditionFactProof } from './conditionRead';
import { readInputFact, writeInputFact, type InputFact } from './inputFacts';
import { commitTraitFact, readTraitQuantity } from './traitFactLayers';
import { isBuffCountInput, markerTraitRead, type CountedBuffInstance } from './buffInstances';
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

/** Declaration equality includes every field; object property order has no meaning. */
function inputDeclarationIdentity(definition: CanonicalInputDefinition): string {
  return JSON.stringify(definition, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
        )
      : value,
  );
}

export function mergeInputDefinitions(
  definitions: readonly CanonicalInputDefinition[],
): CanonicalInputDefinition[] {
  const result = new Map<string, CanonicalInputDefinition>();
  for (const definition of definitions) {
    const previous = result.get(definition.key);
    if (previous && inputDeclarationIdentity(previous) !== inputDeclarationIdentity(definition)) {
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
    const proof: ConditionFactProof = {
      kind: 'selectedInitialResource',
      clock: state.conditionReadClock,
    };
    state.traitFactLayers = commitTraitFact(
      state.traitFactLayers,
      scope,
      trait,
      count > 0,
      count,
      proof,
      [proof],
    );

    state.inputFacts = writeInputFact(state.inputFacts, definition.key, count, [proof]);
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
): {
  value: number | undefined;
  support: readonly ConditionFactProof[];
  fact: InputFact | undefined;
} {
  const source = state.stackQuantitySources[key];
  if (!source) return readInputFact(state.inputFacts, key);
  return liveTraitQuantityRead(state, source);
}

/** Read the explicit canonical quantity source, including physical marker instances. */
export function liveTraitQuantityRead(
  state: Parameters<typeof liveInputQuantityRead>[0],
  source: StackInputDefinition['quantitySource'],
): {
  value: number | undefined;
  support: readonly ConditionFactProof[];
  fact: InputFact | undefined;
} {
  if (source.scope !== 'field') {
    const actor = source.scope === 'attackerState' ? 'attacker' : 'target';
    const marker = markerTraitRead(state.buffInstances ?? [], actor, source.trait);
    if (marker) {
      if (!marker.known) return { value: undefined, support: [], fact: undefined };
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
      return { value: marker.count, support, fact: undefined };
    }
  }
  const read = readTraitQuantity(state.traitFactLayers, source.scope, source.trait);
  return {
    value: read.value === null ? undefined : read.value,
    support: read.support,
    fact: undefined,
  };
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

// The canonical servant object owns only static declarations and grant identities.
// Updated master snapshots use new owners; runtime quantities and receipts never enter this cache.
const initialBuffCounts = new WeakMap<ServantMaster, ReturnType<typeof resolveInitialBuffCounts>>();

export function servantInitialBuffCounts(
  servant: ServantMaster,
  additionalSources: readonly SourceEffect[] = [],
) {
  const additional = additionalSources.filter((source) =>
    source.effect.execution.some(
      (operation) =>
        operation.kind === 'resourceMutation' &&
        operation.amount.kind === 'buffCount' &&
        resolveResourceTargetPolicy(source.origin, operation.recipient) === 'attacker',
    ),
  );
  if (additional.length) return resolveInitialBuffCounts(servant, additional);
  let resolved = initialBuffCounts.get(servant);
  if (!resolved) {
    resolved = resolveInitialBuffCounts(servant, []);
    initialBuffCounts.set(servant, resolved);
  }
  return resolved;
}

function resolveInitialBuffCounts(
  servant: ServantMaster,
  additionalSources: readonly SourceEffect[],
) {
  const effects = [
    ...[
      ...servant.skills.flatMap((skill) => skill.effects),
      ...servant.passives.flatMap((skill) => skill.effects),
      ...servant.noblePhantasmVariantGroups.flatMap((group) =>
        group.variants.flatMap((variant) => variant.effects),
      ),
    ].map((effect) => ({ effect, origin: 'attacker' as const })),
    ...additionalSources,
  ];
  const inputs = effects.flatMap(({ effect }) => effect.inputDefinitions).filter(isBuffCountInput);
  const markers = new Map<string, CountedBuffInstance['marker']>();
  // A stack declaration and a physical grant must share an explicit canonical trait.
  // Keep its complete instance identity; numeric presence alone cannot own removal.
  for (const input of servantStackInputs(servant)) {
    if (input.instanceTraits || input.owner === 'field') continue;
    const identities = new Map(
      effects.flatMap(({ effect, origin }) =>
        effect.execution.flatMap((operation) => {
          if (
            operation.kind !== 'buffInstanceMutation' ||
            operation.mutation !== 'grant' ||
            operation.lifetime !== 'active' ||
            resolveResourceTargetPolicy(origin, operation.recipient) !== input.owner ||
            (!operation.traits.includes(input.quantitySource.trait) &&
              operation.marker?.actorTrait !== input.quantitySource.trait)
          )
            return [];
          const traits = [
            ...new Set([
              ...operation.traits,
              ...(operation.marker ? [operation.marker.actorTrait] : []),
            ]),
          ].sort();
          return [
            [
              JSON.stringify([traits, operation.marker]),
              { traits, marker: operation.marker },
            ] as const,
          ];
        }),
      ),
    );
    if (identities.size > 1) throw new TypeError(`ambiguous_initial_buff_identity:${input.key}`);
    const identity = identities.values().next().value;
    if (!identity) continue;
    inputs.push({ ...input, instanceTraits: identity.traits });
    if (identity.marker) markers.set(input.key, identity.marker);
  }
  return { inputs: mergeInputDefinitions(inputs).filter(isBuffCountInput), markers };
}
