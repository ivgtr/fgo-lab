/** Negative audit fixtures deliberately corrupt the original owner, without copying its identity. */
export type MutableAuditValue<T> =
  T extends ReadonlyMap<infer K, infer V>
    ? Map<K, V>
    : T extends ReadonlySet<infer V>
      ? Set<V>
      : T extends readonly (infer V)[]
        ? V[]
        : T extends object
          ? { -readonly [K in keyof T]: T[K] }
          : T;

export function mutableAuditView<T>(value: T): MutableAuditValue<T> {
  return value as MutableAuditValue<T>;
}
