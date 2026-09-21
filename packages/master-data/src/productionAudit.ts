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

export function assertCanonicalAuditRecords(
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
  assertCanonicalAuditRecords(records, 'records');
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
  assertCanonicalAuditRecords(expected, 'expected');
  assertCanonicalAuditRecords(actual, 'actual');
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

export type ProductionAuditBoundary = 'data-pipeline' | 'calculation-application';

export interface Tsk065ProductionAuditSource {
  task: 'TSK-06.5';
  status: 'complete';
  artifact: string;
  masterDataVersion: string;
  staticSemanticsDigest: string;
  candidateEligibilityDigest: string;
  matrix: {
    dimensions: string;
    conditionCount: number;
    attackProfileCount: number;
    outcomeCount: number;
    outcomes: {
      calculated: number;
      unavailableUnderPolicy: number;
      inputRequired: number;
      invalid: number;
      unsupported: number;
    };
    parityCount: number;
    parityFailures: number;
    mergedDigest: string;
    eligibilityDigest: string;
    artifact: string;
  };
}

export interface ProductionAuditBoundaryModel<
  Inventory = unknown,
  Failure = unknown,
  Counters = unknown,
> {
  boundary: ProductionAuditBoundary;
  producer: string;
  masterDataVersion: string;
  recordCount: number;
  digest: string;
  inventory: Inventory;
  failures: readonly Failure[];
  counters: Counters;
}

export interface ProductionAuditMatrixModel {
  producer: string;
  masterDataVersion: string;
  conditionCount: number;
  attackProfileCount: number;
  outcomeCount: number;
  outcomes: Tsk065ProductionAuditSource['matrix']['outcomes'];
  parityCount: number;
  parityFailures: number;
  digest: string;
  eligibilityDigest: string;
}

export interface SharedProductionAuditModel<Payload> {
  source: Tsk065ProductionAuditSource;
  payload: Payload;
}

function sourceRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`tsk06_5_source_invalid_object:${path}`);
  return value as Record<string, unknown>;
}

function sourceString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`tsk06_5_source_invalid_string:${path}`);
  return value;
}

function sourceDigest(value: unknown, path: string): string {
  const digest = sourceString(value, path);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new TypeError(`tsk06_5_source_invalid_digest:${path}`);
  return digest;
}

function sourceCount(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`tsk06_5_source_invalid_count:${path}`);
  return value as number;
}

/**
 * Reads the already-approved TSK-06.5 evidence as a source reference.
 * This validates and projects the evidence; it never derives a new inventory or digest.
 */
export function createTsk065ProductionAuditSource(
  evidence: unknown,
  input: { masterDataVersion: string; artifact: string },
): Tsk065ProductionAuditSource {
  const root = sourceRecord(evidence, 'root');
  if (root.task !== 'TSK-06.5') throw new TypeError('tsk06_5_source_task_mismatch');
  if (root.status !== 'complete') throw new TypeError('tsk06_5_source_not_complete');
  const masterDataVersion = sourceString(input.masterDataVersion, 'masterDataVersion');
  const artifact = sourceString(input.artifact, 'artifact');
  const staticSemantics = sourceRecord(root.staticSemantics, 'staticSemantics');
  const candidateEligibility = sourceRecord(root.candidateEligibility, 'candidateEligibility');
  const matrix = sourceRecord(root.productionMatrix, 'productionMatrix');
  const outcomes = sourceRecord(matrix.outcomes, 'productionMatrix.outcomes');
  const candidateEligibilityDigest = sourceDigest(
    candidateEligibility.digest,
    'candidateEligibility.digest',
  );
  const matrixEligibilityDigest = sourceDigest(
    matrix.eligibilityDigest,
    'productionMatrix.eligibilityDigest',
  );
  if (candidateEligibilityDigest !== matrixEligibilityDigest)
    throw new TypeError('tsk06_5_source_eligibility_digest_mismatch');
  return {
    task: 'TSK-06.5',
    status: 'complete',
    artifact,
    masterDataVersion,
    staticSemanticsDigest: sourceDigest(staticSemantics.digest, 'staticSemantics.digest'),
    candidateEligibilityDigest,
    matrix: {
      dimensions: sourceString(matrix.dimensions, 'productionMatrix.dimensions'),
      conditionCount: sourceCount(matrix.conditionCount, 'productionMatrix.conditionCount'),
      attackProfileCount: sourceCount(
        matrix.attackProfileCount,
        'productionMatrix.attackProfileCount',
      ),
      outcomeCount: sourceCount(matrix.outcomeCount, 'productionMatrix.outcomeCount'),
      outcomes: {
        calculated: sourceCount(outcomes.calculated, 'productionMatrix.outcomes.calculated'),
        unavailableUnderPolicy: sourceCount(
          outcomes.unavailableUnderPolicy,
          'productionMatrix.outcomes.unavailableUnderPolicy',
        ),
        inputRequired: sourceCount(
          outcomes.inputRequired,
          'productionMatrix.outcomes.inputRequired',
        ),
        invalid: sourceCount(outcomes.invalid, 'productionMatrix.outcomes.invalid'),
        unsupported: sourceCount(outcomes.unsupported, 'productionMatrix.outcomes.unsupported'),
      },
      parityCount: sourceCount(matrix.parityCount, 'productionMatrix.parityCount'),
      parityFailures: sourceCount(matrix.parityFailures, 'productionMatrix.parityFailures'),
      mergedDigest: sourceDigest(matrix.mergedDigest, 'productionMatrix.mergedDigest'),
      eligibilityDigest: matrixEligibilityDigest,
      artifact: sourceString(matrix.artifact, 'productionMatrix.artifact'),
    },
  };
}

