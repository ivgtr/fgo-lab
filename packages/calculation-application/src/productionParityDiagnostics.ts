import {
  rankingUserControlChecks,
  type RankingUserControlSource,
} from './productionUserControlObservation';
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
  type EffectiveContribution,
  type OrderedExecutionAuditEvent,
} from '@fgo-lab/battle-execution';
import type { EffectProjection } from '@fgo-lab/battle-execution';
import type {
  CalculationScenario,
  DamageResolutionInput,
  PreNoblePhantasmCommand,
} from '@fgo-lab/schema';
import type {
  AttackProfileContinuity,
  CalculationApplicationResult,
  CalculationExecutionObservation,
} from './scenario';

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
  | 'command'
  | 'sourceKind'
  | 'baseOvercharge'
  | 'ocUse'
  | 'ocOutcomes'
  | 'resourceBefore'
  | 'resourceAfter'
  | 'resourceTransaction'
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

export type ProductionUserControlPath = 'selectedProfile' | 'withoutAreaAlternate';

export interface ProductionUserControlIdentity {
  ownerId: string;
  profileKey: string;
  path: ProductionUserControlPath;
  projectionKey: string;
  operationId: string;
  contributionId: EffectProjection['contributionId'];
  modifier: EffectProjection['modifier'];
  contributionControl: 'operation' | 'worldAssumption';
}

export interface ProductionUserControlOperationEvent extends Pick<
  OrderedExecutionAuditEvent,
  | 'operationId'
  | 'contributionId'
  | 'operationOutcome'
  | 'projectionOutcome'
  | 'projectionValuePermille'
> {
  projectionKey: OrderedExecutionAuditEvent['projectionKey'];
  kind: OrderedExecutionAuditEvent['operationKind'];
}

export interface ProductionUserControlProjectionObservation {
  projectionKey: string;
  operationId: string;
  contributionId: string | null;
  outcome: EffectProjection['outcome'];
  valuePermille: EffectProjection['valuePermille'];
}

export type ProductionUserControlEffectiveContribution = Pick<
  EffectiveContribution,
  'operationId' | 'contributionId' | 'modifier' | 'resolvedValue' | 'executionOutcome' | 'effective'
>;

export type ProductionUserControlInputBinding =
  | {
      kind: 'bound';
      address:
        | 'attackBuff'
        | 'defenseBuff'
        | 'cardBuff'
        | 'cardResistance'
        | 'npDamageBuff'
        | 'npResistance'
        | 'eventDamageBuff'
        | 'specialDamageBuff'
        | 'powerMod'
        | 'flatDamage';
      value: number;
    }
  | { kind: 'bound'; address: 'ignoreDamageCut'; value: boolean }
  | {
      kind: 'bound';
      address: 'damageFunction.ignoreDefense';
      value: boolean | DamageResolutionInput['damageFunction'];
    }
  | {
      kind: 'bound';
      address: 'npSpecialMultipliers';
      value: DamageResolutionInput['npSpecialMultipliers'];
    }
  | {
      kind: 'bound';
      address: 'npVariantSelection.damageInput';
      value: {
        variant: unknown;
        cardType: DamageResolutionInput['cardType'];
        npMultipliers: DamageResolutionInput['npMultipliers'];
        damageFunction: DamageResolutionInput['damageFunction'];
      };
    }
  | { kind: 'unbound'; reason: 'projection_has_no_damage_input_binding' };

export interface ProductionUserControlSideObservation {
  executionObservation: CalculationExecutionObservation;
  operationEvents: readonly ProductionUserControlOperationEvent[];
  projections: readonly ProductionUserControlProjectionObservation[];
  inputBinding: ProductionUserControlInputBinding;
  damageInputDefenseBuff?: number;
  effectiveContributions: readonly ProductionUserControlEffectiveContribution[];
  damageResult: {
    status: CalculationApplicationResult['status'];
    rows: unknown;
    reason?: Extract<CalculationApplicationResult, { status: 'unavailable' }>['reason'];
  };
  profileContinuity?: AttackProfileContinuity;
}

export interface ProductionUserControlObservation {
  identity: ProductionUserControlIdentity;
  rankingSource?: RankingUserControlSource;
  enabled: ProductionUserControlSideObservation;
  excluded: ProductionUserControlSideObservation;
  preparationSelection?: {
    kind: 'default' | 'reachableAlternate';
    plan: readonly PreNoblePhantasmCommand[];
  };
  hpWitness?: {
    initialPermille: number;
    livePermille: number;
    currentHp: number;
    maximumHp: number;
    evaluatedCandidates: number;
  };
  battlePointWitness?: {
    domainId: string;
    initialPoint: number;
    preparedPoint: number;
    preparedPhase: number;
    initialPhase: number;
    generatedCandidates: number;
    evaluatedCandidates: number;
    enemyDefenseBuff: number;
    enabledScenario: Extract<CalculationScenario, { mode: 'resolved' }>;
    excludedScenario: Extract<CalculationScenario, { mode: 'resolved' }>;
  };
  conflictCounterexample?: {
    plan: readonly PreNoblePhantasmCommand[];
    profileKey: string | null;
    issues: readonly string[];
    enabled: ProductionUserControlSideObservation;
    excluded: ProductionUserControlSideObservation;
  };
}

export type ProductionUserControlFailureReason =
  | 'userControlRankingSourceMismatch'
  | 'userControlInventoryCoverageMismatch'
  | 'userControlDuplicateIdentity'
  | 'userControlProjectionIdentityMismatch'
  | 'userControlOperationEventMissing'
  | 'userControlEffectiveContributionMissing'
  | 'userControlInputBindingUnsupported'
  | 'userControlExecutionObservationMissing'
  | 'userControlExecutionSelectionNotUnique'
  | 'userControlObservationInconsistent'
  | 'userControlDamageOutcomeNotCalculated'
  | 'userControlSelectedProfileProofMissing'
  | 'userControlConflictCounterexampleInvalid'
  | 'userControlNpSpecialInputNotChanged'
  | 'userControlDidNotReachOperationOrDamage'
  | 'userControlBattlePointReadProofMissing';

export interface ProductionUserControlFailure {
  reason: ProductionUserControlFailureReason;
  canonicalIdentity: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
}

