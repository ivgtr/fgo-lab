import {
  inspectProductionAuditValue,
  productionAuditDiagnosticValue,
} from './productionAuditValue';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
  type CanonicalAuditRecord,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  productionClosureRecordDigest,
  type ProductionClosureAudit,
  type ProductionClosureConditionRecord,
} from './productionClosureAudit';
import type {
  RankingAdmissionInventory,
  RankingCandidateEligibilityInventory,
  RankingEligibilityAudit,
  RankingStaticSemanticsInventory,
} from './rankingEligibilityAudit';

export type ProductionRecordFailureReason =
  | 'recordValueInvalid'
  | 'recordArtifactUnavailable'
  | 'recordIdentityMismatch'
  | 'recordShapeInvalid'
  | 'recordProfileDuplicate'
  | 'recordSummaryMismatch'
  | 'recordDigestMismatch'
  | 'canonicalRecordMismatch'
  | 'canonicalAggregateMismatch'
  | 'shardAuditUnknownField'
  | 'shardAuditShapeInvalid'
  | 'shardManifestShapeInvalid'
  | 'shardManifestUnknownField'
  | 'shardGateContractMismatch'
  | 'shardGateBodyMismatch'
  | 'shardExecutionFailed'
  | 'shardAggregateMismatch';

export interface ProductionRecordFailure {
  reason: ProductionRecordFailureReason;
  canonicalIdentity: string;
  firstDifference: CanonicalAuditDifference;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
}

export interface ProductionRecordComparison {
  status: 'passed' | 'failed';
  failures: readonly ProductionRecordFailure[];
  firstDifference: CanonicalAuditDifference | null;
}

export const recordValue = (value: unknown): CanonicalAuditValue =>
  productionAuditDiagnosticValue(value);

