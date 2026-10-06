import { describe, expect, it } from 'vitest';
import {
  canonicalAuditDigest,
  connectProductionAuditBoundary,
  connectProductionAuditMatrix,
  createTsk065ProductionAuditSource,
  firstCanonicalAuditDifference,
  formatCanonicalAuditMismatch,
  measureProductionAuditLifecycle,
  type CanonicalAuditRecord,
} from './productionAudit';
import tsk065Evidence from '../../../docs/evidence/tsk-06-5-production-closure.json';

const baseline: CanonicalAuditRecord[] = [
  { identity: 'actor:1', value: { rows: [10, 20], status: 'calculated' } },
  { identity: 'actor:2', value: { rows: [30], status: 'calculated' } },
];

describe('canonical production audit records', () => {
  it('keeps digest order independent and object-key stable', () => {
    expect(canonicalAuditDigest([...baseline].reverse())).toBe(canonicalAuditDigest(baseline));
    expect(
      canonicalAuditDigest([
        { identity: 'actor:1', value: { status: 'calculated', rows: [10, 20] } },
        baseline[1]!,
      ]),
    ).toBe(canonicalAuditDigest(baseline));
  });

  it('reports the first canonical identity and field difference', () => {
    const changed: CanonicalAuditRecord[] = [
      baseline[0]!,
      { identity: 'actor:2', value: { rows: [31], status: 'calculated' } },
    ];
    expect(firstCanonicalAuditDifference(baseline, changed)).toEqual({
      identity: 'actor:2',
      path: 'rows[0]',
      expected: 30,
      actual: 31,
    });
    expect(formatCanonicalAuditMismatch(baseline, changed)).toContain(
      'first_difference:actor:2:rows[0]',
    );
  });

  it('compares own fields without treating prototype properties as saved canonical values', () => {
    for (const key of ['__proto__', 'constructor', 'toString']) {
      const expected = [{ identity: 'artifact:1', value: {} }];
      const actual = [{ identity: 'artifact:1', value: Object.fromEntries([[key, {}]]) }];
      expect(firstCanonicalAuditDifference(expected, actual)).toEqual({
        identity: 'artifact:1',
        path: key,
        expected: undefined,
        actual: {},
      });
      expect(firstCanonicalAuditDifference(actual, expected)).toEqual({
        identity: 'artifact:1',
        path: key,
        expected: {},
        actual: undefined,
      });
      expect(firstCanonicalAuditDifference(actual, actual)).toBeNull();
    }
  });

  it('retains the first difference and observes changes across calls with shared graphs', () => {
    const left = { value: 20 };
    const right = { value: 20 };
    const expected = [{ identity: 'shared', value: { first: [left, left], second: left } }];
    const actual = [{ identity: 'shared', value: { first: [right, right], second: right } }];
    expect(firstCanonicalAuditDifference(expected, actual)).toBeNull();
    right.value = 30;
    expect(firstCanonicalAuditDifference(expected, actual)).toEqual({
      identity: 'shared',
      path: 'first[0].value',
      expected: 20,
      actual: 30,
    });
    right.value = 20;
    expect(firstCanonicalAuditDifference(expected, actual)).toBeNull();
    const other = [{ identity: 'shared', value: { first: [right, { value: 40 }], second: right } }];
    expect(firstCanonicalAuditDifference(expected, other)).toEqual({
      identity: 'shared',
      path: 'first[1].value',
      expected: 20,
      actual: 40,
    });
  });

  it('fails closed before digesting or diffing duplicate identities', () => {
    const duplicates: CanonicalAuditRecord[] = [
      { identity: 'actor:1', value: 1 },
      { identity: 'actor:1', value: 2 },
    ];
    expect(() => canonicalAuditDigest(duplicates)).toThrow(
      'duplicate_canonical_audit_identity:records:actor:1',
    );
    expect(() => firstCanonicalAuditDifference(duplicates, [duplicates[1]!])).toThrow(
      'duplicate_canonical_audit_identity:expected:actor:1',
    );
    expect(() => formatCanonicalAuditMismatch(duplicates, [duplicates[1]!])).toThrow(
      'duplicate_canonical_audit_identity:records:actor:1',
    );
  });

  it('measures one actual read, parse, and compile invocation', async () => {
    const invocations: string[] = [];
    const measured = await measureProductionAuditLifecycle({
      read: () => {
        invocations.push('read');
        return Promise.resolve('{"value":2}');
      },
      parse: (serialized) => {
        invocations.push('parse');
        return JSON.parse(serialized) as { value: number };
      },
      compile: ({ value }) => {
        invocations.push('compile');
        return value * 3;
      },
    });
    expect(invocations).toEqual(['read', 'parse', 'compile']);
    expect(measured.audit).toBe(6);
    expect(measured.runtimeCounters).toEqual({
      masterReadCount: 1,
      masterParseCount: 1,
      compileCount: 1,
    });
  });

  it('connects boundary audits to the approved TSK-06.5 source without deriving a digest', () => {
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: 'fixture-master',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    const connected = connectProductionAuditBoundary(
      source,
      {
        boundary: 'data-pipeline',
        masterDataVersion: 'fixture-master',
        records: baseline,
        digest: canonicalAuditDigest(baseline),
        inventory: { count: 2 },
        failures: [],
        counters: { masterReadCount: 1 },
      },
      'fixture-data-pipeline-audit',
    );
    expect(connected.source).toMatchObject({
      task: 'TSK-06.5',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
      masterDataVersion: 'fixture-master',
      matrix: { conditionCount: 80, outcomeCount: 34_640, parityCount: 34_600 },
    });
    expect(connected.payload).toEqual({
      boundary: 'data-pipeline',
      producer: 'fixture-data-pipeline-audit',
      masterDataVersion: 'fixture-master',
      recordCount: baseline.length,
      digest: canonicalAuditDigest(baseline),
      inventory: { count: 2 },
      failures: [],
      counters: { masterReadCount: 1 },
    });
  });

  it('keeps the complete matrix fail-closed when the TSK-06.5 source differs', () => {
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: 'fixture-master',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    expect(() =>
      connectProductionAuditMatrix(source, {
        conditionCount: 79,
        attackProfileCount: 433,
        outcomeCount: 34_640,
        outcomes: source.matrix.outcomes,
        parityCount: 34_600,
        parityFailures: [],
        digest: source.matrix.mergedDigest,
        eligibility: { candidates: { digest: source.matrix.eligibilityDigest } },
      }),
    ).toThrow('shared_production_audit_matrix_mismatch:tsk-06.5:production-matrix:conditionCount');
    expect(
      connectProductionAuditMatrix(source, {
        conditionCount: 80,
        attackProfileCount: 433,
        outcomeCount: 34_640,
        outcomes: source.matrix.outcomes,
        parityCount: 34_600,
        parityFailures: [],
        digest: source.matrix.mergedDigest,
        eligibility: { candidates: { digest: source.matrix.eligibilityDigest } },
      }).payload,
    ).toMatchObject({
      producer: 'auditProductionClosure',
      masterDataVersion: 'fixture-master',
      conditionCount: 80,
      digest: source.matrix.mergedDigest,
      eligibilityDigest: source.matrix.eligibilityDigest,
    });
  });
});
