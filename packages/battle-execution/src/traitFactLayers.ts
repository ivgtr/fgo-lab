import type { ActorScope, BattleStateBase, TraitScope } from './contracts';
import type { ConditionFactProof } from './conditionRead';

export interface TraitFact {
  present: boolean;
  count: number | null;
  proof: ConditionFactProof;
  countSupport: readonly ConditionFactProof[];
}
type Facts = ReadonlyMap<string, TraitFact>;
type ScopedFacts = Record<TraitScope, Facts>;

/** Form declarations, external initial assertions, and committed writes have different lifetimes. */
export interface TraitFactLayers {
  intrinsic: Record<ActorScope, Facts>;
  externalInitial: ScopedFacts;
  writes: ScopedFacts;
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
export function createTraitFactLayers(
  intrinsicTraits: readonly string[],
  externalTraits: Partial<Record<TraitScope, readonly string[]>>,
  intrinsicProof: ConditionFactProof,
  externalProof: ConditionFactProof,
): TraitFactLayers {
  const fromTraits = (traits: readonly string[], proof: ConditionFactProof): Facts => {
    const facts = new Map<string, TraitFact>();
    for (const trait of traits)
      facts.set(trait, {
        present: true,
        count: (facts.get(trait)?.count ?? 0) + 1,
        proof,
        countSupport: [proof],
      });
    return facts;
  };
  const externalInitial = scopedFacts();
  for (const scope of traitScopes)
    externalInitial[scope] = fromTraits(externalTraits[scope] ?? [], externalProof);
  return {
    intrinsic: { attacker: fromTraits(intrinsicTraits, intrinsicProof), target: new Map() },
    externalInitial,
    writes: scopedFacts(),
  };
}
export function cloneTraitFactLayers(layers: TraitFactLayers): TraitFactLayers {
  const clone = (facts: Facts): Facts =>
    new Map(
      [...facts].map(([key, fact]) => [key, { ...fact, countSupport: [...fact.countSupport] }]),
    );
  const externalInitial = scopedFacts();
  const writes = scopedFacts();
  for (const scope of traitScopes) {
    externalInitial[scope] = clone(layers.externalInitial[scope]);
    writes[scope] = clone(layers.writes[scope]);
  }
  return {
    intrinsic: {
      attacker: clone(layers.intrinsic.attacker),
      target: clone(layers.intrinsic.target),
    },
    externalInitial,
    writes,
  };
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
  const written = layers.writes[scope].get(trait);
  if (written) return written;
  if (scope === 'attacker' || scope === 'target') {
    const intrinsic = layers.intrinsic[scope].get(trait);
    if (intrinsic) return intrinsic;
  }
  return layers.externalInitial[scope].get(trait);
}
export function assertExternalInitialTrait(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  present: boolean,
  proof: ConditionFactProof,
): void {
  if (
    (scope === 'attacker' || scope === 'target') &&
    !present &&
    layers.intrinsic[scope].get(trait)?.present
  )
    throw new TypeError('contradictory_intrinsic_trait_assertion');
  (layers.externalInitial[scope] as Map<string, TraitFact>).set(trait, {
    present,
    count: Number(present),
    proof,
    countSupport: [proof],
  });
}
export function projectTraitScope(
  state: Pick<
    BattleStateBase,
    'traitFactLayers' | 'traits' | 'traitCounts' | 'conditionFactProofs'
  >,
  scope: TraitScope,
): void {
  const facts = projectTraitFacts(state.traitFactLayers, scope);
  state.traits[scope] = new Map([...facts].map(([trait, fact]) => [trait, fact.present]));
  state.traitCounts[scope] = Object.fromEntries(
    [...facts].flatMap(([trait, fact]) =>
      fact.present && fact.count !== null ? [[trait, fact.count]] : [],
    ),
  );
  state.conditionFactProofs.traits[scope] = new Map(
    [...facts].map(([trait, fact]) => [trait, fact.proof]),
  );
}
export function commitTraitFact(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  present: boolean,
  count: number | null,
  proof: ConditionFactProof,
  countSupport: readonly ConditionFactProof[],
): void {
  if (
    count === null
      ? !present || countSupport.length !== 0
      : !Number.isInteger(count) || count < 0 || present !== count > 0 || countSupport.length === 0
  )
    throw new TypeError('invalid_committed_trait_fact');
  (layers.writes[scope] as Map<string, TraitFact>).set(trait, {
    present,
    count,
    proof,
    countSupport: [...countSupport],
  });
}

/** Presence can be guaranteed while a count still depends on an earlier possible write. */
export function readTraitQuantity(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  complete: ConditionFactProof | null,
): { value: number | null; support: readonly ConditionFactProof[] } {
  const fact = readTraitFact(layers, scope, trait);
  if (fact) return { value: fact.count, support: fact.countSupport };
  return complete ? { value: 0, support: [complete] } : { value: null, support: [] };
}

export function incrementTraitFact(
  layers: TraitFactLayers,
  scope: TraitScope,
  trait: string,
  proof: ConditionFactProof,
  complete: ConditionFactProof | null,
  exclusive: boolean,
): void {
  const prior = readTraitQuantity(layers, scope, trait, complete);
  commitTraitFact(
    layers,
    scope,
    trait,
    true,
    prior.value === null ? null : exclusive ? Math.max(1, prior.value) : prior.value + 1,
    proof,
    prior.value === null ? [] : [...prior.support, proof],
  );
}
