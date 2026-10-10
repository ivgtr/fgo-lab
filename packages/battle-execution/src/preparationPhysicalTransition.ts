import type { BattleOperation, ExecutableBattleState } from './contracts';
import type { PreNoblePhantasmState } from './preparationContracts';
import type { PhysicalOperationTransition } from './executionBinding';
import type { ConditionFactProof } from './conditionRead';
import type { TraitFact } from './traitFactLayers';
import type { CountedBuffInstance } from './buffInstances';
import { cloneInputFacts } from './inputFacts';
import { cloneConditionFactProofs } from './conditionRead';
import { traitScopes } from './traitFactLayers';
import { hpPermille } from './hpResource';

type MapDelta<T> = ReadonlyMap<string, T | null>;

function changedEntries<T>(
  before: ReadonlyMap<string, T>,
  after: ReadonlyMap<string, T>,
): MapDelta<T> {
  const changes = new Map<string, T | null>();
  if (before === after) return changes;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) === after.get(key) && before.has(key) === after.has(key)) continue;
    changes.set(key, after.get(key) ?? null);
  }
  return changes;
}

function applyEntries<T>(
  current: ReadonlyMap<string, T>,
  changes: MapDelta<T>,
): ReadonlyMap<string, T> {
  if (changes.size === 0) return current;
  const result = new Map(current);
  for (const [key, value] of changes) {
    if (value === null) result.delete(key);
    else result.set(key, value);
  }
  return result;
}

function buffInstanceMap(
  instances: readonly CountedBuffInstance[],
): Map<string, CountedBuffInstance> {
  const byIdentity = new Map<string, CountedBuffInstance>();
  for (const instance of instances) {
    if (byIdentity.has(instance.identity)) throw new TypeError('duplicate_buff_instance_identity');
    byIdentity.set(instance.identity, instance);
  }
  return byIdentity;
}

export function changedBuffInstances(
  before: readonly CountedBuffInstance[],
  after: readonly CountedBuffInstance[],
): NonNullable<PhysicalOperationTransition['buffInstances']> {
  const beforeByIdentity = buffInstanceMap(before);
  const afterByIdentity = buffInstanceMap(after);
  const changes = new Map<
    string,
    { readonly previous: 'present' | 'absent'; readonly current: CountedBuffInstance | null }
  >();
  for (const identity of new Set([...beforeByIdentity.keys(), ...afterByIdentity.keys()])) {
    const previous = beforeByIdentity.get(identity);
    const current = afterByIdentity.get(identity);
    if (previous === current) continue;
    changes.set(identity, { previous: previous ? 'present' : 'absent', current: current ?? null });
  }
  return changes;
}

export function applyBuffInstanceChanges(
  instances: readonly CountedBuffInstance[],
  changes: NonNullable<PhysicalOperationTransition['buffInstances']>,
): readonly CountedBuffInstance[] {
  const byIdentity = buffInstanceMap(instances);
  for (const [identity, change] of changes) {
    if (change.previous === 'present') {
      if (!byIdentity.has(identity)) continue;
      if (change.current === null) byIdentity.delete(identity);
      else byIdentity.set(identity, change.current);
    } else if (change.current !== null) {
      if (byIdentity.has(identity)) throw new TypeError('duplicate_buff_instance_identity');
      byIdentity.set(identity, change.current);
    }
  }
  return [...byIdentity.values()];
}

/** Keep changed physical entries only; the binding must never retain a native state root. */
export function capturePhysicalOperationTransition(
  operationIndex: number,
  before: PreNoblePhantasmState,
  after: PreNoblePhantasmState,
): PhysicalOperationTransition {
  const inputFacts = changedEntries(before.inputFacts, after.inputFacts);
  const traitWrites: Partial<Record<(typeof traitScopes)[number], MapDelta<TraitFact>>> = {};
  const externalTraits: typeof traitWrites = {};
  const closedScopes: NonNullable<PhysicalOperationTransition['closedScopes']>[number][] = [];
  const traitProofs: Partial<Record<(typeof traitScopes)[number], MapDelta<ConditionFactProof>>> =
    {};
  for (const scope of traitScopes) {
    const writes = changedEntries(
      before.traitFactLayers.writes[scope],
      after.traitFactLayers.writes[scope],
    );
    if (writes.size) traitWrites[scope] = writes;
    const external = changedEntries(
      before.traitFactLayers.externalInitial[scope],
      after.traitFactLayers.externalInitial[scope],
    );
    if (external.size) externalTraits[scope] = external;
    if (before.traitFactLayers.closedScopes[scope] !== after.traitFactLayers.closedScopes[scope])
      closedScopes.push([scope, after.traitFactLayers.closedScopes[scope]]);
    const proofs = changedEntries(
      before.conditionFactProofs.traits[scope],
      after.conditionFactProofs.traits[scope],
    );
    if (proofs.size) traitProofs[scope] = proofs;
  }
  const suppressionProofs: NonNullable<PhysicalOperationTransition['suppressionProofs']> = {};
  for (const actor of ['attacker', 'target'] as const) {
    const proofs = changedEntries(
      before.conditionFactProofs.suppressions[actor],
      after.conditionFactProofs.suppressions[actor],
    );
    if (proofs.size) suppressionProofs[actor] = proofs;
  }
  const quantityProofs = changedEntries(
    before.conditionFactProofs.quantities,
    after.conditionFactProofs.quantities,
  );
  const markerProofs = changedEntries(
    before.conditionFactProofs.markers,
    after.conditionFactProofs.markers,
  );
  const buffInstances =
    before.buffInstances === after.buffInstances
      ? null
      : changedBuffInstances(before.buffInstances, after.buffInstances);
  return {
    operationIndex,
    ...(inputFacts.size ? { inputFacts } : {}),
    ...(Object.keys(traitWrites).length ? { traitWrites } : {}),
    ...(Object.keys(externalTraits).length ? { externalTraits } : {}),
    ...(before.traitFactLayers.intrinsic.attacker !== after.traitFactLayers.intrinsic.attacker
      ? { intrinsicAttacker: after.traitFactLayers.intrinsic.attacker }
      : {}),
    ...(closedScopes.length ? { closedScopes } : {}),
    ...(Object.keys(traitProofs).length ? { traitProofs } : {}),
    ...(Object.keys(suppressionProofs).length ? { suppressionProofs } : {}),
    ...(quantityProofs.size ? { quantityProofs } : {}),
    ...(markerProofs.size ? { markerProofs } : {}),
    ...(buffInstances?.size ? { buffInstances } : {}),
    ...(before.hp !== after.hp ? { hp: after.hp } : {}),
    ...(before.currentFormId !== after.currentFormId ? { currentFormId: after.currentFormId } : {}),
    ...(before.noblePhantasmVariant !== after.noblePhantasmVariant
      ? { noblePhantasmVariant: after.noblePhantasmVariant }
      : {}),
    ...(before.initialTraitSuppressions !== after.initialTraitSuppressions
      ? { initialTraitSuppressions: after.initialTraitSuppressions }
      : {}),
  };
}

