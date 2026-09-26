import type {
  BattleOperation,
  OrderedExecutionAuditObservation,
  OrderedCandidateStateAudit,
  OrderedExecutionAuditEvent,
  OrderedInputQuantityReadAuditEvent,
  OrderedExecutionGroupAuditEvent,
} from '@fgo-lab/battle-execution';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';
import { inputQuantityLeaves, transactionIdentity } from './productionCriticalStarsAudit';
import { userControlSideObservation } from './productionUserControlObservation';
import type { ProductionUserControlSideObservation } from './productionParityDiagnostics';

type Calculation = Extract<CalculationExecution, { status: 'executable' }>;
type Prepared = Extract<PreparedCalculationScenario, { status: 'executable' }>;
const starAddress = 'battle:criticalStars';
const starMutation = (operation: BattleOperation) =>
  operation.kind === 'resourceMutation' && operation.resource === 'criticalStars';
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface CriticalStarsRecoveryProgram {
  canonicalIdentity: string;
  prepared: Prepared;
  calculation: Calculation;
  operations: readonly BattleOperation[];
  groups: readonly {
    groupIndex: number;
    transactionIdentity: OrderedExecutionGroupAuditEvent['transactionIdentity'];
    operationIds: readonly string[];
  }[];
  groupIndexes: readonly number[];
  rollbackGroupIndex: number;
  reads: readonly {
    operationId: string;
    operationSequence: number;
    operationGroupIndex: number;
    inputKey: string;
  }[];
  initialValue: number | null;
  references: CriticalStarsRecoveryProgram['owner'];
  useReferences: {
    effects: Calculation['effects'];
    contributions: Calculation['effectiveContributions']['contributions'];
    contributionMembers: Calculation['effectiveContributions']['contributions'];
  };
  traceReferences: {
    target: OrderedExecutionAuditObservation | null | undefined;
    state: OrderedCandidateStateAudit | undefined;
    events: readonly OrderedExecutionAuditEvent[];
    groups: readonly OrderedExecutionGroupAuditEvent[];
    reads: readonly OrderedInputQuantityReadAuditEvent[];
    groupMembers: readonly OrderedExecutionGroupAuditEvent[];
    eventMembers: readonly OrderedExecutionAuditEvent[];
    readMembers: readonly OrderedInputQuantityReadAuditEvent[];
    mutations: readonly OrderedExecutionGroupAuditEvent['mutations'][number][];
  };
  canonical: {
    operations: readonly BattleOperation[];
    scenario: Prepared['scenario'];
    targetResolution: NonNullable<Prepared['orderedScenario']>['targetResolution'] | null;
    initialValue: number | null;
  };
  owner: {
    target: Calculation['executionObservation'];
    input: Calculation['input'];
    effects: Calculation['effects'];
    contributions: Calculation['effectiveContributions'];
    result: Calculation['result'];
  };
}

