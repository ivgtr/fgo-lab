import type { CanonicalAuditValue } from '@fgo-lab/master-data/production-audit';

/** One synchronous audit owns this lossless value graph; later live mutations get a fresh graph. */
export function taggedAuditValue(
  value: unknown,
  copies = new WeakMap<object, CanonicalAuditValue>(),
  visiting = new WeakSet(),
): CanonicalAuditValue {
  if (value === undefined) return { type: 'undefined' };
  if (value === null || typeof value !== 'object')
    return { type: typeof value, value: value as CanonicalAuditValue };
  const cached = copies.get(value);
  if (cached !== undefined) return cached;
  if (visiting.has(value)) throw new TypeError('cyclic_audit_value');
  visiting.add(value);
  const visit = (item: unknown) => taggedAuditValue(item, copies, visiting);
  const result: CanonicalAuditValue =
    value instanceof Set
      ? { type: 'set', values: [...value].map(visit) }
      : value instanceof Map
        ? { type: 'map', values: [...value].map(([key, item]) => [visit(key), visit(item)]) }
        : Array.isArray(value)
          ? { type: 'array', values: value.map(visit) }
          : {
              type: 'object',
              fields: Object.fromEntries(
                Object.entries(value).map(([key, item]) => [key, visit(item)]),
              ),
            };
  copies.set(value, result);
  visiting.delete(value);
  return result;
}