export function recordFailure(
  reason: ProductionRecordFailureReason,
  identity: string,
  expected: unknown,
  actual: unknown,
): ProductionRecordFailure | null {
  const expectedInspection = inspectProductionAuditValue(expected);
  const actualInspection = inspectProductionAuditValue(actual);
  if (expectedInspection.status === 'failed' || actualInspection.status === 'failed') {
    const expectedValue = { auditValue: 'accepted' };
    const actualValue = {
      expected:
        expectedInspection.status === 'failed'
          ? { issues: expectedInspection.issues, value: expectedInspection.diagnostic }
          : { status: 'accepted' },
      actual:
        actualInspection.status === 'failed'
          ? { issues: actualInspection.issues, value: actualInspection.diagnostic }
          : { status: 'accepted' },
    };
    return {
      reason: 'recordValueInvalid',
      canonicalIdentity: identity,
      expected: expectedValue,
      actual: actualValue,
      firstDifference: {
        identity,
        path: (expectedInspection.status === 'failed'
          ? expectedInspection
          : (actualInspection as Extract<typeof actualInspection, { status: 'failed' }>)
        ).issues[0]!.path,
        expected: expectedValue,
        actual: actualValue,
      },
    };
  }
  const expectedValue = expectedInspection.value;
  const actualValue = actualInspection.value;
  const firstDifference = firstCanonicalAuditDifference(
    [{ identity, value: expectedValue }],
    [{ identity, value: actualValue }],
  );
  return firstDifference
    ? {
        reason,
        canonicalIdentity: identity,
        firstDifference,
        expected: expectedValue,
        actual: actualValue,
      }
    : null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

type AuditFieldRule = 'count' | 'sha256' | 'array' | 'countMap' | AuditFixedFields;
interface AuditFixedFields {
  readonly [key: string]: AuditFieldRule;
}

// These are the producer's shard structures, not the merged matrix layout.
// Exhaustive keyed records make changes to the owning types require a review here.
const outcomeFields = {
  calculated: 'count',
  unavailableUnderPolicy: 'count',
  inputRequired: 'count',
  invalid: 'count',
  unsupported: 'count',
} satisfies Record<keyof ProductionClosureAudit['outcomes'], AuditFieldRule>;
const staticFields = {
  servants: 'count',
  attackProfiles: 'count',
  sourcePrograms: 'count',
  sourceUses: 'count',
  skillSources: 'count',
  noblePhantasmSources: 'count',
  effects: 'count',
  semanticPrograms: 'count',
  operations: 'count',
  conditions: 'count',
  inputDefinitions: 'count',
  unsupportedPrograms: 'count',
  invalidPrograms: 'count',
  sourceKinds: 'countMap',
  operationKinds: 'countMap',
  digest: 'sha256',
} satisfies Record<keyof RankingStaticSemanticsInventory, AuditFieldRule>;
const admissionFields = {
  observations: 'count',
  dispositions: 'count',
  byPolicy: 'countMap',
  byKind: 'countMap',
  digest: 'sha256',
} satisfies Record<keyof RankingAdmissionInventory, AuditFieldRule>;
const candidateStatusFields = {
  calculated: 'count',
  unreachable: 'count',
  inputRequired: 'count',
  invalid: 'count',
  unsupported: 'count',
} satisfies Record<keyof RankingCandidateEligibilityInventory['byStatus'], AuditFieldRule>;
const candidateFields = {
  observations: 'count',
  candidatePlans: 'count',
  generated: 'count',
  deduplicated: 'count',
  upperBound: 'count',
  maximumSingleProfileUpperBound: 'count',
  maximumSingleProfileGenerated: 'count',
  byStatus: candidateStatusFields,
  byPolicy: 'countMap',
  candidateSpaceStatus: 'countMap',
  digest: 'sha256',
} satisfies Record<keyof RankingCandidateEligibilityInventory, AuditFieldRule>;
const eligibilityFields = {
  conditionCount: 'count',
  staticSemantics: staticFields,
  admissions: admissionFields,
  candidates: candidateFields,
  digest: 'sha256',
} satisfies Record<keyof RankingEligibilityAudit, AuditFieldRule>;
const shardAuditFields = {
  conditionCount: 'count',
  attackProfileCount: 'count',
  outcomeCount: 'count',
  outcomes: outcomeFields,
  parityCount: 'count',
  parityFailures: 'array',
  unavailable: 'array',
  conditionSummaries: 'array',
  eligibility: eligibilityFields,
  digest: 'sha256',
} satisfies Record<keyof ProductionClosureAudit, AuditFieldRule>;

/** Validate every fixed field before the merge can project away an invalid input. */
export function inspectProductionShardAuditShapes(
  audits: readonly unknown[],
): ProductionRecordComparison {
  const failures: ProductionRecordFailure[] = [];
  const countValid = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const atPath = (path: string, present: boolean, value: unknown) => {
    const keys = path.split('.');
    const field = keys.pop()!;
    let result: unknown = present ? { [field]: value } : {};
    for (const key of keys.reverse()) result = { [key]: result };
    return result;
  };
  for (const [index, audit] of audits.entries()) {
    const identity = `tsk-08:shard:${index}`;
    const issue = (path: string, rule: string, value: unknown) => {
      const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const failure = recordFailure(
        'shardAuditShapeInvalid',
        identity,
        atPath(path, true, { type: rule }),
        atPath(path, true, { type: actualType, value: value ?? null }),
      );
      if (failure) failures.push(failure);
    };
    const visit = (value: unknown, rule: AuditFieldRule, path: string): void => {
      if (typeof rule === 'object') {
        if (!isObject(value)) {
          issue(path, 'fixedObject', value);
          return;
        }
        for (const key of Object.keys(value).sort()) {
          if (Object.hasOwn(rule, key)) continue;
          const fieldPath = `${path}.${key}`;
          const failure = recordFailure(
            'shardAuditUnknownField',
            identity,
            atPath(fieldPath, false, undefined),
            atPath(fieldPath, true, value[key]),
          );
          if (failure) failures.push(failure);
        }
        for (const [key, childRule] of Object.entries(rule))
          visit(value[key], childRule, `${path}.${key}`);
        return;
      }
      if (rule === 'countMap') {
        if (!isObject(value)) {
          issue(path, 'countMap', value);
          return;
        }
        for (const [key, count] of Object.entries(value))
          if (!countValid(count)) issue(`${path}.${key}`, 'nonnegativeInteger', count);
        return;
      }
      const valid =
        rule === 'count'
          ? countValid(value)
          : rule === 'sha256'
            ? typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
            : Array.isArray(value);
      if (!valid) issue(path, rule === 'count' ? 'nonnegativeInteger' : rule, value);
    };
    visit(audit, shardAuditFields, 'audit');
  }
  return {
    status: failures.length ? 'failed' : 'passed',
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}

// These are derived checksums, not semantic fields. Compare them after the
// complete semantic aggregate so a checksum cannot obscure its field difference.
const matrixDigestPaths = new Set([
  'eligibility.digest',
  'eligibility.staticSemantics.digest',
  'eligibility.admissions.digest',
  'eligibility.admissions.shardDigests',
  'eligibility.candidates.digest',
  'eligibility.candidates.shardDigests',
]);

function matrixComparisonValue(
  value: CanonicalAuditValue,
  semantic: boolean,
  path = '',
): CanonicalAuditValue {
  if (Array.isArray(value)) {
    const items: readonly CanonicalAuditValue[] = value;
    return items.map((item, index) => matrixComparisonValue(item, semantic, `${path}.${index}`));
  }
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        const itemPath = path ? `${path}.${key}` : key;
        if (
          itemPath === 'digest' ||
          /^conditionSummaries\.\d+\.elapsedMs$/.test(itemPath) ||
          (semantic &&
            (matrixDigestPaths.has(itemPath) || /^conditionSummaries\.\d+\.digest$/.test(itemPath)))
        )
          return [];
        return [[key, matrixComparisonValue(item, semantic, itemPath)]];
      }),
    );
  return value;
}