function assertBoundaryDigest(digest: string, path: string): void {
  if (!/^[a-f0-9]{64}$/.test(digest))
    throw new TypeError(`shared_production_audit_invalid_digest:${path}`);
}

export function connectProductionAuditBoundary<Inventory, Failure, Counters>(
  source: Tsk065ProductionAuditSource,
  audit: Omit<
    ProductionAuditBoundaryModel<Inventory, Failure, Counters>,
    'producer' | 'recordCount'
  > & {
    records: readonly CanonicalAuditRecord[];
  },
  producer: string,
): SharedProductionAuditModel<ProductionAuditBoundaryModel<Inventory, Failure, Counters>> {
  if (producer.length === 0) throw new TypeError('shared_production_audit_producer_missing');
  if (audit.masterDataVersion !== source.masterDataVersion)
    throw new TypeError(
      `shared_production_audit_master_version_mismatch:${source.masterDataVersion}:${audit.masterDataVersion}`,
    );
  assertBoundaryDigest(audit.digest, 'boundary.digest');
  assertCanonicalAuditRecords(audit.records, 'records');
  return {
    source,
    payload: {
      boundary: audit.boundary,
      producer,
      masterDataVersion: audit.masterDataVersion,
      recordCount: audit.records.length,
      digest: audit.digest,
      inventory: audit.inventory,
      failures: audit.failures,
      counters: audit.counters,
    },
  };
}

export interface ProductionAuditClosureInput {
  conditionCount: number;
  attackProfileCount: number;
  outcomeCount: number;
  outcomes: Tsk065ProductionAuditSource['matrix']['outcomes'];
  parityCount: number;
  parityFailures: readonly unknown[];
  digest: string;
  eligibility: { digest: string };
}

/**
 * Connects the complete TSK-06.5 matrix without recalculating its records.
 * Any mismatch remains a typed audit failure and exposes the first canonical field.
 */
export function connectProductionAuditMatrix(
  source: Tsk065ProductionAuditSource,
  audit: ProductionAuditClosureInput,
  producer = 'auditProductionClosure',
): SharedProductionAuditModel<ProductionAuditMatrixModel> {
  if (producer.length === 0) throw new TypeError('shared_production_audit_producer_missing');
  assertBoundaryDigest(audit.digest, 'matrix.digest');
  assertBoundaryDigest(audit.eligibility.digest, 'matrix.eligibility.digest');
  const expected: CanonicalAuditRecord[] = [
    {
      identity: 'tsk-06.5:production-matrix',
      value: {
        conditionCount: source.matrix.conditionCount,
        attackProfileCount: source.matrix.attackProfileCount,
        outcomeCount: source.matrix.outcomeCount,
        outcomes: source.matrix.outcomes,
        parityCount: source.matrix.parityCount,
        parityFailures: source.matrix.parityFailures,
        digest: source.matrix.mergedDigest,
        eligibilityDigest: source.matrix.eligibilityDigest,
      },
    },
  ];
  const actual: CanonicalAuditRecord[] = [
    {
      identity: 'tsk-06.5:production-matrix',
      value: {
        conditionCount: audit.conditionCount,
        attackProfileCount: audit.attackProfileCount,
        outcomeCount: audit.outcomeCount,
        outcomes: audit.outcomes,
        parityCount: audit.parityCount,
        parityFailures: audit.parityFailures.length,
        digest: audit.digest,
        eligibilityDigest: audit.eligibility.digest,
      },
    },
  ];
  const difference = firstCanonicalAuditDifference(expected, actual);
  if (difference)
    throw new TypeError(
      `shared_production_audit_matrix_mismatch:${difference.identity}:${difference.path || '<record>'}`,
    );
  return {
    source,
    payload: {
      producer,
      masterDataVersion: source.masterDataVersion,
      conditionCount: audit.conditionCount,
      attackProfileCount: audit.attackProfileCount,
      outcomeCount: audit.outcomeCount,
      outcomes: audit.outcomes,
      parityCount: audit.parityCount,
      parityFailures: audit.parityFailures.length,
      digest: audit.digest,
      eligibilityDigest: audit.eligibility.digest,
    },
  };
}