export interface ProductionUserControlSummary {
  projectionCount: number;
  selectedProfileCount: number;
  withoutAreaAlternateCount: number;
  operationEventCount: number;
  effectiveContributionCount: number;
  directInputDifferenceCount: number;
  operationOutcomeDifferenceCount: number;
  eventProjectionOutcomeDifferenceCount: number;
  damageResultDifferenceCount: number;
}

export type ProductionUserControlGate =
  | {
      status: 'passed';
      canonicalIdentity: 'tsk-08:inert-controls';
      expected: CanonicalAuditValue;
      actual: CanonicalAuditValue;
      summary: ProductionUserControlSummary;
      firstDifference: null;
      failures: readonly [];
    }
  | {
      status: 'failed';
      canonicalIdentity: 'tsk-08:inert-controls';
      expected: CanonicalAuditValue;
      actual: CanonicalAuditValue;
      summary: ProductionUserControlSummary;
      firstDifference: CanonicalAuditDifference;
      failures: readonly ProductionUserControlFailure[];
    };

export interface ProductionUserControlGateInput {
  expectedProjectionCount: number;
  expectedIdentities: readonly ProductionUserControlIdentity[];
  expectedBattlePointReads?: readonly {
    ownerId: string;
    projectionKey: string;
    operationId: string;
    leaves: readonly {
      subjectId: string;
      comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
      value: number;
    }[];
  }[];
  observations: readonly ProductionUserControlObservation[];
}

function canonicalValue(value: unknown): CanonicalAuditValue {
  const serialized = JSON.stringify(value === undefined ? null : value);
  return JSON.parse(serialized) as CanonicalAuditValue;
}

function productionUserControlIdentity(identity: ProductionUserControlIdentity): string {
  return `production:control-inventory:${JSON.stringify([
    identity.ownerId,
    identity.profileKey,
    identity.path,
    identity.projectionKey,
    identity.operationId,
    identity.contributionId,
  ])}`;
}

// The shared canonical diff distinguishes absent object keys. Encode an explicitly
// present undefined value so it cannot become indistinguishable from null.
function userControlAuditValue(value: unknown, seen = new Set<object>()): CanonicalAuditValue {
  if (value === undefined) return { kind: 'presentUndefined' };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('production_user_control_nonfinite_value');
    return value;
  }
  if (typeof value !== 'object' || seen.has(value))
    throw new TypeError('production_user_control_unsupported_audit_value');
  seen.add(value);
  const result: CanonicalAuditValue = Array.isArray(value)
    ? value.map((item) => userControlAuditValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
      ? Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, userControlAuditValue(item, seen)]),
        )
      : (() => {
          throw new TypeError('production_user_control_unsupported_audit_value');
        })();
  seen.delete(value);
  return result;
}

function productionUserControlFailure(
  reason: ProductionUserControlFailureReason,
  canonicalIdentity: string,
  expectedValue: unknown,
  actualValue: unknown,
): ProductionUserControlFailure | null {
  const expected = userControlAuditValue(expectedValue);
  const actual = userControlAuditValue(actualValue);
  const firstDifference = firstCanonicalAuditDifference(
    [{ identity: canonicalIdentity, value: expected }],
    [{ identity: canonicalIdentity, value: actual }],
  );
  return firstDifference ? { reason, canonicalIdentity, expected, actual, firstDifference } : null;
}

function isUserControlRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTargetCandidateIdentity(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['classId'] === 'string' &&
    typeof candidate['attribute'] === 'string' &&
    Array.isArray(candidate['families']) &&
    Array.isArray(candidate['facts'])
  );
}

function hasExecutionObservation(value: unknown): value is CalculationExecutionObservation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const observation = value as Record<string, unknown>;
  const witness = observation['battlePointWitness'];
  const witnessValid =
    witness === null ||
    (typeof witness === 'object' &&
      !Array.isArray(witness) &&
      Object.values(witness).every((point) => typeof point === 'number' && Number.isFinite(point)));
  const targetExecution = observation['targetExecution'];
  if (!witnessValid || typeof targetExecution !== 'object' || targetExecution === null)
    return false;
  const target = targetExecution as Record<string, unknown>;
  if (target['selection'] === 'selected')
    return (
      Array.isArray(target['operationEvents']) &&
      target['operationEvents'].every(isUserControlRecord) &&
      Number.isSafeInteger(target['candidateIndex']) &&
      isTargetCandidateIdentity(target['targetCandidate'])
    );
  if (target['selection'] === 'unresolved') {
    const resolution = target['targetResolution'];
    return (
      Array.isArray(target['operationEvents']) &&
      target['operationEvents'].every(isUserControlRecord) &&
      typeof resolution === 'object' &&
      resolution !== null &&
      !Array.isArray(resolution) &&
      ((resolution as Record<string, unknown>)['kind'] === 'impossible' ||
        (resolution as Record<string, unknown>)['kind'] === 'unsupported')
    );
  }
  if (target['selection'] !== 'ambiguous' || !Array.isArray(target['candidates'])) return false;
  const candidates = target['candidates'];
  return (
    candidates.length > 1 &&
    candidates.every(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        !Array.isArray(candidate) &&
        Number.isSafeInteger((candidate as Record<string, unknown>)['candidateIndex']) &&
        isTargetCandidateIdentity((candidate as Record<string, unknown>)['targetCandidate']),
    ) &&
    new Set(candidates.map((candidate) => (candidate as Record<string, unknown>)['candidateIndex']))
      .size === candidates.length
  );
}

function eventMatchesUserControl(
  identity: ProductionUserControlIdentity,
  event: ProductionUserControlOperationEvent,
): boolean {
  if (event.operationId !== identity.operationId) return false;
  if (
    event.projectionKey === identity.projectionKey &&
    event.contributionId === identity.contributionId
  )
    return true;
  return (
    identity.modifier === 'npSpecial' &&
    identity.contributionControl === 'worldAssumption' &&
    event.kind === 'executeNpDamage'
  );
}

function userControlBindingAddress(
  modifier: ProductionUserControlIdentity['modifier'],
): Extract<ProductionUserControlInputBinding, { kind: 'bound' }>['address'] | null {
  switch (modifier) {
    case null:
      return null;
    case 'ignoreDefense':
      return 'damageFunction.ignoreDefense';
    case 'npSpecial':
      return 'npSpecialMultipliers';
    case 'npVariantSelection':
      return 'npVariantSelection.damageInput';
    default:
      return modifier;
  }
}