/** Apply a sealed native operation at the matching canonical position. */
export function applyCommittedPreparationTransition(
  operation: BattleOperation,
  state: ExecutableBattleState,
): boolean {
  const binding = operation.runtimeBinding;
  if (!binding?.sourcePhysicalCommitted) return false;
  // Completion alone does not establish a native critical-star write (including a no-op).
  if (
    operation.kind === 'resourceMutation' &&
    operation.resource === 'criticalStars' &&
    !binding.physicalInput
  )
    return false;
  if (
    operation.kind !== 'resourceMutation' &&
    operation.kind !== 'addTrait' &&
    operation.kind !== 'removeTrait' &&
    operation.kind !== 'suppressInitialTrait' &&
    operation.kind !== 'transformActorForm' &&
    operation.kind !== 'selectNoblePhantasmVariant' &&
    !(operation.kind === 'preserveSemanticEffect' && operation.buffMutation)
  )
    return false;
  const change = binding.physicalTransition;
  // Native source completion also establishes a physical no-op at this position.
  if (!change) return true;
  if (change.inputFacts)
    state.inputFacts = cloneInputFacts(applyEntries(state.inputFacts, change.inputFacts));
  if (
    change.traitWrites ||
    change.externalTraits ||
    change.intrinsicAttacker ||
    change.closedScopes
  ) {
    const layers = {
      ...state.traitFactLayers,
      writes: { ...state.traitFactLayers.writes },
      externalInitial: { ...state.traitFactLayers.externalInitial },
      intrinsic: { ...state.traitFactLayers.intrinsic },
      closedScopes: { ...state.traitFactLayers.closedScopes },
    };
    for (const scope of traitScopes) {
      const writes = change.traitWrites?.[scope];
      if (writes) layers.writes[scope] = applyEntries(layers.writes[scope], writes);
      const external = change.externalTraits?.[scope];
      if (external)
        layers.externalInitial[scope] = applyEntries(layers.externalInitial[scope], external);
    }
    if (change.intrinsicAttacker) layers.intrinsic.attacker = new Map(change.intrinsicAttacker);
    for (const [scope, proof] of change.closedScopes ?? []) layers.closedScopes[scope] = proof;
    state.traitFactLayers = layers;
  }
  if (
    change.traitProofs ||
    change.suppressionProofs ||
    change.quantityProofs ||
    change.markerProofs
  ) {
    const proofs = cloneConditionFactProofs(state.conditionFactProofs);
    for (const scope of traitScopes) {
      const delta = change.traitProofs?.[scope];
      if (delta) proofs.traits[scope] = applyEntries(proofs.traits[scope], delta);
    }
    for (const actor of ['attacker', 'target'] as const) {
      const delta = change.suppressionProofs?.[actor];
      if (delta) proofs.suppressions[actor] = applyEntries(proofs.suppressions[actor], delta);
    }
    if (change.quantityProofs)
      proofs.quantities = applyEntries(proofs.quantities, change.quantityProofs);
    if (change.markerProofs) proofs.markers = applyEntries(proofs.markers, change.markerProofs);
    state.conditionFactProofs = proofs;
  }
  if (change.buffInstances)
    state.buffInstances = applyBuffInstanceChanges(state.buffInstances ?? [], change.buffInstances);
  for (const instance of state.buffInstances ?? [])
    if (!state.conditionFactProofs.markers.has(instance.identity))
      throw new TypeError(`missing_committed_marker_proof:${instance.identity}`);
  if ('hp' in change) {
    state.hp = change.hp!;
    state.quantities.attackerHpPermille = hpPermille(change.hp?.actors.attacker);
  }
  if (change.currentFormId) {
    state.actorFormId = change.currentFormId;
    state.conditionReadClock = { ...state.conditionReadClock, actorFormId: change.currentFormId };
  }
  if ('noblePhantasmVariant' in change) {
    if (!change.noblePhantasmVariant || change.noblePhantasmVariant.kind !== 'attack')
      throw new TypeError('non_attack_preparation_variant');
    state.noblePhantasmVariant = change.noblePhantasmVariant;
    state.card = change.noblePhantasmVariant.card;
  }
  if (change.initialTraitSuppressions)
    state.initialTraitSuppressions = {
      attacker: new Set(change.initialTraitSuppressions.attacker),
      target: new Set(change.initialTraitSuppressions.target),
    };
  return true;
}
