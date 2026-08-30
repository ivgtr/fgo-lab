import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export interface ProductionAuditLifecycleCounters {
  masterReadCount: number;
  masterParseCount: number;
  compileCount: number;
}

export interface MeasuredProductionAudit<Audit> {
  audit: Audit;
  runtimeCounters: ProductionAuditLifecycleCounters;
  timings: {
    readDurationMs: number;
    parseDurationMs: number;
    compileDurationMs: number;
  };
}

export async function measureProductionAuditLifecycle<Serialized, Parsed, Audit>(operations: {
  read: () => Promise<Serialized>;
  parse: (serialized: Serialized) => Parsed;
  compile: (parsed: Parsed) => Audit;
}): Promise<MeasuredProductionAudit<Audit>> {
  const runtimeCounters: ProductionAuditLifecycleCounters = {
    masterReadCount: 0,
    masterParseCount: 0,
    compileCount: 0,
  };
  const readStarted = performance.now();
  runtimeCounters.masterReadCount += 1;
  const serialized = await operations.read();
  const readDurationMs = performance.now() - readStarted;
  const parseStarted = performance.now();
  runtimeCounters.masterParseCount += 1;
  const parsed = operations.parse(serialized);
  const parseDurationMs = performance.now() - parseStarted;
  const compileStarted = performance.now();
  runtimeCounters.compileCount += 1;
  const audit = operations.compile(parsed);
  const compileDurationMs = performance.now() - compileStarted;
  return {
    audit,
    runtimeCounters,
    timings: { readDurationMs, parseDurationMs, compileDurationMs },
  };
}

export type CanonicalAuditScalar = boolean | number | string | null;
export type CanonicalAuditValue =
  | CanonicalAuditScalar
  | readonly CanonicalAuditValue[]
  | { readonly [key: string]: CanonicalAuditValue };

export interface CanonicalAuditRecord {
  identity: string;
  value: CanonicalAuditValue;
}

export interface CanonicalAuditDifference {
  identity: string;
  path: string;
  expected: CanonicalAuditValue | undefined;
  actual: CanonicalAuditValue | undefined;
}

function assertUniqueCanonicalAuditIdentities(
  records: readonly CanonicalAuditRecord[],
  side: 'expected' | 'actual' | 'records',
): void {
  const identities = new Set<string>();
  for (const { identity } of records) {
    if (identity.length === 0) throw new TypeError(`empty_canonical_audit_identity:${side}`);
    if (identities.has(identity))
      throw new TypeError(`duplicate_canonical_audit_identity:${side}:${identity}`);
    identities.add(identity);
  }
}

function canonicalize(value: CanonicalAuditValue): CanonicalAuditValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

export function canonicalAuditJson(records: readonly CanonicalAuditRecord[]): string {
  assertUniqueCanonicalAuditIdentities(records, 'records');
  return JSON.stringify(
    records
      .map(({ identity, value }) => ({ identity, value: canonicalize(value) }))
      .sort((left, right) => left.identity.localeCompare(right.identity)),
  );
}

export function canonicalAuditDigest(records: readonly CanonicalAuditRecord[]): string {
  return createHash('sha256').update(canonicalAuditJson(records)).digest('hex');
}

function firstValueDifference(
  expected: CanonicalAuditValue | undefined,
  actual: CanonicalAuditValue | undefined,
  path: string,
): Omit<CanonicalAuditDifference, 'identity'> | null {
  if (Object.is(expected, actual)) return null;
  if (
    expected === undefined ||
    actual === undefined ||
    expected === null ||
    actual === null ||
    typeof expected !== 'object' ||
    typeof actual !== 'object' ||
    Array.isArray(expected) !== Array.isArray(actual)
  )
    return { path, expected, actual };
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const expectedArray = expected as readonly CanonicalAuditValue[];
    const actualArray = actual as readonly CanonicalAuditValue[];
    const length = Math.max(expectedArray.length, actualArray.length);
    for (let index = 0; index < length; index += 1) {
      const difference = firstValueDifference(
        expectedArray[index],
        actualArray[index],
        `${path}[${index}]`,
      );
      if (difference) return difference;
    }
    return null;
  }
  const expectedObject = expected as Readonly<Record<string, CanonicalAuditValue>>;
  const actualObject = actual as Readonly<Record<string, CanonicalAuditValue>>;
  const keys = [...new Set([...Object.keys(expectedObject), ...Object.keys(actualObject)])].sort();
  for (const key of keys) {
    const difference = firstValueDifference(
      expectedObject[key],
      actualObject[key],
      path.length === 0 ? key : `${path}.${key}`,
    );
    if (difference) return difference;
  }
  return null;
}

export function firstCanonicalAuditDifference(
  expected: readonly CanonicalAuditRecord[],
  actual: readonly CanonicalAuditRecord[],
): CanonicalAuditDifference | null {
  assertUniqueCanonicalAuditIdentities(expected, 'expected');
  assertUniqueCanonicalAuditIdentities(actual, 'actual');
  const expectedByIdentity = new Map(expected.map((record) => [record.identity, record.value]));
  const actualByIdentity = new Map(actual.map((record) => [record.identity, record.value]));
  const identities = [
    ...new Set([...expectedByIdentity.keys(), ...actualByIdentity.keys()]),
  ].sort();
  for (const identity of identities) {
    const difference = firstValueDifference(
      expectedByIdentity.get(identity),
      actualByIdentity.get(identity),
      '',
    );
    if (difference) return { identity, ...difference };
  }
  return null;
}

export function formatCanonicalAuditMismatch(
  expected: readonly CanonicalAuditRecord[],
  actual: readonly CanonicalAuditRecord[],
): string {
  const expectedDigest = canonicalAuditDigest(expected);
  const actualDigest = canonicalAuditDigest(actual);
  const difference = firstCanonicalAuditDifference(expected, actual);
  if (!difference) return `audit_match:${actualDigest}`;
  return [
    `audit_digest_mismatch:${expectedDigest}:${actualDigest}`,
    `first_difference:${difference.identity}:${difference.path || '<record>'}`,
    `expected:${JSON.stringify(difference.expected)}`,
    `actual:${JSON.stringify(difference.actual)}`,
  ].join('\n');
}