/** Failure identity is supplied from the canonical fixture contract, never selected by read value. */
export function criticalStarsRecoveryProgram(
  prepared: Prepared,
  calculation: Calculation,
  failedOperation: BattleOperation,
): CriticalStarsRecoveryProgram {
  const operations = prepared.orderedScenario?.operations ?? [];
  const failedSequence = operations.indexOf(failedOperation);
  if (failedSequence < 0) throw new TypeError('recovery_canonical_failure_operation_missing');
  const groups: CriticalStarsRecoveryProgram['groups'][number][] = [];
  const groupIndexes = operations.map((operation) => {
    const identity = transactionIdentity(operation);
    if (!equal(groups.at(-1)?.transactionIdentity, identity))
      groups.push({ groupIndex: groups.length, transactionIdentity: identity, operationIds: [] });
    const group = groups.at(-1)!;
    group.operationIds = [...group.operationIds, operation.operationId];
    return group.groupIndex;
  });
  const rollbackGroupIndex = groupIndexes[failedSequence]!;
  const canonicalIdentity = `tsk-08:critical-stars-recovery:${JSON.stringify(groups[rollbackGroupIndex]!.transactionIdentity)}`;
  const target = prepared.executionObservation?.targetExecution;
  const selected = target?.selection === 'selected' ? target : null;
  const state = selected?.candidateState;
  return {
    canonicalIdentity,
    prepared,
    calculation,
    operations,
    groups,
    groupIndexes,
    rollbackGroupIndex,
    reads: operations.flatMap((operation, operationSequence) =>
      inputQuantityLeaves(operation.condition).map(({ inputKey }) => ({
        operationId: operation.operationId,
        operationSequence,
        operationGroupIndex: groupIndexes[operationSequence]!,
        inputKey,
      })),
    ),
    initialValue: prepared.canonicalInputs?.values[starAddress] ?? null,
    traceReferences: {
      target,
      state,
      events: selected?.operationEvents ?? [],
      groups: state?.executionGroups ?? [],
      reads: state?.inputQuantityReads ?? [],
      groupMembers: [...(state?.executionGroups ?? [])],
      eventMembers: [...(selected?.operationEvents ?? [])],
      readMembers: [...(state?.inputQuantityReads ?? [])],
      mutations: state?.executionGroups.flatMap(({ mutations }) => mutations) ?? [],
    },
    canonical: structuredClone({
      operations,
      scenario: prepared.scenario,
      targetResolution: prepared.orderedScenario?.targetResolution ?? null,
      initialValue: prepared.canonicalInputs?.values[starAddress] ?? null,
    }),
    useReferences: {
      effects: [...calculation.effects],
      contributions: calculation.effectiveContributions.contributions,
      contributionMembers: [...calculation.effectiveContributions.contributions],
    },
    references: {
      target: prepared.executionObservation,
      input: calculation.input,
      effects: calculation.effects,
      contributions: calculation.effectiveContributions,
      result: calculation.result,
    },
    owner: structuredClone({
      target: prepared.executionObservation,
      input: calculation.input,
      effects: calculation.effects,
      contributions: calculation.effectiveContributions,
      result: calculation.result,
    }),
  };
}

export interface CriticalStarsRecoverySource {
  program: CriticalStarsRecoveryProgram;
  calculation: Calculation;
  observation: Calculation['executionObservation'];
  input: Calculation['input'];
  effects: Calculation['effects'];
  effectiveContributions: Calculation['effectiveContributions'];
  result: Calculation['result'];
  readerUses: readonly { operationId: string; side: ProductionUserControlSideObservation }[];
}

export function criticalStarsRecoverySource(
  program: CriticalStarsRecoveryProgram,
): CriticalStarsRecoverySource {
  const calculation = program.calculation;
  const readerIds = new Set(
    program.reads
      .filter(
        (read) =>
          read.inputKey === starAddress && read.operationGroupIndex > program.rollbackGroupIndex,
      )
      .map(({ operationId }) => operationId),
  );
  return {
    program,
    calculation,
    observation: calculation.executionObservation,
    input: calculation.input,
    effects: calculation.effects,
    effectiveContributions: calculation.effectiveContributions,
    result: calculation.result,
    readerUses: calculation.executionObservation
      ? [...readerIds].flatMap((operationId) =>
          calculation.effects
            .filter((projection) => projection.operationId === operationId)
            .map((projection) => ({
              operationId,
              side: userControlSideObservation(
                projection,
                calculation,
                calculation.executionObservation!,
              ),
            })),
        )
      : [],
  };
}

export type CriticalStarsRecoveryFailureReason =
  | 'recoveryCoverageMismatch'
  | 'recoverySourceMismatch'
  | 'recoveryTraceMissing'
  | 'recoveryIdentityMismatch'
  | 'recoveryOrderMismatch'
  | 'recoveryReceiptMismatch'
  | 'recoveryRollbackMismatch'
  | 'recoveryReadMismatch'
  | 'recoveryUseMismatch'
  | 'recoveryOutcomeMismatch';
export interface CriticalStarsRecoveryFailure {
  reason: CriticalStarsRecoveryFailureReason;
  checkPath: string;
  canonicalIdentity: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
}
export type CriticalStarsRecoveryGate = {
  canonicalIdentity: 'tsk-08:critical-stars-recovery';
  expected: readonly string[];
  actual: readonly string[];
} & (
  | { status: 'passed'; failures: readonly []; firstDifference: null }
  | {
      status: 'failed';
      failures: readonly CriticalStarsRecoveryFailure[];
      firstDifference: CanonicalAuditDifference;
    }
);