/** Compare the actual merge, including all aggregate fields, with its verified authority. */
export function compareProductionMatrixAggregates(
  expected: unknown,
  actual: unknown,
): ProductionRecordFailure[] {
  const validity = recordFailure(
    'canonicalAggregateMismatch',
    'tsk-06.5:production-matrix',
    expected,
    actual,
  );
  if (validity?.reason === 'recordValueInvalid') return [validity];
  const expectedValue = recordValue(expected);
  const actualValue = recordValue(actual);
  for (const semantic of [true, false]) {
    const failure = recordFailure(
      'canonicalAggregateMismatch',
      'tsk-06.5:production-matrix',
      matrixComparisonValue(expectedValue, semantic),
      matrixComparisonValue(actualValue, semantic),
    );
    if (failure)
      return [
        {
          ...failure,
          // Complete aggregates remain in the actual manifest and its pinned
          // expected manifest; retain the diagnostic without duplicating them.
          expected: {
            path: failure.firstDifference.path,
            value: failure.firstDifference.expected ?? null,
          },
          actual: {
            path: failure.firstDifference.path,
            value: failure.firstDifference.actual ?? null,
          },
        },
      ];
  }
  return [];
}

export function inspectProductionConditionRecord(input: {
  value: unknown;
  conditionKey: string;
  identity: unknown;
  summary: Omit<ProductionClosureConditionRecord, 'records'>;
  profileCount: number;
}):
  | { status: 'accepted'; records: CanonicalAuditRecord[]; failures: ProductionRecordFailure[] }
  | { status: 'failed'; records: []; failures: ProductionRecordFailure[] } {
  const { value, conditionKey, summary } = input;
  const identity = `production:${conditionKey}`;
  const failures: ProductionRecordFailure[] = [];
  const add = (reason: ProductionRecordFailureReason, expected: unknown, actual: unknown) => {
    const failure = recordFailure(reason, identity, expected, actual);
    if (failure) failures.push(failure);
  };
  const validity = recordFailure(
    'recordShapeInvalid',
    identity,
    { value: input.identity, summary },
    value,
  );
  if (validity?.reason === 'recordValueInvalid')
    return { status: 'failed', records: [], failures: [validity] };
  if (!isObject(value) || !isObject(value['summary']) || !Array.isArray(value['records'])) {
    add('recordShapeInvalid', { shape: 'identity/summary/records' }, { shape: 'invalid', value });
    return { status: 'failed', records: [], failures };
  }
  add('recordShapeInvalid', ['identity', 'records', 'summary'], Object.keys(value).sort());
  add('recordIdentityMismatch', input.identity, value['identity'] ?? null);
  add('recordSummaryMismatch', summary, value['summary']);
  if (!Number.isFinite(summary.elapsedMs) || summary.elapsedMs < 0)
    add(
      'recordShapeInvalid',
      { elapsedMsValid: true },
      { elapsedMsValid: false, value: summary.elapsedMs },
    );
  const body = value['records'] as unknown[];
  add('recordSummaryMismatch', { profileCount: input.profileCount }, { profileCount: body.length });
  const outcomes = {
    calculated: 0,
    unavailableUnderPolicy: 0,
    inputRequired: 0,
    invalid: 0,
    unsupported: 0,
  };
  const records: CanonicalAuditRecord[] = [];
  const seen = new Set<string>();
  for (const [index, item] of body.entries()) {
    if (
      !isObject(item) ||
      typeof item['profileKey'] !== 'string' ||
      !item['profileKey'] ||
      typeof item['status'] !== 'string' ||
      !Object.hasOwn(outcomes, item['status'])
    ) {
      add(
        'recordShapeInvalid',
        { index, validProfileAndStatus: true },
        { index, validProfileAndStatus: false, value: item },
      );
      continue;
    }
    const profileKey = item['profileKey'];
    if (seen.has(profileKey)) {
      const failure = recordFailure(
        'recordProfileDuplicate',
        `${identity}:profile:${profileKey}`,
        { occurrences: 1 },
        { occurrences: 2 },
      );
      if (failure) failures.push(failure);
      continue;
    }
    seen.add(profileKey);
    outcomes[item['status'] as keyof typeof outcomes] += 1;
    records.push({ identity: `${identity}:profile:${profileKey}`, value: recordValue(item) });
  }
  add(
    'recordSummaryMismatch',
    Object.fromEntries(
      Object.keys(outcomes).map((key) => [key, summary[key as keyof typeof outcomes]]),
    ),
    outcomes,
  );
  add(
    'recordDigestMismatch',
    { digest: summary.digest },
    { digest: productionClosureRecordDigest(body) },
  );
  return failures.some((failure) => failure.reason !== 'recordDigestMismatch')
    ? { status: 'failed', records: [], failures }
    : { status: 'accepted', records, failures };
}

