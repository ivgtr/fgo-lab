/** Independent complete-value comparison for restored audit diagnostics.
 * Content interning may change alias topology; live owner identity is checked by gates.
 * Validation and successful object-pair tracking belong to this invocation only.
 */
export function equalProductionAuditDiagnosticValues(expected: unknown, actual: unknown): boolean {
  const validate = (root: unknown): void => {
    const complete = new WeakSet();
    const active = new WeakSet();
    const visit = (value: unknown): void => {
      if (
        value === null ||
        value === undefined ||
        typeof value === 'string' ||
        typeof value === 'boolean'
      )
        return;
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || Object.is(value, -0))
          throw new TypeError('invalid_diagnostic_number');
        return;
      }
      if (typeof value !== 'object') throw new TypeError('unsupported_diagnostic_value');
      if (active.has(value)) throw new TypeError('diagnostic_cycle');
      if (complete.has(value)) return;
      active.add(value);
      const prototype: unknown = Object.getPrototypeOf(value);
      if (prototype === Set.prototype || prototype === Map.prototype) {
        if (Reflect.ownKeys(value).length !== 0)
          throw new TypeError('unsupported_diagnostic_property');
        if (prototype === Set.prototype) for (const item of value as Set<unknown>) visit(item);
        else
          for (const [key, item] of value as Map<unknown, unknown>) {
            visit(key);
            visit(item);
          }
      } else if (Array.isArray(value)) {
        if (prototype !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
          throw new TypeError('invalid_diagnostic_array');
        for (let index = 0; index < value.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
            throw new TypeError('invalid_diagnostic_array');
          visit(descriptor.value);
        }
      } else {
        if (prototype !== Object.prototype && prototype !== null)
          throw new TypeError('unsupported_diagnostic_prototype');
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key !== 'string') throw new TypeError('unsupported_diagnostic_key');
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!descriptor.enumerable || !('value' in descriptor))
            throw new TypeError('unsupported_diagnostic_property');
          visit(descriptor.value);
        }
      }
      active.delete(value);
      complete.add(value);
    };
    visit(root);
  };
  validate(expected);
  validate(actual);
  const pairs = new WeakMap<object, WeakSet<object>>();
  const compare = (left: unknown, right: unknown): boolean => {
    if (left === null || typeof left !== 'object' || right === null || typeof right !== 'object')
      return Object.is(left, right);
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (pairs.get(left)?.has(right)) return true;
    let equal: boolean;
    if (Array.isArray(left)) {
      const other = right as unknown[];
      equal =
        left.length === other.length && left.every((item, index) => compare(item, other[index]));
    } else if (left instanceof Set) {
      const other = right as Set<unknown>;
      const iterator = other.values();
      equal = left.size === other.size;
      if (equal)
        for (const item of left)
          if (!compare(item, iterator.next().value)) {
            equal = false;
            break;
          }
    } else if (left instanceof Map) {
      const other = right as Map<unknown, unknown>;
      const iterator = other.entries();
      equal = left.size === other.size;
      if (equal)
        for (const [key, item] of left) {
          const entry = iterator.next().value!;
          if (!compare(key, entry[0]) || !compare(item, entry[1])) {
            equal = false;
            break;
          }
        }
    } else {
      const keys = Object.keys(left);
      equal =
        keys.length === Object.keys(right).length &&
        keys.every(
          (key) =>
            Object.hasOwn(right, key) && compare(Reflect.get(left, key), Reflect.get(right, key)),
        );
    }
    if (equal) {
      let matched = pairs.get(left);
      if (!matched) {
        matched = new WeakSet();
        pairs.set(left, matched);
      }
      matched.add(right);
    }
    return equal;
  };
  return compare(expected, actual);
}
