import type { CanonicalAuditValue } from '@fgo-lab/master-data/production-audit';

export type ProductionAuditValueIssue = {
  path: string;
  kind: string;
  representation: string;
};

export type ProductionAuditValueInspection =
  | { status: 'accepted'; value: CanonicalAuditValue }
  | {
      status: 'failed';
      issues: ProductionAuditValueIssue[];
      diagnostic: CanonicalAuditValue;
    };

/** Inspect before serialization. Diagnostic substitutions are never accepted values. */
export function inspectProductionAuditValue(value: unknown): ProductionAuditValueInspection {
  const issues: ProductionAuditValueIssue[] = [];
  const ancestors = new Map<object, string>();
  const invalid = (path: string, kind: string, representation: string): CanonicalAuditValue => {
    issues.push({ path, kind, representation });
    return { auditValueInvalid: { kind, representation } };
  };
  const visit = (item: unknown, path: string): CanonicalAuditValue => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return invalid(path, 'nonFiniteNumber', String(item));
      if (Object.is(item, -0)) return invalid(path, 'signedZero', '-0');
      return item;
    }
    if (typeof item !== 'object')
      return invalid(
        path,
        typeof item,
        typeof item === 'bigint' || typeof item === 'symbol' ? item.toString() : typeof item,
      );
    const previousPath = ancestors.get(item);
    if (previousPath !== undefined) return invalid(path, 'cycle', previousPath);
    const prototype: unknown = Object.getPrototypeOf(item);
    if (
      prototype !== (Array.isArray(item) ? Array.prototype : Object.prototype) &&
      prototype !== null
    )
      return invalid(path, 'objectPrototype', 'nonPlainObject');
    ancestors.set(item, path);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const result: Record<string, CanonicalAuditValue> | CanonicalAuditValue[] = Array.isArray(item)
      ? []
      : {};
    for (const symbol of Object.getOwnPropertySymbols(item))
      invalid(path, 'symbolKey', String(symbol));
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) {
        const descriptor = descriptors[String(index)];
        const childPath = path ? `${path}.${index}` : String(index);
        (result as CanonicalAuditValue[]).push(
          !descriptor
            ? invalid(childPath, 'sparseArray', 'absent')
            : !('value' in descriptor)
              ? invalid(childPath, 'accessor', 'get/set')
              : visit(descriptor.value, childPath),
        );
      }
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (
        Array.isArray(item) &&
        (key === 'length' || (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length))
      )
        continue;
      const childPath = path ? `${path}.${key}` : key;
      if (Array.isArray(item) || !descriptor.enumerable) {
        invalid(childPath, 'unserializedProperty', key);
        continue;
      }
      Object.defineProperty(result, key, {
        value:
          'value' in descriptor
            ? visit(descriptor.value, childPath)
            : invalid(childPath, 'accessor', 'get/set'),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    ancestors.delete(item);
    return result;
  };
  const diagnostic = visit(value, '');
  return issues.length
    ? { status: 'failed', issues, diagnostic }
    : { status: 'accepted', value: diagnostic };
}

export class ProductionAuditValueError extends TypeError {
  constructor(
    readonly inspection: Extract<ProductionAuditValueInspection, { status: 'failed' }>,
    readonly canonicalIdentity: string,
  ) {
    super(
      `production_audit_value_invalid:${inspection.issues[0]!.path}:${inspection.issues[0]!.kind}`,
    );
  }
}

export function acceptedProductionAuditValue(
  value: unknown,
  identity = 'production-audit',
): CanonicalAuditValue {
  const inspection = inspectProductionAuditValue(value);
  if (inspection.status === 'failed') throw new ProductionAuditValueError(inspection, identity);
  return inspection.value;
}

/** Used only for failure artifacts, never for comparison, hashing or execution. */
export function productionAuditDiagnosticValue(value: unknown): CanonicalAuditValue {
  const inspection = inspectProductionAuditValue(value);
  return inspection.status === 'accepted' ? inspection.value : inspection.diagnostic;
}
