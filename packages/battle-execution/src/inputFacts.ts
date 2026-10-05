import type { ConditionFactProof } from './conditionRead';

/** A live input and the dependencies that establish its exact value have one writer. */
export type InputFact =
  | { readonly kind: 'known'; readonly value: number; readonly support: readonly ConditionFactProof[] }
  | { readonly kind: 'unknown'; readonly value: null; readonly support: readonly [] };
export type InputFacts = ReadonlyMap<string, InputFact>;

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
      : { kind: 'known', value, support: structuredClone(support) };
  return new Map([...facts, [key, fact]]);
}

export function createInputFacts(
  values: Readonly<Record<string, number>>,
  proof: ConditionFactProof,
): InputFacts {
  let facts: InputFacts = new Map();
  for (const [key, value] of Object.entries(values))
    facts = writeInputFact(facts, key, value, [proof]);
  return facts;
}

export function cloneInputFacts(facts: InputFacts): InputFacts {
  return structuredClone(facts);
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
    [...facts].flatMap(([key, fact]) => (fact.kind === 'known' ? [[key, fact.value]] : [])),
  );
}

export function readInputFact(facts: InputFacts, key: string) {
  const fact = facts.get(key);
  return {
    value: fact?.kind === 'known' ? fact.value : undefined,
    support: fact?.support ?? [],
  };
}
