import {
  firstCanonicalAuditDifference,
  productionAuditMatrixRecords,
  type CanonicalAuditDifference,
  type CanonicalAuditRecord,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import type { Tsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import {
  DEFAULT_NP_RESOURCE_SEMANTICS,
  deriveBaseOvercharge,
  isConsistentNpOcUseReceipt,
  type AppliedPreparationAction,
} from '@fgo-lab/battle-execution';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';

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

/** Missing or malformed shard status evidence is distinct from an observed zero-failure shard. */
export function productionFinalOutcomeShardDifference(
  gate: unknown,
  shardIndex: number,
): CanonicalAuditDifference | null {
  const candidate =
    typeof gate === 'object' && gate !== null && !Array.isArray(gate)
      ? (gate as Record<string, unknown>)
      : null;
  const failures = candidate?.['failures'];
  const expectedValue = candidate?.['expected'];
  const actualValue = candidate?.['actual'];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const canonicalIdentity = candidate?.['canonicalIdentity'];
  const valuesDifference =
    isRecord(expectedValue) && isRecord(actualValue) && typeof canonicalIdentity === 'string'
      ? firstCanonicalAuditDifference(
          [{ identity: canonicalIdentity, value: canonicalValue(expectedValue) }],
          [{ identity: canonicalIdentity, value: canonicalValue(actualValue) }],
        )
      : null;
  const knownFailures =
    Array.isArray(failures) &&
    failures.every(
      (failure) =>
        isRecord(failure) &&
        (failure['reason'] === 'finalProfileStatusPresent' ||
          failure['reason'] === 'finalProfileOutcomeIdentityMismatch') &&
        typeof failure['canonicalIdentity'] === 'string' &&
        isRecord(failure['firstDifference']),
    );
  const firstDifference = candidate?.['firstDifference'];
  const firstDifferenceMatches =
    isRecord(firstDifference) &&
    typeof canonicalIdentity === 'string' &&
    (valuesDifference !== null
      ? firstCanonicalAuditDifference(
          [{ identity: canonicalIdentity, value: canonicalValue(firstDifference) }],
          [{ identity: canonicalIdentity, value: canonicalValue(valuesDifference) }],
        ) === null
      : Array.isArray(failures) &&
        failures.some(
          (failure) =>
            isRecord(failure) &&
            isRecord(failure['firstDifference']) &&
            firstCanonicalAuditDifference(
              [{ identity: canonicalIdentity, value: canonicalValue(firstDifference) }],
              [
                {
                  identity: canonicalIdentity,
                  value: canonicalValue(failure['firstDifference']),
                },
              ],
            ) === null,
        ));
  const status = candidate?.['status'];
  const validGateState =
    status === 'passed'
      ? isRecord(expectedValue) &&
        isRecord(actualValue) &&
        valuesDifference === null &&
        firstDifference === null &&
        Array.isArray(failures) &&
        failures.length === 0
      : status === 'failed' &&
        Array.isArray(failures) &&
        failures.length > 0 &&
        knownFailures &&
        firstDifferenceMatches;
  const expected = canonicalValue({
    present: true,
    canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
    hasExpected: true,
    hasActual: true,
    hasFirstDifference: true,
    validGateState: true,
  });
  const actual = canonicalValue({
    present: candidate !== null,
    canonicalIdentity: canonicalIdentity ?? null,
    hasExpected: candidate !== null && Object.hasOwn(candidate, 'expected'),
    hasActual: candidate !== null && Object.hasOwn(candidate, 'actual'),
    validGateState,
    hasFirstDifference: candidate !== null && Object.hasOwn(candidate, 'firstDifference'),
  });
  return firstCanonicalAuditDifference(
    [
      {
        identity: `tsk-08:final-profile-shard:${String(shardIndex)}`,
        value: expected,
      },
    ],
    [
      {
        identity: `tsk-08:final-profile-shard:${String(shardIndex)}`,
        value: actual,
      },
    ],
  );
}

export type ProductionPreparationTransactionFailureReason =
  | 'preparationCommandActionMismatch'
  | 'preparationReceiptMismatch'
  | 'preparationResourceCommitMismatch'
  | 'preparationResourceSequenceMismatch'
  | 'preparationProfileCoverageMismatch'
  | 'preparationShardRatchetMissing'
  | 'preparationAuditIdentityMismatch';

export interface ProductionPreparationTransactionFailure {
  reason: ProductionPreparationTransactionFailureReason;
  canonicalIdentity: string;
  conditionKey?: string;
  profileKey?: string;
  actionIndex?: number;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
}

export interface ProductionPreparationTransactionObservation {
  conditionKey: string;
  profileKey: string;
  commands: readonly PreNoblePhantasmCommand[];
  actions: readonly ProductionPreparationTransactionAction[];
}

export type ProductionPreparationTransactionAction = Pick<
  AppliedPreparationAction,
  'command' | 'sourceKind' | 'baseOvercharge' | 'ocUse' | 'resourceBefore' | 'resourceAfter'
>;

export interface ProductionPreparationTransactionSummary {
  calculatedProfiles: number;
  commandCount: number;
  actionCount: number;
  npUseReceiptCount: number;
}

export type ProductionPreparationTransactionGate =
  | {
      status: 'passed';
      canonicalIdentity: 'tsk-08:preparation-transactions';
      expected: CanonicalAuditValue;
      actual: CanonicalAuditValue;
      summary: ProductionPreparationTransactionSummary;
      firstDifference: null;
      failures: readonly [];
    }
  | {
      status: 'failed';
      canonicalIdentity: 'tsk-08:preparation-transactions';
      expected: CanonicalAuditValue;
      actual: CanonicalAuditValue;
      summary: ProductionPreparationTransactionSummary;
      firstDifference: CanonicalAuditDifference;
      failures: readonly ProductionPreparationTransactionFailure[];
    };

export interface ProductionPreparationTransactionGateInput {
  expectedCalculatedProfiles: number;
  summary: ProductionPreparationTransactionSummary;
  failures: readonly ProductionPreparationTransactionFailure[];
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

function preparationTransactionDifference(
  canonicalIdentity: string,
  expectedValue: unknown,
  actualValue: unknown,
): {
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  difference: CanonicalAuditDifference | null;
} {
  const expected = canonicalValue(expectedValue);
  const actual = canonicalValue(actualValue);
  return {
    expected,
    actual,
    difference: firstCanonicalAuditDifference(
      [{ identity: canonicalIdentity, value: expected }],
      [{ identity: canonicalIdentity, value: actual }],
    ),
  };
}

function preparationFailure(
  reason: ProductionPreparationTransactionFailureReason,
  canonicalIdentity: string,
  expectedValue: unknown,
  actualValue: unknown,
  context: Pick<
    ProductionPreparationTransactionFailure,
    'conditionKey' | 'profileKey' | 'actionIndex'
  > = {},
): ProductionPreparationTransactionFailure | null {
  const { expected, actual, difference } = preparationTransactionDifference(
    canonicalIdentity,
    expectedValue,
    actualValue,
  );
  return difference
    ? { reason, canonicalIdentity, ...context, expected, actual, firstDifference: difference }
    : null;
}

function preparationActionIdentity(
  observation: ProductionPreparationTransactionObservation,
  actionIndex: number,
): string {
  return `production:${observation.conditionKey}:profile:${observation.profileKey}:preparation:action:${String(actionIndex)}`;
}

export function auditProductionPreparationTransactionObservations(
  observations: readonly ProductionPreparationTransactionObservation[],
): {
  summary: ProductionPreparationTransactionSummary;
  failures: readonly ProductionPreparationTransactionFailure[];
} {
  const summary: ProductionPreparationTransactionSummary = {
    calculatedProfiles: observations.length,
    commandCount: 0,
    actionCount: 0,
    npUseReceiptCount: 0,
  };
  const failures: ProductionPreparationTransactionFailure[] = [];
  const observedProfileIdentities = new Set<string>();

  for (const observation of observations) {
    const profileIdentity = `production:${observation.conditionKey}:profile:${observation.profileKey}:preparation`;
    if (observedProfileIdentities.has(profileIdentity)) {
      const duplicateFailure = preparationFailure(
        'preparationProfileCoverageMismatch',
        profileIdentity,
        { distinctCalculatedProfiles: summary.calculatedProfiles },
        { distinctCalculatedProfiles: observedProfileIdentities.size },
        { conditionKey: observation.conditionKey, profileKey: observation.profileKey },
      );
      if (duplicateFailure) failures.push(duplicateFailure);
    }
    observedProfileIdentities.add(profileIdentity);
    summary.commandCount += observation.commands.length;
    summary.actionCount += observation.actions.length;

    if (observation.commands.length !== observation.actions.length) {
      const actionCountFailure = preparationFailure(
        'preparationCommandActionMismatch',
        profileIdentity,
        { actionCount: observation.commands.length },
        { actionCount: observation.actions.length },
        { conditionKey: observation.conditionKey, profileKey: observation.profileKey },
      );
      if (actionCountFailure) failures.push(actionCountFailure);
    }

    for (let actionIndex = 0; actionIndex < observation.actions.length; actionIndex += 1) {
      const action = observation.actions[actionIndex]!;
      const command = observation.commands[actionIndex] ?? null;
      const canonicalIdentity = preparationActionIdentity(observation, actionIndex);
      const actionContext = {
        conditionKey: observation.conditionKey,
        profileKey: observation.profileKey,
        actionIndex,
      };
      const commandFailure = preparationFailure(
        'preparationCommandActionMismatch',
        canonicalIdentity,
        { command, sourceKind: command ? expectedSourceKind(command) : null },
        { command: action.command, sourceKind: action.sourceKind },
        actionContext,
      );
      if (commandFailure) failures.push(commandFailure);

      if (actionIndex > 0) {
        const previousAction = observation.actions[actionIndex - 1]!;
        const sequenceFailure = preparationFailure(
          'preparationResourceSequenceMismatch',
          canonicalIdentity,
          previousAction.resourceAfter,
          action.resourceBefore,
          actionContext,
        );
        if (sequenceFailure) failures.push(sequenceFailure);
      }

      if (!command) continue;
      const consumesNp = command.kind !== 'useSkillSlot';
      const receipt = action.ocUse;
      if (receipt) summary.npUseReceiptCount += 1;
      if (!consumesNp) {
        const unexpectedReceiptFailure = preparationFailure(
          'preparationReceiptMismatch',
          canonicalIdentity,
          { ocUse: null, baseOvercharge: null },
          { ocUse: receipt, baseOvercharge: action.baseOvercharge },
          actionContext,
        );
        if (unexpectedReceiptFailure) failures.push(unexpectedReceiptFailure);
        continue;
      }

      const expectedActionId = `preparation:${String(actionIndex)}:${command.kind}`;
      if (!receipt) {
        const missingReceiptFailure = preparationFailure(
          'preparationReceiptMismatch',
          canonicalIdentity,
          {
            actionId: expectedActionId,
            gaugeBefore: action.resourceBefore.gauge,
            baseOc: deriveBaseOvercharge(
              DEFAULT_NP_RESOURCE_SEMANTICS,
              action.resourceBefore.gauge,
            ),
          },
          { ocUse: null },
          actionContext,
        );
        if (missingReceiptFailure) failures.push(missingReceiptFailure);
      } else {
        const expectedReceipt = {
          actionId: expectedActionId,
          gaugeBefore: action.resourceBefore.gauge,
          baseOc: deriveBaseOvercharge(DEFAULT_NP_RESOURCE_SEMANTICS, action.resourceBefore.gauge),
        };
        const actualReceipt = {
          actionId: receipt.actionId,
          gaugeBefore: receipt.gaugeBefore,
          baseOc: receipt.baseOc,
        };
        const receiptIdentityFailure = preparationFailure(
          'preparationReceiptMismatch',
          canonicalIdentity,
          expectedReceipt,
          actualReceipt,
          actionContext,
        );
        if (receiptIdentityFailure) failures.push(receiptIdentityFailure);

        const receiptContentFailure = preparationFailure(
          'preparationReceiptMismatch',
          canonicalIdentity,
          { consistent: true, actionBaseOvercharge: expectedReceipt.baseOc },
          {
            consistent: isConsistentNpOcUseReceipt(receipt),
            actionBaseOvercharge: action.baseOvercharge,
          },
          actionContext,
        );
        if (receiptContentFailure) failures.push(receiptContentFailure);
      }

      if (action.resourceAfter.gauge !== 0) {
        const resourceCommitFailure = preparationFailure(
          'preparationResourceCommitMismatch',
          canonicalIdentity,
          { resourceAfter: { gauge: 0 } },
          { resourceAfter: { gauge: action.resourceAfter.gauge } },
          actionContext,
        );
        if (resourceCommitFailure) failures.push(resourceCommitFailure);
      }
    }
  }

  return {
    summary,
    failures: failures.sort((left, right) =>
      `${left.canonicalIdentity}:${left.reason}:${left.firstDifference.path}`.localeCompare(
        `${right.canonicalIdentity}:${right.reason}:${right.firstDifference.path}`,
      ),
    ),
  };
}

export function evaluateProductionPreparationTransactionGate(
  input: ProductionPreparationTransactionGateInput,
): ProductionPreparationTransactionGate {
  const canonicalIdentity = 'tsk-08:preparation-transactions' as const;
  const expectedValue = {
    calculatedProfiles: input.expectedCalculatedProfiles,
    commandActionMismatches: 0,
    receiptMismatches: 0,
    resourceCommitMismatches: 0,
    resourceSequenceMismatches: 0,
  };
  const failureCounts = {
    commandActionMismatches: input.failures.filter(
      ({ reason }) => reason === 'preparationCommandActionMismatch',
    ).length,
    receiptMismatches: input.failures.filter(
      ({ reason }) => reason === 'preparationReceiptMismatch',
    ).length,
    resourceCommitMismatches: input.failures.filter(
      ({ reason }) => reason === 'preparationResourceCommitMismatch',
    ).length,
    resourceSequenceMismatches: input.failures.filter(
      ({ reason }) => reason === 'preparationResourceSequenceMismatch',
    ).length,
  };
  const actualValue = {
    calculatedProfiles: input.summary.calculatedProfiles,
    ...failureCounts,
  };
  const countDifference = preparationTransactionDifference(
    canonicalIdentity,
    expectedValue,
    actualValue,
  ).difference;
  const expected = canonicalValue(expectedValue);
  const actual = canonicalValue(actualValue);
  const failures = [...input.failures];
  if (input.summary.calculatedProfiles !== input.expectedCalculatedProfiles) {
    const coverageFailure = preparationFailure(
      'preparationProfileCoverageMismatch',
      canonicalIdentity,
      { calculatedProfiles: input.expectedCalculatedProfiles },
      { calculatedProfiles: input.summary.calculatedProfiles },
    );
    if (coverageFailure) failures.push(coverageFailure);
  }
  for (const difference of input.inheritedIdentityFailures ?? []) {
    failures.push({
      reason: 'preparationAuditIdentityMismatch',
      canonicalIdentity,
      expected: canonicalValue(difference.expected),
      actual: canonicalValue(difference.actual),
      firstDifference: difference,
    });
  }
  if (countDifference && failures.length === 0) {
    failures.push({
      reason: 'preparationAuditIdentityMismatch',
      canonicalIdentity,
      expected,
      actual,
      firstDifference: countDifference,
    });
  }
  failures.sort((left, right) =>
    `${left.canonicalIdentity}:${left.reason}:${left.firstDifference.path}`.localeCompare(
      `${right.canonicalIdentity}:${right.reason}:${right.firstDifference.path}`,
    ),
  );
  if (failures.length === 0 && countDifference === null)
    return {
      status: 'passed',
      canonicalIdentity,
      expected,
      actual,
      summary: input.summary,
      firstDifference: null,
      failures: [],
    };
  const firstDifference = failures[0]?.firstDifference ?? countDifference;
  if (!firstDifference) throw new TypeError('production_preparation_first_difference_missing');
  return {
    status: 'failed',
    canonicalIdentity,
    expected,
    actual,
    summary: input.summary,
    firstDifference,
    failures,
  };
}

function expectedSourceKind(
  command: PreNoblePhantasmCommand,
): AppliedPreparationAction['sourceKind'] {
  switch (command.kind) {
    case 'useSkillSlot':
      return 'skill';
    case 'useTransformNoblePhantasm':
      return 'noblePhantasm';
    case 'executeAttackNoblePhantasm':
      return 'attackNoblePhantasm';
  }
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
