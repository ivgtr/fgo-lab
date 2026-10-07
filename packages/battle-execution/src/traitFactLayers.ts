import { canonicalExclusiveGroup, canonicalExclusiveTraits } from './conditionSemantics';
import { markerTraitRead } from './buffInstances';
import type { ActorScope, BattleStateBase, TraitScope } from './contracts';
import type { ConditionFactProof } from './conditionRead';
import { ConditionReadIdentityError } from './conditionRead';

export type TraitFact =
  | {
      readonly kind: 'absent';
      readonly proof: ConditionFactProof;
      readonly quantitySupport: readonly ConditionFactProof[];
    }
  | {
      readonly kind: 'present';
      readonly proof: ConditionFactProof;
      readonly quantity:
        | { readonly kind: 'unknown' }
        | {
            readonly kind: 'known';
            readonly value: number;
            readonly support: readonly ConditionFactProof[];
          };
    };
type Facts = ReadonlyMap<string, TraitFact>;
type ScopedFacts = Readonly<Record<TraitScope, Facts>>;
export interface TraitQuantityRead {
  value: number | null;
  support: readonly ConditionFactProof[];
}
export interface TraitPresenceRead {
  value: boolean | undefined;
  support: readonly ConditionFactProof[];
}

/** Each immutable root owns values, dependencies, and its form's closed knowledge. */
export interface TraitFactLayers {
  readonly intrinsic: Readonly<Record<ActorScope, Facts>>;
  readonly externalInitial: ScopedFacts;
  readonly writes: ScopedFacts;
  readonly closedScopes: Readonly<Record<TraitScope, ConditionFactProof | null>>;
}
export const traitScopes: readonly TraitScope[] = [
  'attacker',
  'attackerState',
  'target',
  'targetState',
  'field',
];
function scopedFacts(): ScopedFacts {
  return {
    attacker: new Map(),
    attackerState: new Map(),
    target: new Map(),
    targetState: new Map(),
    field: new Map(),
  };
}
function intrinsicFacts(traits: readonly string[], proof: ConditionFactProof): Facts {
  const facts = new Map<string, TraitFact>();
  for (const trait of traits) {
    const previous = facts.get(trait);
    facts.set(trait, {
      kind: 'present',
      proof,
      quantity: {
        kind: 'known',
        value:
          previous?.kind === 'present' && previous.quantity.kind === 'known'
            ? previous.quantity.value + 1
            : 1,
        support: [proof],
      },
    });
  }
  return facts;
}
export function createTraitFactLayers(
  intrinsicTraits: readonly string[],
  externalTraits: Partial<Record<TraitScope, readonly string[]>>,
  intrinsicProof: ConditionFactProof,
  externalProof: ConditionFactProof,
): TraitFactLayers {
  const externalInitial = { ...scopedFacts() };
  for (const scope of traitScopes)
    externalInitial[scope] = new Map(
      (externalTraits[scope] ?? []).map((trait) => [
        trait,
        { kind: 'present' as const, proof: externalProof, quantity: { kind: 'unknown' as const } },
      ]),
    );
  return {
    intrinsic: { attacker: intrinsicFacts(intrinsicTraits, intrinsicProof), target: new Map() },
    externalInitial,
    writes: scopedFacts(),
    closedScopes: {
      attacker: intrinsicProof,
      attackerState: null,
      target: null,
      targetState: null,
      field: null,
    },
  };
}
export function cloneTraitFactLayers(layers: TraitFactLayers): TraitFactLayers {
  return layers;
}
export function replaceIntrinsicTraitFacts(
  layers: TraitFactLayers,
  actor: ActorScope,
  traits: readonly string[],
  proof: ConditionFactProof,
): TraitFactLayers {
  return {
    ...layers,
    intrinsic: { ...layers.intrinsic, [actor]: intrinsicFacts(traits, proof) },
    closedScopes: { ...layers.closedScopes, [actor]: proof },
  };
}
export function clearExternalTraitScopes(
  layers: TraitFactLayers,
  scopes: readonly TraitScope[],
): TraitFactLayers {
  const externalInitial = { ...layers.externalInitial },
    writes = { ...layers.writes };
  for (const scope of scopes) {
    externalInitial[scope] = new Map();
    writes[scope] = new Map();
  }
  return { ...layers, externalInitial, writes };
}
export function projectTraitFacts(layers: TraitFactLayers, scope: TraitScope): Facts {
  const result = new Map(layers.externalInitial[scope]);
  if (scope === 'attacker' || scope === 'target')
    for (const [trait, fact] of layers.intrinsic[scope]) result.set(trait, fact);
  for (const [trait, fact] of layers.writes[scope]) result.set(trait, fact);
  return result;
}
export function readTraitFact(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
): TraitFact | undefined {
  return (
    layers.writes[scope].get(trait) ??
    (scope === 'attacker' || scope === 'target' ? layers.intrinsic[scope].get(trait) : undefined) ??
    layers.externalInitial[scope].get(trait)
  );
}
function requiredTraitProof(
  proof: ConditionFactProof | undefined,
  key: string,
): ConditionFactProof {
  if (!proof) throw new ConditionReadIdentityError(key);
  return proof;
}
export function readTraitPresence(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
): TraitPresenceRead {
  const fact = readTraitFact(layers, scope, trait);
  if (fact) {
    requiredTraitProof(fact.proof, `trait:${scope}:${trait}`);
    return { value: fact.kind === 'present', support: [fact.proof] };
  }
  const closed = layers.closedScopes[scope];
  return closed ? { value: false, support: [closed] } : { value: undefined, support: [] };
}
export function assertExternalInitialTrait(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  present: boolean,
  proof: ConditionFactProof,
): TraitFactLayers {
  if (
    (scope === 'attacker' || scope === 'target') &&
    !present &&
    layers.intrinsic[scope].get(trait)?.kind === 'present'
  )
    throw new TypeError('contradictory_intrinsic_trait_assertion');
  const fact: TraitFact = present
    ? { kind: 'present', proof, quantity: { kind: 'unknown' } }
    : { kind: 'absent', proof, quantitySupport: [proof] };
  return {
    ...layers,
    externalInitial: {
      ...layers.externalInitial,
      [scope]: new Map([...layers.externalInitial[scope], [trait, fact]]),
    },
  };
}
/** Read-only membership projection; it never establishes an exact quantity. */
export function projectTraitPresence(
  layers: TraitFactLayers,
  scope: TraitScope,
): ReadonlyMap<string, boolean> {
  return new Map(
    [...projectTraitFacts(layers, scope)].map(([trait, fact]) => [trait, fact.kind === 'present']),
  );
}
export function projectBattleTraitPresence(
  state: Pick<BattleStateBase, 'traitFactLayers' | 'buffInstances'>,
  scope: TraitScope,
): ReadonlyMap<string, boolean> {
  const result = new Map(projectTraitPresence(state.traitFactLayers, scope));
  if (scope !== 'attackerState' && scope !== 'targetState') return result;
  const actor = scope === 'attackerState' ? 'attacker' : 'target';
  const instances = (state.buffInstances ?? []).filter((instance) => instance.actor === actor);
  const traits = new Set(
    instances.flatMap((instance) => [
      ...instance.traits,
      ...(instance.marker ? [instance.marker.actorTrait] : []),
    ]),
  );
  for (const trait of traits) {
    const marker = markerTraitRead(instances, actor, trait);
    if (marker) {
      if (marker.count > 0) result.set(trait, true);
      else if (marker.known) result.set(trait, false);
      else result.delete(trait);
    }
  }
  return result;
}
export function commitTraitFact(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  present: boolean,
  count: number | null,
  proof: ConditionFactProof,
  countSupport: readonly ConditionFactProof[],
): TraitFactLayers {
  if (
    count === null
      ? !present || countSupport.length !== 0
      : !Number.isInteger(count) || count < 0 || present !== count > 0 || countSupport.length === 0
  )
    throw new TypeError('invalid_committed_trait_fact');
  const fact: TraitFact = !present
    ? { kind: 'absent', proof, quantitySupport: [...countSupport] }
    : {
        kind: 'present',
        proof,
        quantity:
          count === null
            ? { kind: 'unknown' }
            : { kind: 'known', value: count, support: [...countSupport] },
      };
  return {
    ...layers,
    writes: { ...layers.writes, [scope]: new Map([...layers.writes[scope], [trait, fact]]) },
  };
}
/** No caller can inject closed knowledge into a quantity read. */
export function readTraitQuantity(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
): TraitQuantityRead {
  const fact = readTraitFact(layers, scope, trait);
  if (fact) {
    requiredTraitProof(fact.proof, `trait:${scope}:${trait}`);
    if (fact.kind === 'absent') return { value: 0, support: fact.quantitySupport };
    return fact.quantity.kind === 'known'
      ? { value: fact.quantity.value, support: fact.quantity.support }
      : { value: null, support: [] };
  }
  const closed = layers.closedScopes[scope];
  return closed ? { value: 0, support: [closed] } : { value: null, support: [] };
}
export function incrementTraitFact(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  proof: ConditionFactProof,
  exclusive: boolean,
): TraitFactLayers {
  const prior = readTraitQuantity(layers, scope, trait);
  return commitTraitFact(
    layers,
    scope,
    trait,
    true,
    prior.value === null ? null : exclusive ? Math.max(1, prior.value) : prior.value + 1,
    proof,
    prior.value === null ? [] : [...prior.support, proof],
  );
}

/** Both preparation and ordinary writes use the same exclusion and quantity semantics. */
export function addTraitFact(layers: TraitFactLayers, scope: TraitScope, trait: string, proof: ConditionFactProof): TraitFactLayers {
  const group = canonicalExclusiveGroup(scope, trait);
  if (group) for (const other of canonicalExclusiveTraits(scope, group)) {
    if (other !== trait) layers = commitTraitFact(layers, scope, other, false, 0, proof, [proof]);
  }
  return incrementTraitFact(layers, scope, trait, proof, group !== null);
}