export function compareProductionConditionRecords(
  expected: readonly CanonicalAuditRecord[],
  actual: readonly CanonicalAuditRecord[],
): ProductionRecordFailure[] {
  const invalid = recordFailure(
    'canonicalRecordMismatch',
    'production:record-comparison',
    expected,
    actual,
  );
  if (invalid?.reason === 'recordValueInvalid') return [invalid];
  const expectedMap = new Map(expected.map((record) => [record.identity, record.value]));
  const actualMap = new Map(actual.map((record) => [record.identity, record.value]));
  const failures: ProductionRecordFailure[] = [];
  for (const identity of [...new Set([...expectedMap.keys(), ...actualMap.keys()])].sort()) {
    const expectedValue = expectedMap.get(identity);
    const actualValue = actualMap.get(identity);
    const missing = expectedValue === undefined || actualValue === undefined;
    const firstDifference = firstCanonicalAuditDifference(
      [{ identity, value: missing ? { present: expectedValue !== undefined } : expectedValue }],
      [{ identity, value: missing ? { present: actualValue !== undefined } : actualValue }],
    );
    // Complete bodies remain in the receipted condition artifacts. Retain every
    // field difference here without duplicating both matrices in the manifest.
    if (firstDifference)
      failures.push({
        reason: 'canonicalRecordMismatch',
        canonicalIdentity: identity,
        firstDifference,
        expected: { path: firstDifference.path, value: firstDifference.expected ?? null },
        actual: { path: firstDifference.path, value: firstDifference.actual ?? null },
      });
  }
  return failures;
}

export function inspectProductionAuditAggregate(
  audit: ProductionClosureAudit,
  identity: string,
): ProductionRecordFailure[] {
  const outcomes = {
    calculated: 0,
    unavailableUnderPolicy: 0,
    inputRequired: 0,
    invalid: 0,
    unsupported: 0,
  };
  for (const summary of audit.conditionSummaries)
    for (const key of Object.keys(outcomes) as (keyof typeof outcomes)[])
      outcomes[key] += summary[key];
  const expected = {
    conditionCount: audit.conditionSummaries.length,
    outcomeCount: Object.values(outcomes).reduce((sum, count) => sum + count, 0),
    outcomes,
    parityCount: audit.conditionSummaries.reduce((sum, summary) => sum + summary.parityCount, 0),
    parityFailures: audit.conditionSummaries.flatMap((summary) => summary.parityFailures),
  };
  const actual = {
    conditionCount: audit.conditionCount,
    outcomeCount: audit.outcomeCount,
    outcomes: audit.outcomes,
    parityCount: audit.parityCount,
    parityFailures: audit.parityFailures,
  };
  const failure = recordFailure('shardAggregateMismatch', identity, expected, actual);
  return failure ? [failure] : [];
}