function isValidUserControlBindingValue(
  binding: Extract<ProductionUserControlInputBinding, { kind: 'bound' }>,
): boolean {
  if (!Object.hasOwn(binding, 'value')) return false;
  const value: unknown = binding.value;
  switch (binding.address) {
    case 'ignoreDamageCut':
    case 'damageFunction.ignoreDefense':
      return typeof value === 'boolean';
    case 'npSpecialMultipliers':
      return (
        Array.isArray(value) &&
        value.length === 5 &&
        value.every((member) => typeof member === 'number' && Number.isFinite(member))
      );
    case 'npVariantSelection.damageInput':
      return (
        typeof value === 'object' &&
        value !== null &&
        Object.hasOwn(value, 'variant') &&
        Object.hasOwn(value, 'cardType') &&
        Object.hasOwn(value, 'npMultipliers') &&
        Object.hasOwn(value, 'damageFunction')
      );
    default:
      return typeof value === 'number' && Number.isFinite(value);
  }
}

/** Ratchets every user-visible production projection to an observed event or damage result. */
export function auditProductionUserControlObservations(
  input: ProductionUserControlGateInput,
): ProductionUserControlGate {
  const canonicalIdentity = 'tsk-08:inert-controls' as const;
  const summary: ProductionUserControlSummary = {
    projectionCount: input.observations.length,
    selectedProfileCount: 0,
    withoutAreaAlternateCount: 0,
    operationEventCount: 0,
    effectiveContributionCount: 0,
    directInputDifferenceCount: 0,
    operationOutcomeDifferenceCount: 0,
    eventProjectionOutcomeDifferenceCount: 0,
    damageResultDifferenceCount: 0,
  };
  const failures: ProductionUserControlFailure[] = [];
  const identityCounts = new Map<string, number>();

  const expectedIdentities = input.expectedIdentities.map((identity) =>
    userControlAuditValue(identity),
  );
  const actualIdentities = input.observations.map(({ identity }) =>
    userControlAuditValue(identity),
  );
  const sortedIdentities = (identities: CanonicalAuditValue[]) =>
    identities.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const identitySetFailure = productionUserControlFailure(
    'userControlInventoryCoverageMismatch',
    canonicalIdentity,
    { identities: sortedIdentities(expectedIdentities) },
    { identities: sortedIdentities(actualIdentities) },
  );

  const inventoryCountFailure = productionUserControlFailure(
    'userControlInventoryCoverageMismatch',
    canonicalIdentity,
    { projectionCount: input.expectedProjectionCount },
    { projectionCount: input.observations.length },
  );
  if (inventoryCountFailure) failures.push(inventoryCountFailure);

  for (const observation of input.observations) {
    const { identity, enabled, excluded } = observation;
    const rawIdentity: unknown = identity;
    const identityFields = rawIdentity as Record<string, unknown> | null;
    if (
      typeof rawIdentity !== 'object' ||
      identityFields === null ||
      typeof identityFields.ownerId !== 'string' ||
      typeof identityFields.profileKey !== 'string' ||
      typeof identityFields.projectionKey !== 'string' ||
      typeof identityFields.operationId !== 'string' ||
      !Object.hasOwn(identityFields, 'contributionId') ||
      !Object.hasOwn(identityFields, 'modifier') ||
      (identityFields.contributionId !== null &&
        typeof identityFields.contributionId !== 'string') ||
      (identityFields.modifier !== null && typeof identityFields.modifier !== 'string') ||
      (identityFields.contributionControl !== 'operation' &&
        identityFields.contributionControl !== 'worldAssumption') ||
      (identityFields.path !== 'selectedProfile' && identityFields.path !== 'withoutAreaAlternate')
    ) {
      const identityShape = {
        baseFieldsValid:
          typeof rawIdentity === 'object' &&
          identityFields !== null &&
          typeof identityFields.ownerId === 'string' &&
          typeof identityFields.profileKey === 'string' &&
          typeof identityFields.projectionKey === 'string' &&
          typeof identityFields.operationId === 'string',
        contributionIdPresent:
          identityFields !== null && Object.hasOwn(identityFields, 'contributionId'),
        contributionIdType:
          identityFields?.contributionId === null ? 'null' : typeof identityFields?.contributionId,
        modifierPresent: identityFields !== null && Object.hasOwn(identityFields, 'modifier'),
        modifierType: identityFields?.modifier === null ? 'null' : typeof identityFields?.modifier,
        contributionControlValid:
          identityFields?.contributionControl === 'operation' ||
          identityFields?.contributionControl === 'worldAssumption',
        pathValid:
          identityFields?.path === 'selectedProfile' ||
          identityFields?.path === 'withoutAreaAlternate',
      };
      const identityFailure = productionUserControlFailure(
        'userControlProjectionIdentityMismatch',
        canonicalIdentity,
        {
          ...identityShape,
          baseFieldsValid: true,
          contributionIdPresent: true,
          contributionIdType: identityShape.contributionIdType === 'null' ? 'null' : 'string',
          modifierPresent: true,
          modifierType: identityShape.modifierType === 'null' ? 'null' : 'string',
          contributionControlValid: true,
          pathValid: true,
        },
        identityShape,
      );
      if (identityFailure) failures.push(identityFailure);
      continue;
    }
    const profileIdentity = productionUserControlIdentity(identity);
    if (identity.path === 'withoutAreaAlternate' || observation.rankingSource) {
      const checks = rankingUserControlChecks(observation);
      const sourceFailure = productionUserControlFailure(
        'userControlRankingSourceMismatch',
        `${profileIdentity}:ranking-source`,
        Object.fromEntries(Object.keys(checks).map((key) => [key, true])),
        checks,
      );
      if (sourceFailure) failures.push(sourceFailure);
    }

    const battlePointContracts =
      input.expectedBattlePointReads?.filter(
        (expected) =>
          expected.ownerId === identity.ownerId &&
          expected.projectionKey === identity.projectionKey &&
          expected.operationId === identity.operationId,
      ) ?? [];
    if (battlePointContracts.length > 0) {
      const witness = observation.battlePointWitness;
      const targetOn = enabled.executionObservation.targetExecution;
      const targetOff = excluded.executionObservation.targetExecution;
      const selectedOn = targetOn?.selection === 'selected' ? targetOn : null;
      const selectedOff = targetOff?.selection === 'selected' ? targetOff : null;
      const readsOn = selectedOn?.candidateState?.battlePointPhaseReads ?? [];
      const readsOff = selectedOff?.candidateState?.battlePointPhaseReads ?? [];
      const expected = battlePointContracts[0]!;
      const requiresDefenseProof = identity.modifier === 'ignoreDefense';
      const matchingReads = (reads: typeof readsOn, leaf: (typeof expected.leaves)[number]) =>
        reads.filter(
          (read) =>
            read.operationId === identity.operationId &&
            read.subjectId === leaf.subjectId &&
            read.comparison === leaf.comparison &&
            read.expectedValue === leaf.value,
        );
      const onReadsValid =
        expected.leaves.length > 0 &&
        expected.leaves.every((leaf) => {
          const matches = matchingReads(readsOn, leaf);
          return (
            matches.length === 1 &&
            matches[0]!.actor === 'attacker' &&
            (requiresDefenseProof
              ? witness !== undefined &&
                matches[0]!.point === witness.preparedPoint &&
                matches[0]!.phase === witness.preparedPhase &&
                matches[0]!.evaluated === true
              : matches[0]!.phase !== null && matches[0]!.evaluated !== null)
          );
        });
      const offReadsValid =
        expected.leaves.length > 0 &&
        expected.leaves.every((leaf) => {
          const matches = matchingReads(readsOff, leaf);
          return (
            matches.length === 1 &&
            matches[0]!.actor === 'attacker' &&
            (requiresDefenseProof
              ? witness !== undefined &&
                matches[0]!.point === witness.preparedPoint &&
                matches[0]!.phase === witness.preparedPhase &&
                matches[0]!.evaluated === true
              : matches[0]!.phase !== null && matches[0]!.evaluated !== null)
          );
        });
      const shape = {
        uniqueCanonicalCondition:
          battlePointContracts.length === 1 &&
          expected.leaves.every((leaf) => leaf.subjectId !== ''),
        selectedSameCandidate:
          selectedOn !== null &&
          selectedOff !== null &&
          selectedOn.candidateIndex === selectedOff.candidateIndex &&
          JSON.stringify(selectedOn.targetCandidate) ===
            JSON.stringify(selectedOff.targetCandidate),
        sameExplicitInitialPoint:
          !requiresDefenseProof ||
          (witness !== undefined &&
            Number.isInteger(witness.initialPoint) &&
            enabled.executionObservation.battlePointWitness?.[witness.domainId] ===
              witness.initialPoint &&
            excluded.executionObservation.battlePointWitness?.[witness.domainId] ===
              witness.initialPoint),
        sameScenarioAndPlan:
          !requiresDefenseProof ||
          (witness !== undefined &&
            JSON.stringify({ ...witness.enabledScenario, effectDecisions: [] }) ===
              JSON.stringify({ ...witness.excludedScenario, effectDecisions: [] }) &&
            JSON.stringify(witness.enabledScenario.preNoblePhantasmPlan) ===
              JSON.stringify(observation.preparationSelection?.plan) &&
            witness.enabledScenario.enemyDefenseBuff === witness.enemyDefenseBuff &&
            witness.excludedScenario.enemyDefenseBuff === witness.enemyDefenseBuff),
        actualDefenseInput:
          !requiresDefenseProof ||
          (witness !== undefined &&
            witness.enemyDefenseBuff !== 0 &&
            enabled.damageInputDefenseBuff === witness.enemyDefenseBuff &&
            excluded.damageInputDefenseBuff === witness.enemyDefenseBuff),
        operationReads: onReadsValid && offReadsValid,
        orderedOutcomeAndProjection:
          enabled.operationEvents.some(
            (event) =>
              event.operationId === identity.operationId &&
              event.operationOutcome === 'applied' &&
              event.projectionOutcome === 'applied',
          ) &&
          excluded.operationEvents.some(
            (event) =>
              event.operationId === identity.operationId &&
              event.operationOutcome === 'notApplied' &&
              event.projectionOutcome === 'notApplied',
          ),
        effectiveAndDamage:
          !requiresDefenseProof ||
          (enabled.effectiveContributions.some(
            (contribution) =>
              contribution.operationId === identity.operationId && contribution.effective,
          ) &&
            excluded.effectiveContributions.some(
              (contribution) =>
                contribution.operationId === identity.operationId && !contribution.effective,
            ) &&
            enabled.inputBinding.kind === 'bound' &&
            enabled.inputBinding.address === 'damageFunction.ignoreDefense' &&
            enabled.inputBinding.value === true &&
            excluded.inputBinding.kind === 'bound' &&
            excluded.inputBinding.address === 'damageFunction.ignoreDefense' &&
            excluded.inputBinding.value === false &&
            enabled.damageResult.status === 'calculated' &&
            excluded.damageResult.status === 'calculated' &&
            JSON.stringify(enabled.damageResult.rows) !==
              JSON.stringify(excluded.damageResult.rows)),
      };
      const failure = productionUserControlFailure(
        'userControlBattlePointReadProofMissing',
        `${profileIdentity}:battle-point-read-proof`,
        Object.fromEntries(Object.keys(shape).map((key) => [key, true])),
        shape,
      );
      if (failure) failures.push(failure);
    }
    const enabledProfileKey =
      enabled.profileContinuity && enabled.profileContinuity.kind !== 'unresolved'
        ? enabled.profileContinuity.intendedProfileKey
        : null;
    const excludedProfileKey =
      excluded.profileContinuity && excluded.profileContinuity.kind !== 'unresolved'
        ? excluded.profileContinuity.intendedProfileKey
        : null;
    if (
      enabled.profileContinuity &&
      excluded.profileContinuity &&
      enabled.profileContinuity.kind !== 'unresolved' &&
      excluded.profileContinuity.kind !== 'unresolved' &&
      (identity.profileKey !== enabledProfileKey || identity.profileKey !== excludedProfileKey)
    ) {
      const profileFailure = productionUserControlFailure(
        'userControlSelectedProfileProofMissing',
        `${profileIdentity}:profile-identity`,
        { enabled: identity.profileKey, excluded: identity.profileKey },
        { enabled: enabledProfileKey ?? null, excluded: excludedProfileKey ?? null },
      );
      if (profileFailure) failures.push(profileFailure);
    }
    if (observation.conflictCounterexample) {
      const counterexample = observation.conflictCounterexample;
      const valid =
        counterexample.enabled.damageResult.status === 'unsupported' &&
        counterexample.excluded.damageResult.status === 'calculated' &&
        Array.isArray(counterexample.enabled.damageResult.rows) &&
        counterexample.enabled.damageResult.rows.length === 0 &&
        counterexample.issues.length > 0 &&
        counterexample.issues.every(
          (issue) =>
            issue.startsWith('constraintConflict:selected-form:') &&
            issue.includes(':exclusiveTrait:'),
        ) &&
        counterexample.enabled.projections.length > 0 &&
        counterexample.excluded.projections.length > 0 &&
        counterexample.enabled.operationEvents.length > 0 &&
        counterexample.excluded.operationEvents.length > 0 &&
        counterexample.enabled.projections.every(
          (projection) => projection.outcome === 'notApplied',
        ) &&
        counterexample.excluded.projections.every(
          (projection) => projection.outcome === 'notApplied',
        ) &&
        counterexample.enabled.operationEvents.every(
          (event) => event.operationOutcome === 'notApplied',
        ) &&
        counterexample.excluded.operationEvents.every(
          (event) => event.operationOutcome === 'notApplied',
        ) &&
        JSON.stringify(userControlAuditValue(counterexample.enabled.inputBinding)) ===
          JSON.stringify(userControlAuditValue(counterexample.excluded.inputBinding)) &&
        counterexample.profileKey !== null &&
        counterexample.profileKey !== identity.profileKey &&
        counterexample.plan.some((command) => command.kind === 'executeAttackNoblePhantasm');
      if (!valid) {
        const conflictFailure = productionUserControlFailure(
          'userControlConflictCounterexampleInvalid',
          `${profileIdentity}:conflict-counterexample`,
          { valid: true },
          { valid: false, counterexample },
        );
        if (conflictFailure) failures.push(conflictFailure);
      }
    }
    if (
      observation.preparationSelection?.kind === 'reachableAlternate' &&
      !observation.conflictCounterexample
    ) {
      const missingConflict = productionUserControlFailure(
        'userControlConflictCounterexampleInvalid',
        `${profileIdentity}:alternate-conflict-proof`,
        { conflictCounterexamplePresent: true },
        { conflictCounterexamplePresent: false },
      );
      if (missingConflict) failures.push(missingConflict);
    }
    if (identity.path === 'selectedProfile') summary.selectedProfileCount += 1;
    else summary.withoutAreaAlternateCount += 1;

    const occurrenceCount = (identityCounts.get(profileIdentity) ?? 0) + 1;
    if (occurrenceCount > 1) {
      const duplicateFailure = productionUserControlFailure(
        'userControlDuplicateIdentity',
        profileIdentity,
        { occurrences: 1 },
        { occurrences: occurrenceCount },
      );
      if (duplicateFailure) failures.push(duplicateFailure);
    }
    identityCounts.set(profileIdentity, occurrenceCount);

    let sidesComplete = true;
    for (const [sideName, side] of [
      ['enabled', enabled],
      ['excluded', excluded],
    ] as const) {
      const rawSide: unknown = side;
      const sideFields = rawSide as Record<string, unknown> | null;
      const damageResult = sideFields?.damageResult;
      const binding = sideFields?.inputBinding;
      const fields = {
        operationEvents:
          Array.isArray(sideFields?.operationEvents) &&
          sideFields.operationEvents.every(isUserControlRecord),
        projections:
          Array.isArray(sideFields?.projections) &&
          sideFields.projections.every(isUserControlRecord),
        inputBinding:
          isUserControlRecord(binding) &&
          ((binding.kind === 'bound' && typeof binding.address === 'string') ||
            (binding.kind === 'unbound' &&
              binding.reason === 'projection_has_no_damage_input_binding')),
        effectiveContributions:
          Array.isArray(sideFields?.effectiveContributions) &&
          sideFields.effectiveContributions.every(isUserControlRecord),
        damageResult:
          typeof damageResult === 'object' &&
          damageResult !== null &&
          Object.hasOwn(damageResult, 'status') &&
          Object.hasOwn(damageResult, 'rows'),
      };
      if (Object.values(fields).some((present) => !present)) {
        const sideFailure = productionUserControlFailure(
          'userControlObservationInconsistent',
          `${profileIdentity}:${sideName}:side-fields`,
          Object.fromEntries(Object.keys(fields).map((key) => [key, true])),
          fields,
        );
        if (sideFailure) failures.push(sideFailure);
        sidesComplete = false;
        continue;
      }
      if (!hasExecutionObservation(side.executionObservation)) {
        const rawExecution: unknown = side.executionObservation;
        const rawTarget = isUserControlRecord(rawExecution) ? rawExecution.targetExecution : null;
        const observationFailure = productionUserControlFailure(
          'userControlExecutionObservationMissing',
          `${profileIdentity}:${sideName}:execution-selection`,
          { selection: 'selected', targetCandidateIdentity: true, validObservation: true },
          {
            selection: isUserControlRecord(rawTarget) ? rawTarget.selection : null,
            targetCandidateIdentity:
              isUserControlRecord(rawTarget) &&
              isTargetCandidateIdentity(rawTarget.targetCandidate),
            validObservation: false,
          },
        );
        if (observationFailure) failures.push(observationFailure);
      } else if (side.executionObservation.targetExecution?.selection !== 'selected') {
        const selectionFailure = productionUserControlFailure(
          'userControlExecutionSelectionNotUnique',
          `${profileIdentity}:${sideName}:execution-selection`,
          { selection: 'selected' },
          { selection: side.executionObservation.targetExecution?.selection ?? null },
        );
        if (selectionFailure) failures.push(selectionFailure);
      }
      const selectedEvents =
        hasExecutionObservation(side.executionObservation) &&
        side.executionObservation.targetExecution?.selection === 'selected'
          ? side.executionObservation.targetExecution.operationEvents
          : null;
      const projectionMatches = side.projections.filter(
        (projection) =>
          projection.projectionKey === identity.projectionKey &&
          projection.operationId === identity.operationId &&
          projection.contributionId === identity.contributionId,
      );
      if (projectionMatches.length !== 1) {
        const projectionFailure = productionUserControlFailure(
          'userControlProjectionIdentityMismatch',
          `${profileIdentity}:${sideName}:projection`,
          { count: 1, identity },
          {
            count: projectionMatches.length,
            identities: side.projections.map(({ projectionKey, operationId, contributionId }) => ({
              projectionKey,
              operationId,
              contributionId,
            })),
          },
        );
        if (projectionFailure) failures.push(projectionFailure);
      } else if (projectionMatches[0]!.outcome === 'unsupported') {
        const projectionFailure = productionUserControlFailure(
          'userControlObservationInconsistent',
          `${profileIdentity}:${sideName}:projection-outcome`,
          { supported: true },
          { supported: false, outcome: projectionMatches[0]!.outcome },
        );
        if (projectionFailure) failures.push(projectionFailure);
      }

      const linkedEvents = side.operationEvents.filter((event) =>
        eventMatchesUserControl(identity, event),
      );
      if (linkedEvents.length !== 1) {
        const eventFailure = productionUserControlFailure(
          'userControlOperationEventMissing',
          `${profileIdentity}:${sideName}:operation-event`,
          { count: 1, operationId: identity.operationId, contributionId: identity.contributionId },
          {
            count: linkedEvents.length,
            events: side.operationEvents.map(
              ({ projectionKey, operationId, contributionId, kind }) => ({
                projectionKey,
                operationId,
                contributionId,
                kind,
              }),
            ),
          },
        );
        if (eventFailure) failures.push(eventFailure);
      } else {
        summary.operationEventCount += 1;
        if (selectedEvents !== null) {
          const sourceEvents = selectedEvents.filter((event) =>
            eventMatchesUserControl(identity, {
              projectionKey: event.projectionKey,
              operationId: event.operationId,
              contributionId: event.contributionId,
              kind: event.operationKind,
              operationOutcome: event.operationOutcome,
              projectionOutcome: event.projectionOutcome,
              projectionValuePermille: event.projectionValuePermille,
            }),
          );
          const source = sourceEvents[0];
          const sourceEvent = source && {
            projectionKey: source.projectionKey,
            operationId: source.operationId,
            contributionId: source.contributionId,
            kind: source.operationKind,
            operationOutcome: source.operationOutcome,
            projectionOutcome: source.projectionOutcome,
            projectionValuePermille: source.projectionValuePermille,
          };
          const sourceFailure = productionUserControlFailure(
            'userControlObservationInconsistent',
            `${profileIdentity}:${sideName}:event-source`,
            { count: 1, event: sourceEvent },
            { count: sourceEvents.length, event: linkedEvents[0] },
          );
          if (sourceFailure) failures.push(sourceFailure);
        }
      }

      if (identity.contributionId !== null) {
        const effectiveMatches = side.effectiveContributions.filter(
          (contribution) =>
            contribution.operationId === identity.operationId &&
            contribution.contributionId === identity.contributionId,
        );
        if (effectiveMatches.length !== 1) {
          const effectiveFailure = productionUserControlFailure(
            'userControlEffectiveContributionMissing',
            `${profileIdentity}:${sideName}:effective-contribution`,
            {
              count: 1,
              operationId: identity.operationId,
              contributionId: identity.contributionId,
            },
            {
              count: effectiveMatches.length,
              contributions: side.effectiveContributions.map(
                ({ operationId, contributionId, modifier, effective }) => ({
                  operationId,
                  contributionId,
                  modifier,
                  effective,
                }),
              ),
            },
          );
          if (effectiveFailure) failures.push(effectiveFailure);
        } else {
          summary.effectiveContributionCount += 1;
          const contribution = effectiveMatches[0]!;
          const projection = projectionMatches[0];
          const contributionFailure = productionUserControlFailure(
            'userControlObservationInconsistent',
            `${profileIdentity}:${sideName}:effective-contribution-state`,
            {
              modifier: identity.modifier,
              executionOutcome: projection?.outcome,
              effective:
                identity.path === 'withoutAreaAlternate'
                  ? observation.rankingSource?.trace?.[
                      sideName === 'enabled' ? 'selectedExecution' : 'withoutAreaExecution'
                    ]?.effectiveContributions.contributions.find(
                      (candidate) =>
                        candidate.operationId === identity.operationId &&
                        candidate.contributionId === identity.contributionId,
                    )?.effective
                  : projection?.outcome === 'applied',
            },
            {
              modifier: contribution.modifier,
              executionOutcome: contribution.executionOutcome,
              effective: contribution.effective,
            },
          );
          if (contributionFailure) failures.push(contributionFailure);
        }
      }
    }
    if (!sidesComplete) continue;

    const expectedAddress = userControlBindingAddress(identity.modifier);
    for (const [sideName, side] of [
      ['enabled', enabled],
      ['excluded', excluded],
    ] as const) {
      const actualAddress = side.inputBinding.kind === 'bound' ? side.inputBinding.address : null;
      if (actualAddress !== expectedAddress) {
        const addressFailure = productionUserControlFailure(
          'userControlInputBindingUnsupported',
          `${profileIdentity}:${sideName}:damage-input-binding`,
          { address: expectedAddress },
          { address: actualAddress, binding: side.inputBinding },
        );
        if (addressFailure) failures.push(addressFailure);
      }
      if (
        side.inputBinding.kind === 'bound' &&
        !isValidUserControlBindingValue(side.inputBinding)
      ) {
        const valueFailure = productionUserControlFailure(
          'userControlInputBindingUnsupported',
          `${profileIdentity}:${sideName}:damage-input-value`,
          { present: true, valueDefined: true, valueValid: true },
          {
            present: Object.hasOwn(side.inputBinding, 'value'),
            valueDefined: (side.inputBinding as { value?: unknown }).value !== undefined,
            valueValid: isValidUserControlBindingValue(side.inputBinding),
          },
        );
        if (valueFailure) failures.push(valueFailure);
      }
    }

    const controlledEvent = enabled.operationEvents.find((event) =>
      eventMatchesUserControl(identity, event),
    );
    const structuralControl =
      controlledEvent?.kind === 'transformActorForm' ||
      controlledEvent?.kind === 'selectNoblePhantasmVariant';
    const enabledProfile = enabled.profileContinuity;
    const excludedProfile = excluded.profileContinuity;
    const excludedControlledEvent = excluded.operationEvents.find((event) =>
      eventMatchesUserControl(identity, event),
    );
    const excludedSelectionEvents =
      excluded.executionObservation.targetExecution?.selection === 'selected'
        ? excluded.executionObservation.targetExecution.operationEvents
        : [];
    const matchedProfileProof =
      enabledProfile?.kind === 'matched' &&
      enabledProfile.intendedProfileKey === enabledProfile.actualProfileKey &&
      excludedProfile?.kind === 'matched' &&
      excludedProfile.intendedProfileKey === enabledProfile.intendedProfileKey &&
      excludedProfile.actualProfileKey === enabledProfile.intendedProfileKey &&
      enabled.damageResult.status === 'calculated' &&
      excluded.damageResult.status === 'calculated' &&
      excludedControlledEvent?.operationOutcome === 'notApplied';
    const unavailableProfileProof =
      enabledProfile?.kind === 'matched' &&
      enabledProfile.intendedProfileKey === enabledProfile.actualProfileKey &&
      excludedProfile !== undefined &&
      (excludedProfile.kind === 'unavailableNoAttack' ||
        excludedProfile.kind === 'unavailableDifferentAttack') &&
      excludedProfile.intendedProfileKey === enabledProfile.intendedProfileKey &&
      excludedProfile.actualProfileKey !== enabledProfile.intendedProfileKey &&
      excludedControlledEvent?.operationOutcome === 'notApplied' &&
      excludedSelectionEvents.some(
        (event) =>
          event.operationId === excludedProfile.disabledSelectionOperationId &&
          event.operationKind === 'selectNoblePhantasmVariant' &&
          event.operationOutcome === 'notApplied',
      ) &&
      enabled.damageResult.status === 'calculated' &&
      excluded.damageResult.status === 'unavailable' &&
      excluded.damageResult.reason ===
        (excludedProfile.kind === 'unavailableNoAttack'
          ? 'selectedAttackProfileHasNoAttack'
          : 'selectedAttackProfileChanged') &&
      Array.isArray(excluded.damageResult.rows) &&
      excluded.damageResult.rows.length === 0;
    if (structuralControl && !matchedProfileProof && !unavailableProfileProof) {
      const profileFailure = productionUserControlFailure(
        'userControlSelectedProfileProofMissing',
        `${profileIdentity}:selected-profile-proof`,
        { enabledProfile: 'matched', excludedProfile: 'matched-or-typed-unavailable' },
        {
          enabledProfile: enabledProfile ?? null,
          excludedProfile: excludedProfile ?? null,
          enabledStatus: enabled.damageResult.status,
          excludedStatus: excluded.damageResult.status,
          excludedReason: excluded.damageResult.reason ?? null,
        },
      );
      if (profileFailure) failures.push(profileFailure);
      continue;
    }
    if (
      !structuralControl &&
      (enabled.damageResult.status !== 'calculated' ||
        excluded.damageResult.status !== 'calculated')
    ) {
      const outcomeFailure = productionUserControlFailure(
        'userControlDamageOutcomeNotCalculated',
        `${profileIdentity}:damage-outcome`,
        { enabled: 'calculated', excluded: 'calculated' },
        { enabled: enabled.damageResult.status, excluded: excluded.damageResult.status },
      );
      if (outcomeFailure) failures.push(outcomeFailure);
      continue;
    }
    if (enabled.inputBinding.kind !== excluded.inputBinding.kind) {
      const bindingFailure = productionUserControlFailure(
        'userControlInputBindingUnsupported',
        `${profileIdentity}:damage-input-binding`,
        { sameKind: true },
        { sameKind: false, enabled: enabled.inputBinding, excluded: excluded.inputBinding },
      );
      if (bindingFailure) failures.push(bindingFailure);
      continue;
    }
    if (enabled.inputBinding.kind === 'unbound' && excluded.inputBinding.kind === 'unbound') {
      const enabledReason: unknown = enabled.inputBinding.reason;
      const excludedReason: unknown = excluded.inputBinding.reason;
      if (identity.modifier !== null || enabledReason !== excludedReason) {
        const bindingFailure = productionUserControlFailure(
          'userControlInputBindingUnsupported',
          `${profileIdentity}:damage-input-binding`,
          { modifier: null, sameReason: true },
          {
            modifier: identity.modifier,
            sameReason: enabledReason === excludedReason,
          },
        );
        if (bindingFailure) failures.push(bindingFailure);
      }
    } else if (
      enabled.inputBinding.kind === 'bound' &&
      excluded.inputBinding.kind === 'bound' &&
      enabled.inputBinding.address !== excluded.inputBinding.address
    ) {
      const bindingFailure = productionUserControlFailure(
        'userControlInputBindingUnsupported',
        `${profileIdentity}:damage-input-binding`,
        { address: enabled.inputBinding.address },
        { address: excluded.inputBinding.address },
      );
      if (bindingFailure) failures.push(bindingFailure);
      continue;
    }

    const inputDifference =
      enabled.inputBinding.kind === 'bound' && excluded.inputBinding.kind === 'bound'
        ? firstCanonicalAuditDifference(
            [
              {
                identity: `${profileIdentity}:damage-input:${enabled.inputBinding.address}`,
                value: userControlAuditValue(enabled.inputBinding.value),
              },
            ],
            [
              {
                identity: `${profileIdentity}:damage-input:${excluded.inputBinding.address}`,
                value: userControlAuditValue(excluded.inputBinding.value),
              },
            ],
          )
        : null;
    if (inputDifference) summary.directInputDifferenceCount += 1;

    const enabledEvent = enabled.operationEvents.find((event) =>
      eventMatchesUserControl(identity, event),
    );
    const excludedEvent = excluded.operationEvents.find((event) =>
      eventMatchesUserControl(identity, event),
    );
    const operationOutcomeDifference =
      enabledEvent !== undefined &&
      excludedEvent !== undefined &&
      enabledEvent.operationOutcome !== excludedEvent.operationOutcome;
    const eventProjectionOutcomeDifference =
      enabledEvent !== undefined &&
      excludedEvent !== undefined &&
      enabledEvent.projectionOutcome !== excludedEvent.projectionOutcome;
    if (operationOutcomeDifference) summary.operationOutcomeDifferenceCount += 1;
    if (eventProjectionOutcomeDifference) summary.eventProjectionOutcomeDifferenceCount += 1;

    const resultDifference = firstCanonicalAuditDifference(
      [
        {
          identity: `${profileIdentity}:damage-result`,
          value: userControlAuditValue(enabled.damageResult),
        },
      ],
      [
        {
          identity: `${profileIdentity}:damage-result`,
          value: userControlAuditValue(excluded.damageResult),
        },
      ],
    );
    if (resultDifference) summary.damageResultDifferenceCount += 1;

    const mustReachNpSpecialInput = identity.modifier === 'npSpecial';
    const reachesNpSpecialInput =
      mustReachNpSpecialInput &&
      enabled.inputBinding.kind === 'bound' &&
      excluded.inputBinding.kind === 'bound' &&
      enabled.inputBinding.address === 'npSpecialMultipliers' &&
      excluded.inputBinding.address === 'npSpecialMultipliers' &&
      Array.isArray(enabled.inputBinding.value) &&
      Array.isArray(excluded.inputBinding.value) &&
      enabled.inputBinding.value.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ) &&
      excluded.inputBinding.value.every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ) &&
      inputDifference !== null;
    if (mustReachNpSpecialInput && !reachesNpSpecialInput) {
      const npSpecialFailure = productionUserControlFailure(
        'userControlNpSpecialInputNotChanged',
        `${profileIdentity}:np-special-damage-input`,
        {
          enabledAddress: 'npSpecialMultipliers',
          excludedAddress: 'npSpecialMultipliers',
          changed: true,
        },
        {
          enabledAddress:
            enabled.inputBinding.kind === 'bound' ? enabled.inputBinding.address : null,
          excludedAddress:
            excluded.inputBinding.kind === 'bound' ? excluded.inputBinding.address : null,
          changed: inputDifference !== null,
          validArrays:
            enabled.inputBinding.kind === 'bound' &&
            excluded.inputBinding.kind === 'bound' &&
            Array.isArray(enabled.inputBinding.value) &&
            Array.isArray(excluded.inputBinding.value),
          enabled: enabled.inputBinding,
          excluded: excluded.inputBinding,
        },
      );
      if (npSpecialFailure) failures.push(npSpecialFailure);
    } else if (
      !mustReachNpSpecialInput &&
      !inputDifference &&
      !operationOutcomeDifference &&
      !eventProjectionOutcomeDifference &&
      !resultDifference
    ) {
      const inertFailure = productionUserControlFailure(
        'userControlDidNotReachOperationOrDamage',
        `${profileIdentity}:enabled-vs-excluded`,
        {
          reached: true,
          operationOutcomeChanged: operationOutcomeDifference,
          eventProjectionOutcomeChanged: eventProjectionOutcomeDifference,
          damageInputChanged: false,
          damageResultChanged: false,
        },
        {
          reached: false,
          operationOutcomeChanged: operationOutcomeDifference,
          eventProjectionOutcomeChanged: eventProjectionOutcomeDifference,
          damageInputChanged: false,
          damageResultChanged: false,
        },
      );
      if (inertFailure) failures.push(inertFailure);
    }
  }

  if (identitySetFailure) failures.push(identitySetFailure);
  const expected = userControlAuditValue({ projectionCount: input.expectedProjectionCount });
  const actual = userControlAuditValue({ projectionCount: input.observations.length });
  const matrixDifference = firstCanonicalAuditDifference(
    [{ identity: canonicalIdentity, value: expected }],
    [{ identity: canonicalIdentity, value: actual }],
  );
  if (failures.length === 0 && !matrixDifference)
    return {
      status: 'passed',
      canonicalIdentity,
      expected,
      actual,
      summary,
      firstDifference: null,
      failures: [],
    };

  const failureIdentity = failures[0]?.firstDifference ?? matrixDifference;
  if (!failureIdentity) throw new TypeError('production_user_control_failure_difference_missing');
  return {
    status: 'failed',
    canonicalIdentity,
    expected,
    actual,
    summary,
    firstDifference: failureIdentity,
    failures,
  };
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

      const transaction = (action as Partial<ProductionPreparationTransactionAction>)
        .resourceTransaction;
      const mutationSteps = transaction?.mutations ?? [];
      const orderedMutations = mutationSteps.every(
        (mutation, index) =>
          mutation.step >= 0 &&
          (index === 0 || mutationSteps[index - 1]!.step < mutation.step) &&
          mutation.occurrenceId.length > 0 &&
          action.ocOutcomes.some(
            (outcome) => outcome.step === mutation.step && outcome.outcome === 'notApplicable',
          ),
      );
      const continuousMutations = mutationSteps.every(
        (mutation, index) =>
          JSON.stringify(mutation.before) ===
          JSON.stringify(
            index === 0 ? transaction?.afterConsumption : mutationSteps[index - 1]!.after,
          ),
      );
      const finalResource = mutationSteps.at(-1)?.after ?? transaction?.afterConsumption;
      const transactionFailure = preparationFailure(
        'preparationResourceCommitMismatch',
        canonicalIdentity,
        { valid: true },
        {
          valid:
            transaction !== undefined &&
            orderedMutations &&
            continuousMutations &&
            JSON.stringify(finalResource) === JSON.stringify(action.resourceAfter) &&
            (command?.kind === 'useSkillSlot'
              ? JSON.stringify(transaction.afterConsumption) ===
                JSON.stringify(action.resourceBefore)
              : transaction.afterConsumption.gauge === 0 &&
                transaction.afterConsumption.npLevel === action.resourceBefore.npLevel &&
                transaction.afterConsumption.capacity === action.resourceBefore.capacity),
        },
        actionContext,
      );
      if (transactionFailure) failures.push(transactionFailure);

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
