import { describe, expect, it } from 'vitest';
import {
  canonicalAuditDigest,
  firstCanonicalAuditDifference,
  formatCanonicalAuditMismatch,
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
});
