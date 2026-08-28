import { noblePhantasmVariantKey, type NoblePhantasmVariantRef } from '@fgo-lab/master-data';
import type { DamageResolutionInput } from '@fgo-lab/schema';

export interface CanonicalPreparedDamageInput {
  noblePhantasmVariant: NoblePhantasmVariantRef;
  input: DamageResolutionInput;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

export function preparedDamageInputKey(prepared: CanonicalPreparedDamageInput): string {
  const commonInput = { ...prepared.input, npLevel: 1 as const };
  return JSON.stringify({
    noblePhantasmVariant: noblePhantasmVariantKey(prepared.noblePhantasmVariant),
    input: {
      ...commonInput,
      fieldTraits: sorted(commonInput.fieldTraits),
      attackerStateTraits: sorted(commonInput.attackerStateTraits),
      targetStateTraits: sorted(commonInput.targetStateTraits),
      target: { ...commonInput.target, traits: sorted(commonInput.target.traits) },
    },
  });
}

export class PreparedDamageMatrixCache<T> {
  readonly #values = new Map<string, T>();
  #requestCount = 0;

  getOrCreate(prepared: CanonicalPreparedDamageInput, create: () => T): T {
    this.#requestCount += 1;
    const key = preparedDamageInputKey(prepared);
    const existing = this.#values.get(key);
    if (existing !== undefined) return existing;
    const value = create();
    this.#values.set(key, value);
    return value;
  }

  get inventory() {
    return {
      requestCount: this.#requestCount,
      distinctDamageInputCount: this.#values.size,
      cacheHitCount: this.#requestCount - this.#values.size,
      cacheHitRate:
        this.#requestCount === 0
          ? 0
          : (this.#requestCount - this.#values.size) / this.#requestCount,
    };
  }
}
