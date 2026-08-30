import { describe, expect, it } from 'vitest';
import {
  canonicalAuditDigest,
  firstCanonicalAuditDifference,
  formatCanonicalAuditMismatch,
  measureProductionAuditLifecycle,
  type CanonicalAuditRecord,
} from './productionAudit';

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
});
