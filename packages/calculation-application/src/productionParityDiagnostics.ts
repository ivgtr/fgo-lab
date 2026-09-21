import {
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
  type CanonicalAuditRecord,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';

export type ProductionParityPath = 'calculator' | 'portable';

export type ProductionParityFailureReason = 'executionNotExecutable' | 'canonicalMismatch';

export interface ProductionParityComparison {
  conditionKey: string;
  profileKey: string;
  path: ProductionParityPath;
  actualStatus: string;
  expected: unknown;
  actual: unknown;
}

export interface ProductionParityFailure {
  conditionKey: string;
  profileKey: string;
  path: ProductionParityPath;
  reason: ProductionParityFailureReason;
  canonicalIdentity: string;
  mismatch: string;
  firstDifference: CanonicalAuditDifference;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
}

function canonicalValue(value: unknown): CanonicalAuditValue {
  const serialized = JSON.stringify(value === undefined ? null : value);
  return JSON.parse(serialized) as CanonicalAuditValue;
}

function identityOf(comparison: ProductionParityComparison): string {
  return `production:${comparison.conditionKey}:profile:${comparison.profileKey}:parity:${comparison.path}`;
}

export function compareProductionParity(
  comparison: ProductionParityComparison,
): ProductionParityFailure | null {
  const canonicalIdentity = identityOf(comparison);
  const executionIsExecutable = comparison.actualStatus === 'executable';
  const expected = executionIsExecutable
    ? canonicalValue(comparison.expected)
    : canonicalValue({ status: 'executable' });
  const actual = executionIsExecutable
    ? canonicalValue(comparison.actual)
    : canonicalValue({ status: comparison.actualStatus });
  const expectedRecords: CanonicalAuditRecord[] = [
    { identity: canonicalIdentity, value: expected },
  ];
  const actualRecords: CanonicalAuditRecord[] = [{ identity: canonicalIdentity, value: actual }];
  const firstDifference = firstCanonicalAuditDifference(expectedRecords, actualRecords);
  if (!firstDifference) return null;
  const reason: ProductionParityFailureReason = executionIsExecutable
    ? 'canonicalMismatch'
    : 'executionNotExecutable';
  return {
    conditionKey: comparison.conditionKey,
    profileKey: comparison.profileKey,
    path: comparison.path,
    reason,
    canonicalIdentity,
    mismatch: firstDifference.path || '<record>',
    firstDifference,
    expected,
    actual,
  };
}