function auditRecovery(
  program: CriticalStarsRecoveryProgram,
  source: CriticalStarsRecoverySource | undefined,
  failures: CriticalStarsRecoveryFailure[],
) {
  const check = (
    reason: CriticalStarsRecoveryFailureReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => {
    if (equal(expected, actual)) return;
    // Diagnostics retain absence explicitly. Inputs are execution-owned JSON-shaped receipts.
    const value = (item: unknown): CanonicalAuditValue =>
      item === undefined
        ? { kind: 'absent' }
        : (JSON.parse(JSON.stringify(item)) as CanonicalAuditValue);
    const identity = `${program.canonicalIdentity}:${path}`;
    const wanted = value(expected);
    const observed = value(actual);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: wanted }],
      [{ identity, value: observed }],
    );
    failures.push({
      reason,
      checkPath: path,
      canonicalIdentity: identity,
      expected: value(expected),
      actual: value(actual),
      firstDifference: {
        identity,
        path: difference?.path ? `${path}.${difference.path}` : path,
        expected: difference?.expected,
        actual: difference?.actual,
      },
    });
  };
  check('recoverySourceMismatch', 'source.present', true, source != null);
  if (!source) return;
  const sourceShape =
    record(source.calculation) &&
    record(source.result) &&
    record(source.input) &&
    Array.isArray(source.effects) &&
    source.effects.every(record) &&
    record(source.effectiveContributions) &&
    Array.isArray(source.effectiveContributions.contributions) &&
    source.effectiveContributions.contributions.every(record) &&
    Array.isArray(source.readerUses) &&
    source.readerUses.every((use) => record(use) && record(use.side));
  check('recoveryTraceMissing', 'source.shape', true, sourceShape);
  if (!sourceShape) return;
  const calculation = program.calculation;
  const prepared = program.prepared;
  check(
    'recoverySourceMismatch',
    'source.references',
    true,
    source.program === program &&
      source.calculation === calculation &&
      source.observation === prepared.executionObservation &&
      source.observation === calculation.executionObservation &&
      calculation.scenario === prepared.scenario &&
      calculation.input === ('input' in prepared.resolved ? prepared.resolved.input : null) &&
      calculation.effects === prepared.resolved.effects &&
      calculation.effectiveContributions === prepared.resolved.effectiveContributions &&
      source.input === calculation.input &&
      source.effects === calculation.effects &&
      source.effectiveContributions === calculation.effectiveContributions &&
      source.result === calculation.result &&
      source.observation === program.references.target &&
      source.input === program.references.input &&
      source.effects === program.references.effects &&
      source.effectiveContributions === program.references.contributions &&
      source.result === program.references.result,
  );
  check(
    'recoverySourceMismatch',
    'program.operations',
    true,
    program.operations === prepared.orderedScenario?.operations,
  );
  check('recoverySourceMismatch', 'canonical.ownerProgram', program.canonical, {
    operations: prepared.orderedScenario?.operations ?? [],
    scenario: prepared.scenario,
    targetResolution: prepared.orderedScenario?.targetResolution ?? null,
    initialValue: prepared.canonicalInputs?.values[starAddress] ?? null,
  });
  check(
    'recoveryOutcomeMismatch',
    'resolved.precision',
    'unsupported',
    prepared.resolved.precision,
  );
  check('recoveryOutcomeMismatch', 'calculation.status', 'executable', source.calculation.status);
  check('recoveryOutcomeMismatch', 'result.status', 'unsupported', source.result.status);
  check('recoveryOutcomeMismatch', 'result.ownerReceipt', program.owner.result, source.result);
  check(
    'recoveryOutcomeMismatch',
    'result.rows',
    [],
    'rows' in source.result ? source.result.rows : null,
  );
  check(
    'recoverySourceMismatch',
    'use.references',
    true,
    source.effects.every((effect, index) => effect === program.useReferences.effects[index]) &&
      source.effectiveContributions.contributions === program.useReferences.contributions &&
      source.effectiveContributions.contributions.every(
        (contribution, index) => contribution === program.useReferences.contributionMembers[index],
      ),
  );
  check('recoveryUseMismatch', 'input.ownerReceipt', program.owner.input, source.input);
  check('recoveryUseMismatch', 'effects.ownerReceipt', program.owner.effects, source.effects);
  check(
    'recoveryUseMismatch',
    'contributions.ownerReceipt',
    program.owner.contributions,
    source.effectiveContributions,
  );
  const target = source.observation?.targetExecution;
  check('recoveryTraceMissing', 'target.selection', 'selected', target?.selection ?? null);
  if (!target || target.selection !== 'selected') return;
  const ownerTarget = program.owner.target?.targetExecution;
  check(
    'recoveryIdentityMismatch',
    'candidate.index',
    ownerTarget?.selection === 'selected' ? ownerTarget.candidateIndex : null,
    target.candidateIndex,
  );
  check(
    'recoveryIdentityMismatch',
    'candidate.target',
    prepared.orderedScenario?.targetResolution.kind === 'candidates'
      ? (prepared.orderedScenario.targetResolution.candidates[target.candidateIndex] ?? null)
      : null,
    target.targetCandidate,
  );
  check(
    'recoverySourceMismatch',
    'candidate.reference',
    true,
    prepared.orderedScenario?.targetResolution.kind === 'candidates' &&
      target.targetCandidate ===
        prepared.orderedScenario.targetResolution.candidates[target.candidateIndex],
  );
  const originalTarget = program.traceReferences.target;
  check('recoverySourceMismatch', 'target.reference', true, originalTarget === target);
  const state = target.candidateState;
  check('recoveryTraceMissing', 'candidateState.present', true, state != null);
  if (!state) return;
  const shape =
    Array.isArray(target.operationEvents) &&
    target.operationEvents.every(record) &&
    Array.isArray(state.inputQuantityReads) &&
    state.inputQuantityReads.every(record) &&
    Array.isArray(state.executionGroups) &&
    state.executionGroups.every(
      (group) =>
        record(group) &&
        Array.isArray(group.mutations) &&
        group.mutations.every(record) &&
        Array.isArray(group.operationIds) &&
        Array.isArray(group.appliedOperationIds) &&
        Array.isArray(group.issues),
    );
  check('recoveryTraceMissing', 'trace.shape', true, shape);
  if (!shape) return;
  const original = program.traceReferences;
  check(
    'recoverySourceMismatch',
    'trace.references',
    true,
    state === original.state &&
      target.operationEvents === original.events &&
      state.executionGroups === original.groups &&
      state.inputQuantityReads === original.reads &&
      state.executionGroups.every((group, index) => group === original.groupMembers[index]) &&
      target.operationEvents.every((event, index) => event === original.eventMembers[index]) &&
      state.inputQuantityReads.every((read, index) => read === original.readMembers[index]) &&
      state.executionGroups
        .flatMap(({ mutations }) => mutations)
        .every((mutation, index) => mutation === original.mutations[index]),
  );
  check(
    'recoveryOrderMismatch',
    'groups.identity',
    program.groups,
    state.executionGroups.map(({ groupIndex, transactionIdentity, operationIds }) => ({
      groupIndex,
      transactionIdentity,
      operationIds,
    })),
  );
  check(
    'recoveryOrderMismatch',
    'events.identity',
    program.operations.map((operation, sequence) => ({
      sequence,
      operationId: operation.operationId,
      operationKind: operation.kind,
    })),
    target.operationEvents.map(({ sequence, operationId, operationKind }) => ({
      sequence,
      operationId,
      operationKind,
    })),
  );
  check(
    'recoveryIdentityMismatch',
    'operations.unique',
    program.operations.length,
    new Set(program.operations.map(({ operationId }) => operationId)).size,
  );
  check(
    'recoveryOrderMismatch',
    'reads.identity',
    program.reads,
    state.inputQuantityReads.map(
      ({ operationId, operationSequence, operationGroupIndex, inputKey }) => ({
        operationId,
        operationSequence,
        operationGroupIndex,
        inputKey,
      }),
    ),
  );
  check(
    'recoveryReceiptMismatch',
    'events.ownerReceipt',
    ownerTarget?.selection === 'selected' ? ownerTarget.operationEvents : null,
    target.operationEvents,
  );
  const ownerState = ownerTarget?.selection === 'selected' ? ownerTarget.candidateState : null;
  check(
    'recoveryReceiptMismatch',
    'groups.ownerReceipt',
    ownerState?.executionGroups ?? null,
    state.executionGroups,
  );
  check(
    'recoveryReceiptMismatch',
    'reads.ownerReceipt',
    ownerState?.inputQuantityReads ?? null,
    state.inputQuantityReads,
  );
  const readerIds = [
    ...new Set(
      program.reads
        .filter(
          ({ inputKey, operationGroupIndex }) =>
            inputKey === starAddress && operationGroupIndex > program.rollbackGroupIndex,
        )
        .map(({ operationId }) => operationId),
    ),
  ];
  check('recoveryCoverageMismatch', 'recoveryReaders.present', true, readerIds.length > 0);
  check(
    'recoveryUseMismatch',
    'readerUses.identity',
    readerIds,
    source.readerUses.map(({ operationId }) => operationId),
  );
  check('recoveryReadMismatch', 'initialValue.known', true, knownStar(program.initialValue));
  let current = program.initialValue;
  let changedAttempt = false;
  for (const expectedGroup of program.groups) {
    const groupIndex = expectedGroup.groupIndex;
    const group = state.executionGroups[groupIndex];
    if (!group) continue;
    const rolledBack = groupIndex === program.rollbackGroupIndex;
    const groupStart = current;
    check(
      'recoveryRollbackMismatch',
      `group:${groupIndex}:outcome`,
      rolledBack ? 'rolledBack' : 'committed',
      group.outcome,
    );
    check(
      'recoveryRollbackMismatch',
      `group:${groupIndex}:proof`,
      rolledBack ? { battleStateRestored: true, damageInputRestored: true } : null,
      group.rollbackProof,
    );
    check(
      'recoveryRollbackMismatch',
      `group:${groupIndex}:issues`,
      rolledBack,
      group.issues.length > 0,
    );
    const sequences = program.operations.flatMap((operation, sequence) =>
      program.groupIndexes[sequence] === groupIndex ? [{ operation, sequence }] : [],
    );
    check(
      'recoveryIdentityMismatch',
      `group:${groupIndex}:mutations.identity`,
      sequences
        .filter(({ operation }) => starMutation(operation))
        .map(({ operation, sequence }) => ({
          operationId: operation.operationId,
          operationSequence: sequence,
          operationKind: operation.kind,
          stateAddress: starAddress,
        })),
      group.mutations.map(({ operationId, operationSequence, operationKind, stateAddress }) => ({
        operationId,
        operationSequence,
        operationKind,
        stateAddress,
      })),
    );
    for (const { operation, sequence } of sequences) {
      for (const [index, read] of state.inputQuantityReads
        .filter(({ operationSequence }) => operationSequence === sequence)
        .entries()) {
        if (read.inputKey !== starAddress) continue;
        check('recoveryReadMismatch', `read:${sequence}:${index}:value`, current, read.value);
        check(
          'recoveryReadMismatch',
          `read:${sequence}:${index}:known`,
          true,
          knownStar(read.value),
        );
      }
      const event = target.operationEvents[sequence];
      const projections = source.effects.filter(
        ({ operationId }) => operationId === operation.operationId,
      );
      check('recoveryUseMismatch', `operation:${sequence}:projectionCount`, 1, projections.length);
      const projection = projections[0];
      check(
        'recoveryUseMismatch',
        `operation:${sequence}:eventUse`,
        projection
          ? {
              projectionKey: projection.projectionKey,
              contributionId: projection.contributionId,
              outcome: projection.outcome,
              value: projection.valuePermille,
            }
          : null,
        event
          ? {
              projectionKey: event.projectionKey,
              contributionId: event.contributionId,
              outcome: event.projectionOutcome,
              value: event.projectionValuePermille,
            }
          : null,
      );
      if (rolledBack) {
        check(
          'recoveryRollbackMismatch',
          `operation:${sequence}:outcome`,
          'unsupported',
          event?.operationOutcome,
        );
        check(
          'recoveryRollbackMismatch',
          `operation:${sequence}:projection`,
          'unsupported',
          projection?.outcome,
        );
      }
      if (projection?.contributionId != null) {
        const contributions = source.effectiveContributions.contributions.filter(
          (item) =>
            item.operationId === operation.operationId &&
            item.contributionId === projection.contributionId,
        );
        check(
          'recoveryUseMismatch',
          `operation:${sequence}:contributionCount`,
          1,
          contributions.length,
        );
        check(
          'recoveryUseMismatch',
          `operation:${sequence}:contributionOutcome`,
          projection.outcome,
          contributions[0]?.executionOutcome,
        );
        if (rolledBack)
          check(
            'recoveryRollbackMismatch',
            `operation:${sequence}:effective`,
            false,
            contributions[0]?.effective,
          );
      }
      if (readerIds.includes(operation.operationId)) {
        const use = source.readerUses.find(
          ({ operationId }) => operationId === operation.operationId,
        );
        check(
          'recoverySourceMismatch',
          `reader:${sequence}:observationReference`,
          true,
          use?.side.executionObservation === source.observation,
        );
        if (projection && calculation.executionObservation) {
          const expectedUse = userControlSideObservation(
            projection,
            calculation,
            calculation.executionObservation,
          );
          check('recoveryUseMismatch', `reader:${sequence}:use`, expectedUse, use?.side);
        }
      }
      for (const mutation of group.mutations.filter(
        ({ operationSequence }) => operationSequence === sequence,
      )) {
        check('recoveryReceiptMismatch', `mutation:${sequence}:before`, current, mutation.before);
        check(
          'recoveryReceiptMismatch',
          `mutation:${sequence}:known`,
          true,
          knownStar(mutation.before) &&
            knownStar(mutation.attemptedAfter) &&
            knownStar(mutation.afterTransaction),
        );
        check(
          'recoveryRollbackMismatch',
          `mutation:${sequence}:afterTransaction`,
          rolledBack ? groupStart : mutation.attemptedAfter,
          mutation.afterTransaction,
        );
        if (rolledBack && mutation.before !== mutation.attemptedAfter) changedAttempt = true;
        current = mutation.attemptedAfter;
      }
    }
    if (rolledBack) current = groupStart;
  }
  check('recoveryRollbackMismatch', 'changedAttempt.present', true, changedAttempt);
}

