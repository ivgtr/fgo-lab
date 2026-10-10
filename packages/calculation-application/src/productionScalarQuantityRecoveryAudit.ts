import type { BattleOperation } from '@fgo-lab/battle-execution';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import {
  scalarQuantityProgram,
  scalarQuantitySource,
  scalarQuantitySnapshot,
  auditScalarQuantityContract,
  type ScalarQuantityProgram,
  type ScalarQuantitySource,
  type ScalarQuantityRecoveryContract,
  type ScalarQuantityFailure,
} from './productionScalarQuantityAudit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';

/** The base program supplies identity/reference receipts; its forward gate is never used here. */
export interface ScalarQuantityRecoveryProgram {
  canonicalIdentity: string;
  scalar: ScalarQuantityProgram;
  recovery: ScalarQuantityRecoveryContract;
}
export interface ScalarQuantityRecoverySource {
  program: ScalarQuantityRecoveryProgram;
  scalar: ScalarQuantitySource;
}
export function scalarQuantityRecoveryProgram(
  prepared: PreparedCalculationScenario,
  calculation: Extract<CalculationExecution, { status: 'executable' }>,
  failedOperation: BattleOperation,
): ScalarQuantityRecoveryProgram | null {
  const scalar = scalarQuantityProgram(prepared, calculation);
  if (!scalar || !scalar.operations.includes(failedOperation)) return null;
  if (
    failedOperation.kind !== 'resourceMutation' ||
    failedOperation.resolution !== 'resourceStateUnavailable'
  )
    return null;
  const failedGroupIndex = scalar.groups.findIndex((group) =>
    group.operationIds.includes(failedOperation.operationId),
  );
  const issue = {
    kind: 'unsupportedOperation' as const,
    operationId: failedOperation.operationId,
    detail: `${failedOperation.resolution}:${failedOperation.resource}`,
  };
  const contract = { failedGroupIndex, failedOperation, issue };
  return {
    canonicalIdentity: `production-audit:scalar-quantity-recovery:${JSON.stringify(scalar.groups[failedGroupIndex]!.transactionIdentity)}`,
    scalar,
    recovery: { ...contract, snapshot: scalarQuantitySnapshot(contract) },
  };
}
export function scalarQuantityRecoverySource(
  program: ScalarQuantityRecoveryProgram,
): ScalarQuantityRecoverySource {
  return { program, scalar: scalarQuantitySource(program.scalar) };
}
export interface ScalarQuantityRecoveryGate {
  canonicalIdentity: 'production-audit:scalar-quantity-recovery';
  status: 'passed' | 'failed';
  expected: readonly string[];
  actual: readonly (string | null)[];
  failures: readonly ScalarQuantityFailure[];
  firstDifference: ScalarQuantityFailure['firstDifference'] | null;
  consumptions: number;
}
function sourceIdentity(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('program' in value)) return null;
  const program = value.program;
  return typeof program === 'object' &&
    program !== null &&
    'canonicalIdentity' in program &&
    typeof program.canonicalIdentity === 'string'
    ? program.canonicalIdentity
    : null;
}
/** Diagnostic success certifies an unsupported execution, never a calculated product result. */
export function auditScalarQuantityRecoveryObservations(input: {
  expected: readonly ScalarQuantityRecoveryProgram[];
  observations: readonly ScalarQuantityRecoverySource[];
}): ScalarQuantityRecoveryGate {
  const expected = input.expected.map((program) => program.canonicalIdentity);
  const actual = input.observations.map(sourceIdentity);
  const failures: ScalarQuantityFailure[] = [];
  const check = (identity: string, path: string, wanted: unknown, observed: unknown) => {
    const expectedValue = scalarQuantitySnapshot(wanted);
    const actualValue = scalarQuantitySnapshot(observed);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: expectedValue }],
      [{ identity, value: actualValue }],
    );
    if (!difference) return;
    failures.push({
      reason: 'scalarPopulationMismatch',
      canonicalIdentity: identity,
      checkPath: path,
      expected: expectedValue,
      actual: actualValue,
      firstDifference: {
        ...difference,
        path: difference.path ? `${path}.${difference.path}` : path,
      },
    });
  };
  check('production-audit:scalar-quantity-recovery', 'population', expected, actual);
  check(
    'production-audit:scalar-quantity-recovery',
    'population.unique',
    { nonempty: true, unique: true },
    { nonempty: expected.length > 0, unique: new Set(expected).size === expected.length },
  );
  let consumptions = 0;
  for (const program of input.expected) {
    const sources = input.observations.filter(
      (source) => sourceIdentity(source) === program.canonicalIdentity,
    );
    check(program.canonicalIdentity, 'source.count', 1, sources.length);
    if (!sources[0]) continue;
    check(
      program.canonicalIdentity,
      'source.programReference',
      true,
      sources[0].program === program,
    );
    const gate = auditScalarQuantityContract(
      { expected: [program.scalar], observations: [sources[0].scalar] },
      program.recovery,
    );
    failures.push(
      ...gate.failures.map((failure) => ({
        ...failure,
        canonicalIdentity: program.canonicalIdentity,
        firstDifference: { ...failure.firstDifference, identity: program.canonicalIdentity },
      })),
    );
    consumptions += gate.consumptions;
  }
  return {
    canonicalIdentity: 'production-audit:scalar-quantity-recovery',
    status: failures.length ? 'failed' : 'passed',
    expected,
    actual,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
    consumptions,
  };
}
