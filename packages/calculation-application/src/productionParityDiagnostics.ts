import {
  firstCanonicalAuditDifference,
  productionAuditMatrixRecords,
  type CanonicalAuditDifference,
  type CanonicalAuditRecord,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import type { Tsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';

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

export type ProductionParityGateFailureReason = 'matrixMismatch' | 'parityFailure';

export type ProductionParityGateInput = {
  conditionCount: number;
  attackProfileCount: number;
  outcomeCount: number;
  outcomes: Tsk065ProductionAuditSource['matrix']['outcomes'];
  parityCount: number;
  parityFailures: readonly ProductionParityFailure[];
  digest: string;
  eligibility: { candidates: { digest: string } };
};

export interface ProductionParityGatePassed {
  status: 'passed';
  canonicalIdentity: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: null;
  failures: readonly [];
}

export interface ProductionParityGateFailed {
  status: 'failed';
  reason: ProductionParityGateFailureReason;
  canonicalIdentity: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
  failures: readonly ProductionParityFailure[];
}

export type ProductionParityGate = ProductionParityGatePassed | ProductionParityGateFailed;

export type ProductionFinalOutcomeFailure =
  | {
      reason: 'finalProfileStatusPresent';
      canonicalIdentity: string;
      conditionKey: string;
      profileKey: string;
      status: 'unsupported' | 'invalid' | 'inputRequired';
      expected: 'calculated';
      actual: 'unsupported' | 'invalid' | 'inputRequired';
      firstDifference: CanonicalAuditDifference;
    }
  | {
      reason: 'finalProfileOutcomeIdentityMismatch';
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes';
      firstDifference: CanonicalAuditDifference;
    };

export interface ProductionFinalProfileOutcome {
  conditionKey: string;
  profileKey: string;
  status: 'unsupported' | 'invalid' | 'inputRequired';
}

export type ProductionFinalOutcomeGate =
  | {
      status: 'passed';
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes';
      expected: CanonicalAuditValue;
      actual: CanonicalAuditValue;
      firstDifference: null;
      failures: readonly [];
    }
  | {
      status: 'failed';
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes';
      expected: CanonicalAuditValue;
      actual: CanonicalAuditValue;
      firstDifference: CanonicalAuditDifference;
      failures: readonly ProductionFinalOutcomeFailure[];
    };

export interface ProductionFinalOutcomeGateInput {
  outcomes: {
    unsupported: number;
    invalid: number;
    inputRequired: number;
  };
  failures: readonly ProductionFinalProfileOutcome[];
  inheritedIdentityFailures?: readonly CanonicalAuditDifference[];
}

function canonicalValue(value: unknown): CanonicalAuditValue {
  const serialized = JSON.stringify(value === undefined ? null : value);
  return JSON.parse(serialized) as CanonicalAuditValue;
}

function identityOf(comparison: ProductionParityComparison): string {
  return `production:${comparison.conditionKey}:profile:${comparison.profileKey}:parity:${comparison.path}`;
}

function canonicalParityMatrixValue(
  source: Tsk065ProductionAuditSource,
  audit: ProductionParityGateInput,
): { expected: CanonicalAuditValue; actual: CanonicalAuditValue } {
  const records = productionAuditMatrixRecords(source, audit);
  return {
    expected: records.expected[0]!.value,
    actual: records.actual[0]!.value,
  };
}

/**
 * Compares one complete production matrix with the TSK-06.5 source.
 * The full typed failures remain attached to the result; callers decide how
 * to persist the result before returning a non-zero process outcome.
 */
export function evaluateProductionParityGate(
  source: Tsk065ProductionAuditSource,
  audit: ProductionParityGateInput,
): ProductionParityGate {
  const canonicalIdentity = 'tsk-06.5:production-matrix';
  const { expected, actual } = canonicalParityMatrixValue(source, audit);
  const firstDifference = firstCanonicalAuditDifference(
    [{ identity: canonicalIdentity, value: expected }],
    [{ identity: canonicalIdentity, value: actual }],
  );
  if (!firstDifference)
    return {
      status: 'passed',
      canonicalIdentity,
      expected,
      actual,
      firstDifference: null,
      failures: [],
    };
  return {
    status: 'failed',
    reason:
      audit.parityFailures.length > 0 || firstDifference.path === 'parityFailures'
        ? 'parityFailure'
        : 'matrixMismatch',
    canonicalIdentity,
    expected,
    actual,
    firstDifference,
    failures: audit.parityFailures,
  };
}

/** Checks final profile statuses while leaving the source matrix and its digest untouched. */
export function evaluateProductionFinalOutcomeGate(
  audit: ProductionFinalOutcomeGateInput,
): ProductionFinalOutcomeGate {
  const canonicalIdentity = 'tsk-06.5:final-profile-outcomes' as const;
  const expectedValue = { unsupported: 0, invalid: 0, inputRequired: 0 };
  const actualValue = {
    unsupported: audit.outcomes.unsupported,
    invalid: audit.outcomes.invalid,
    inputRequired: audit.outcomes.inputRequired,
  };
  const expected = canonicalValue(expectedValue);
  const actual = canonicalValue(actualValue);
  const firstDifference = firstCanonicalAuditDifference(
    [{ identity: canonicalIdentity, value: expected }],
    [{ identity: canonicalIdentity, value: actual }],
  );
  const failureCounts = audit.failures.reduce(
    (counts, failure) => ({ ...counts, [failure.status]: counts[failure.status] + 1 }),
    { unsupported: 0, invalid: 0, inputRequired: 0 },
  );
  const failureCountDifference = firstCanonicalAuditDifference(
    [{ identity: canonicalIdentity, value: actualValue }],
    [{ identity: canonicalIdentity, value: failureCounts }],
  );
  const uniqueFailureIdentities = new Set(
    audit.failures.map((failure) => `${failure.conditionKey}\u0000${failure.profileKey}`),
  );
  const duplicateIdentityDifference =
    uniqueFailureIdentities.size === audit.failures.length
      ? null
      : firstCanonicalAuditDifference(
          [
            {
              identity: canonicalIdentity,
              value: { distinctProfileFailures: audit.failures.length },
            },
          ],
          [
            {
              identity: canonicalIdentity,
              value: { distinctProfileFailures: uniqueFailureIdentities.size },
            },
          ],
        );
  const profileFailures: ProductionFinalOutcomeFailure[] = audit.failures.map((failure) => {
    const identity = `production:${failure.conditionKey}:profile:${failure.profileKey}:final-outcome`;
    const actualOutcome = failure.status;
    const statusDifference = firstCanonicalAuditDifference(
      [{ identity, value: { status: 'calculated' } }],
      [{ identity, value: { status: actualOutcome } }],
    );
    if (!statusDifference) throw new TypeError('production_final_outcome_difference_missing');
    return {
      reason: 'finalProfileStatusPresent' as const,
      canonicalIdentity: identity,
      conditionKey: failure.conditionKey,
      profileKey: failure.profileKey,
      status: failure.status,
      expected: 'calculated' as const,
      actual: actualOutcome,
      firstDifference: statusDifference,
    };
  });
  const identityDifferences = [
    ...(failureCountDifference ? [failureCountDifference] : []),
    ...(duplicateIdentityDifference ? [duplicateIdentityDifference] : []),
    ...(audit.inheritedIdentityFailures ?? []),
  ];
  if (identityDifferences.length > 0) {
    const identityFailure: ProductionFinalOutcomeFailure = {
      reason: 'finalProfileOutcomeIdentityMismatch',
      canonicalIdentity,
      firstDifference: identityDifferences[0]!,
    };
    const failures: ProductionFinalOutcomeFailure[] = [identityFailure, ...profileFailures];
    return {
      status: 'failed',
      canonicalIdentity,
      expected,
      actual,
      firstDifference: firstDifference ?? identityDifferences[0]!,
      failures,
    };
  }
  if (!firstDifference)
    return {
      status: 'passed',
      canonicalIdentity,
      expected,
      actual,
      firstDifference: null,
      failures: [],
    };
  return {
    status: 'failed',
    canonicalIdentity,
    expected,
    actual,
    firstDifference,
    failures: profileFailures,
  };
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
