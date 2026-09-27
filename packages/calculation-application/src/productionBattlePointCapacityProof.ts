import type { CanonicalAuditValue } from '@fgo-lab/master-data/production-audit';

/** Detached, immutable values. Object identity is retained only within this capture. */
export type BattlePointCapacityValueProof =
  | string
  | number
  | boolean
  | null
  | undefined
  | {
      readonly kind: 'object' | 'nullObject';
      readonly entries: readonly (readonly [string, BattlePointCapacityValueProof])[];
    }
  | { readonly kind: 'array' | 'set'; readonly items: readonly BattlePointCapacityValueProof[] }
  | {
      readonly kind: 'map';
      readonly entries: readonly (readonly [
        BattlePointCapacityValueProof,
        BattlePointCapacityValueProof,
      ])[];
    };

export function captureBattlePointCapacityValue(value: unknown): BattlePointCapacityValueProof {
  const captured = new WeakMap<object, BattlePointCapacityValueProof>();
  const active = new WeakSet();
  const visit = (value: unknown): BattlePointCapacityValueProof => {
    if (
      value === undefined ||
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        throw new TypeError('invalid_capacity_proof_number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError('unsupported_capacity_proof_value');
    if (active.has(value)) throw new TypeError('cyclic_capacity_proof_value');
    const prior = captured.get(value);
    if (prior !== undefined) return prior;
    active.add(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    let proof: BattlePointCapacityValueProof;
    if (prototype === Set.prototype || prototype === Map.prototype) {
      if (Reflect.ownKeys(value).length) throw new TypeError('unsupported_capacity_proof_property');
      proof =
        prototype === Set.prototype
          ? { kind: 'set', items: Object.freeze([...(value as Set<unknown>)].map(visit)) }
          : {
              kind: 'map',
              entries: Object.freeze(
                [...(value as Map<unknown, unknown>)].map(([key, item]) =>
                  Object.freeze([visit(key), visit(item)] as const),
                ),
              ),
            };
    } else if (Array.isArray(value)) {
      if (prototype !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
        throw new TypeError('invalid_capacity_proof_array');
      const items: BattlePointCapacityValueProof[] = [];
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          throw new TypeError('invalid_capacity_proof_array');
        items.push(visit(descriptor.value));
      }
      proof = { kind: 'array', items: Object.freeze(items) };
    } else {
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('unsupported_capacity_proof_prototype');
      const entries = Reflect.ownKeys(value).map((key) => {
        if (typeof key !== 'string') throw new TypeError('unsupported_capacity_proof_key');
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!descriptor.enumerable || !('value' in descriptor))
          throw new TypeError('unsupported_capacity_proof_property');
        return Object.freeze([key, visit(descriptor.value)] as const);
      });
      proof = {
        kind: prototype === null ? 'nullObject' : 'object',
        entries: Object.freeze(entries),
      };
    }
    Object.freeze(proof);
    captured.set(value, proof);
    active.delete(value);
    return proof;
  };
  return visit(value);
}

/** Materialization reads only established proof, never live owners or execution writers. */
export function materializeBattlePointCapacityValue(proof: BattlePointCapacityValueProof): unknown {
  const materialized = new WeakMap<object, object>();
  const visit = (proof: BattlePointCapacityValueProof): unknown => {
    if (proof === null || typeof proof !== 'object') return proof;
    const prior = materialized.get(proof);
    if (prior) return prior;
    let value: object;
    switch (proof.kind) {
      case 'array':
        value = proof.items.map(visit);
        break;
      case 'set':
        value = new Set(proof.items.map(visit));
        break;
      case 'map':
        value = new Map(proof.entries.map(([key, item]) => [visit(key), visit(item)]));
        break;
      case 'object':
      case 'nullObject':
        value = proof.kind === 'nullObject' ? (Object.create(null) as object) : {};
        for (const [key, item] of proof.entries)
          Object.defineProperty(value, key, {
            value: visit(item),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        break;
    }
    materialized.set(proof, value);
    return value;
  };
  return visit(proof);
}

/** The scalar audit's canonical projection, with call-local identity sharing only.
 * This is a separate semantic view from lossless typed proof and live authority.
 */
export function battlePointCapacityCanonicalSnapshotter() {
  const values = new WeakMap<object, CanonicalAuditValue>();
  const active = new WeakSet();
  const snapshot = (value: unknown): CanonicalAuditValue => {
    if (value === undefined) return Object.freeze({ kind: 'absent' });
    if (value === null || typeof value !== 'object') return value as CanonicalAuditValue;
    if (active.has(value)) throw new TypeError('cyclic_capacity_canonical_value');
    const prior = values.get(value);
    if (prior) return prior;
    active.add(value);
    let result: CanonicalAuditValue;
    if (value instanceof Set) result = [...value].map(snapshot);
    else if (value instanceof Map)
      result = [...value].map(([key, item]) => Object.freeze([snapshot(key), snapshot(item)]));
    else if (Array.isArray(value)) result = value.map(snapshot);
    else
      result = Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, snapshot(item)]),
      );
    Object.freeze(result);
    values.set(value, result);
    active.delete(value);
    return result;
  };
  return snapshot;
}
