import type { ConditionFactProof, ConditionRead, SourceProcRead } from './conditionRead';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';

/** A live input and the dependencies that establish its exact value have one writer. */
export type InputFact =
  | {
      readonly kind: 'known';
      readonly value: number;
      readonly support: readonly ConditionFactProof[];
    }
  | { readonly kind: 'unknown'; readonly value: null; readonly support: readonly [] }
  | {
      readonly kind: 'invalid';
      readonly value: number;
      readonly definition: CanonicalInputDefinition;
      readonly support: readonly ConditionFactProof[];
    }
  | {
      readonly kind: 'conditional';
      readonly condition: ConditionRead;
      readonly proc: SourceProcRead;
      readonly whenTrue: InputFact;
      readonly whenFalse: InputFact;
      /** Dependencies establishing the complete domain, not a selected exact value. */
      readonly support: readonly ConditionFactProof[];
      readonly recoveryInputs: readonly CanonicalInputDefinition[];
    };
export type InputFacts = ReadonlyMap<string, InputFact>;

// Owned fact data is immutable. A new writer copies mutable incoming data once,
// and retains previously owned dependencies rather than cloning their histories.
const ownedFactData = new WeakSet<object>();

function ownFactData<T>(value: T): T {
  const copies = new WeakMap<object, object>();
  const visiting = new WeakSet<object>();
  const copy = (item: unknown): unknown => {
    if (item === null || typeof item !== 'object') return item;
    if (ownedFactData.has(item)) return item;
    if (visiting.has(item)) throw new TypeError('cyclic_input_fact_dependency');
    const previous = copies.get(item);
    if (previous) return previous;
    const prototype: unknown = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
      throw new TypeError('invalid_input_fact_dependency');
    const result: object = Array.isArray(item) ? new Array<unknown>(item.length) : {};
    copies.set(item, result);
    visiting.add(item);
    for (const [key, child] of Object.entries(item)) Reflect.set(result, key, copy(child));
    visiting.delete(item);
    Object.freeze(result);
    ownedFactData.add(result);
    return result;
  };
  return copy(value) as T;
}

export function writeInputFact(
  facts: InputFacts,
  key: string,
  value: number | null,
  support: readonly ConditionFactProof[],
): InputFacts {
  if (value !== null && (!Number.isFinite(value) || support.length === 0))
    throw new TypeError('invalid_input_fact');
  if (value === null && support.length !== 0) throw new TypeError('unknown_input_fact_support');
  const fact: InputFact =
    value === null
      ? { kind: 'unknown', value: null, support: [] }
      : { kind: 'known', value, support };
  return new Map([...facts, [key, ownFactData(fact)]]);
}

export function createInputFacts(
  values: Readonly<Record<string, number>>,
  proof: ConditionFactProof,
): InputFacts {
  let facts: InputFacts = new Map();
  const support = ownFactData([proof]);
  for (const [key, value] of Object.entries(values))
    facts = writeInputFact(facts, key, value, support);
  return facts;
}

export function cloneInputFacts(facts: InputFacts): InputFacts {
  return new Map([...facts].map(([key, fact]) => [key, ownFactData({ ...fact })]));
}

/** Preserve the original value and the declaration that rejects it. */
export function rejectInputFact(
  facts: InputFacts,
  definition: CanonicalInputDefinition,
  fact: Extract<InputFact, { kind: 'known' }>,
): InputFacts {
  const rejected = ownFactData({ ...fact, kind: 'invalid' as const, definition });
  return new Map([...facts, [definition.key, rejected]]);
}

/** The writer retains both physical outcomes and their actual activation read. */
export function commitConditionalInputFact(
  facts: InputFacts,
  key: string,
  fact: Extract<InputFact, { kind: 'conditional' }>,
): { facts: InputFacts; fact: Extract<InputFact, { kind: 'conditional' }> } {
  const committed = ownFactData(fact);
  return { facts: new Map([...facts, [key, committed]]), fact: committed };
}

/** A deterministic physical write transforms the retained branches without choosing a witness. */
export function mapInputFact(
  fact: InputFact,
  map: (value: number) => number,
  proof: ConditionFactProof,
): InputFact {
  if (fact.kind === 'unknown' || fact.kind === 'invalid') return ownFactData(fact);
  if (fact.kind === 'known')
    return ownFactData({
      kind: 'known',
      value: map(fact.value),
      support: [...fact.support, proof],
    });
  return ownFactData({
    ...fact,
    whenTrue: mapInputFact(fact.whenTrue, map, proof),
    whenFalse: mapInputFact(fact.whenFalse, map, proof),
    support: [...fact.support, proof],
  });
}

export function exactInputFactValue(fact: InputFact): number | undefined {
  if (fact.kind === 'unknown' || fact.kind === 'invalid') return undefined;
  if (fact.kind === 'known') return fact.value;
  const left = exactInputFactValue(fact.whenTrue);
  const right = exactInputFactValue(fact.whenFalse);
  return left !== undefined && left === right ? left : undefined;
}

export function inputFactPredicate(
  fact: InputFact,
  predicate: (value: number) => boolean,
): boolean | null {
  if (fact.kind === 'unknown' || fact.kind === 'invalid') return null;
  if (fact.kind === 'known') return predicate(fact.value);
  const left = inputFactPredicate(fact.whenTrue, predicate);
  const right = inputFactPredicate(fact.whenFalse, predicate);
  return left !== null && left === right ? left : null;
}

/** Bind still-unread initial inputs without replacing a live write or an explicit unknown. */
export function seedUnreadInputFacts(
  facts: InputFacts,
  values: Readonly<Record<string, number>>,
  proof: ConditionFactProof,
): InputFacts {
  let seeded = facts;
  for (const [key, value] of Object.entries(values))
    if (!seeded.has(key)) seeded = writeInputFact(seeded, key, value, [proof]);
  return seeded;
}

/** Transport to existing coefficient readers; this projection is never a live writer. */
export function inputFactValues(facts: InputFacts): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...facts].flatMap(([key, fact]) => {
      const value = exactInputFactValue(fact);
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

export function readInputFact(facts: InputFacts, key: string) {
  const fact = facts.get(key);
  return {
    kind: fact === undefined ? ('unbound' as const) : fact.kind,
    fact,
    value: fact === undefined ? undefined : exactInputFactValue(fact),
    support: fact?.support ?? [],
  };
}