function knownStar(value: number | null): boolean {
  return Number.isSafeInteger(value) && value !== null && value >= 0 && value <= 99;
}

/** A passed diagnostic certifies the expected unsupported product execution, never calculated damage. */
export function auditCriticalStarsRecoveryObservations(input: {
  expected: readonly CriticalStarsRecoveryProgram[];
  observations: readonly (CriticalStarsRecoverySource | undefined)[];
}): CriticalStarsRecoveryGate {
  const failures: CriticalStarsRecoveryFailure[] = [];
  const expected = input.expected.map(({ canonicalIdentity }) => canonicalIdentity);
  const actual = input.observations.map((source) =>
    source && record(source.program) ? source.program.canonicalIdentity : 'missing-source',
  );
  if (
    !equal(expected, actual) ||
    new Set(expected).size !== expected.length ||
    expected.length === 0
  ) {
    const identity = 'tsk-08:critical-stars-recovery:coverage';
    const wanted = { identities: expected, contractUnique: true, contractNonempty: true };
    const observed = {
      identities: actual,
      contractUnique: new Set(expected).size === expected.length,
      contractNonempty: expected.length > 0,
    };
    failures.push({
      reason: 'recoveryCoverageMismatch',
      checkPath: 'coverage',
      canonicalIdentity: identity,
      expected: wanted,
      actual: observed,
      firstDifference: firstCanonicalAuditDifference(
        [{ identity, value: wanted }],
        [{ identity, value: observed }],
      )!,
    });
  }
  for (const [index, program] of input.expected.entries())
    auditRecovery(program, input.observations[index], failures);
  const common = { canonicalIdentity: 'tsk-08:critical-stars-recovery' as const, expected, actual };
  return failures.length > 0
    ? { ...common, status: 'failed', failures, firstDifference: failures[0]!.firstDifference }
    : { ...common, status: 'passed', failures: [], firstDifference: null };
}
