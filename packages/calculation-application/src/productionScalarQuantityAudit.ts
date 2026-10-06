import { noblePhantasmVariantKey, type MasterDataSnapshot } from '@fgo-lab/master-data';
import type { BattleOperation, OrderedCandidateStateAudit } from '@fgo-lab/battle-execution';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
  type CanonicalAuditDifference,
} from '@fgo-lab/master-data/production-audit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';
import { transactionIdentity } from './productionCriticalStarsAudit';

type Calculation = Extract<CalculationExecution, { status: 'executable' }>;
type Prepared = Extract<PreparedCalculationScenario, { status: 'executable' }>;
type Consumption = OrderedCandidateStateAudit['scalarNpConsumptions'][number];
const address = 'quantity:battlePointPhase';
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** A call owns its converted graph; shared native data is converted once, without dropping fields. */
export function createScalarQuantitySnapshotter() {
  const converted = new WeakMap<object, CanonicalAuditValue>();
  const ancestors = new WeakSet<object>();
  const visit = (item: unknown): CanonicalAuditValue => {
    if (item === undefined) return { kind: 'absent' };
    if (item === null || typeof item !== 'object') return item as CanonicalAuditValue;
    if (ancestors.has(item)) throw new TypeError('cyclic_scalar_quantity_audit_value');
    const prior = converted.get(item);
    if (prior !== undefined) return prior;
    ancestors.add(item);
    try {
      const result: CanonicalAuditValue =
        item instanceof Set
          ? [...item].map(visit)
          : item instanceof Map
            ? [...item].map(([key, child]) => [visit(key), visit(child)])
            : Array.isArray(item)
              ? item.map(visit)
              : Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
      converted.set(item, result);
      return result;
    } finally {
      ancestors.delete(item);
    }
  };
  return visit;
}

function snapshot(value: unknown): CanonicalAuditValue {
  return createScalarQuantitySnapshotter()(value);
}

export { snapshot as scalarQuantitySnapshot };
const equal = (left: unknown, right: unknown) =>
  JSON.stringify(snapshot(left)) === JSON.stringify(snapshot(right));
export type ScalarQuantityBoundary = 'committed' | 'notRelevant' | 'nullScalar';
export interface ScalarQuantityProgram {
  canonicalIdentity: string;
  boundary: ScalarQuantityBoundary;
  prepared: Prepared;
  calculation: Calculation;
  operations: readonly BattleOperation[];
  writers: readonly {
    operationId: string;
    operationSequence: number;
    operationGroupIndex: number;
  }[];
  readers: readonly {
    operationId: string;
    operationSequence: number;
    operationGroupIndex: number;
  }[];
  groups: readonly {
    groupIndex: number;
    transactionIdentity: ReturnType<typeof transactionIdentity>;
    operationIds: readonly string[];
  }[];
  initialValue: number | null;
  canonical: CanonicalAuditValue;
  contract: CanonicalAuditValue;
  receipts: readonly CanonicalAuditValue[];
  owner: CanonicalAuditValue;
  references: {
    observation: Calculation['executionObservation'];
    target: NonNullable<Calculation['executionObservation']>['targetExecution'] | undefined;
    state: OrderedCandidateStateAudit | undefined;
    input: Calculation['input'];
    effects: Calculation['effects'];
    contributions: Calculation['effectiveContributions'];
    result: Calculation['result'];
    groups: readonly unknown[];
    events: readonly unknown[];
    reads: readonly Consumption[];
    mutations: readonly unknown[];
    effectMembers: readonly unknown[];
    contributionMembers: readonly unknown[];
  };
}
export interface ScalarQuantitySource {
  program: ScalarQuantityProgram;
  calculation: Calculation;
  observation: Calculation['executionObservation'];
  input: Calculation['input'];
  effects: Calculation['effects'];
  effectiveContributions: Calculation['effectiveContributions'];
  result: Calculation['result'];
  readerUses: readonly {
    operationId: string;
    events: readonly unknown[];
    projections: readonly unknown[];
    contributions: readonly unknown[];
    consumption: Consumption | undefined;
    input: Calculation['input'];
    result: Calculation['result'];
  }[];
}
function sourceIdentity(source: ScalarQuantitySource): string | null {
  const raw: unknown = source;
  return record(raw) && record(raw.program) && typeof raw.program.canonicalIdentity === 'string'
    ? raw.program.canonicalIdentity
    : null;
}
function canonical(prepared: Prepared) {
  return {
    operations: prepared.orderedScenario?.operations,
    scenario: prepared.scenario,
    targetResolution: prepared.orderedScenario?.targetResolution,
    initialValue: prepared.orderedScenario?.baseInput.battlePointPhase,
  };
}
function owner(source: Omit<ScalarQuantitySource, 'program' | 'readerUses'>) {
  return {
    observation: source.observation,
    input: source.input,
    effects: source.effects,
    contributions: source.effectiveContributions,
    result: source.result,
  };
}
/** Membership is derived before looking at events, mutation values or successful reads. */
export function scalarQuantityProgram(
  prepared: PreparedCalculationScenario,
  calculation: Calculation,
  boundary: ScalarQuantityBoundary = 'committed',
): ScalarQuantityProgram | null {
  if (prepared.status !== 'executable' || !prepared.orderedScenario) return null;
  const operations = prepared.orderedScenario.operations;
  if (!operations.some((operation) => operation.kind === 'addQuantity')) return null;
  const groups: ScalarQuantityProgram['groups'][number][] = [];
  const indexes = operations.map((operation) => {
    const identity = transactionIdentity(operation);
    if (!equal(groups.at(-1)?.transactionIdentity, identity))
      groups.push({ groupIndex: groups.length, transactionIdentity: identity, operationIds: [] });
    groups.at(-1)!.operationIds = [...groups.at(-1)!.operationIds, operation.operationId];
    return groups.length - 1;
  });
  const member = (operation: BattleOperation, operationSequence: number) => ({
    operationId: operation.operationId,
    operationSequence,
    operationGroupIndex: indexes[operationSequence]!,
  });
  const target = prepared.executionObservation?.targetExecution;
  const selected = target?.selection === 'selected' ? target : undefined;
  const state = selected?.candidateState;
  const source = {
    calculation,
    observation: calculation.executionObservation,
    input: calculation.input,
    effects: calculation.effects,
    effectiveContributions: calculation.effectiveContributions,
    result: calculation.result,
  };
  const writers = operations.flatMap((operation, sequence) =>
    operation.kind === 'addQuantity' ? [member(operation, sequence)] : [],
  );
  const readers = operations.flatMap((operation, sequence) =>
    operation.kind === 'executeNpDamage' && operation.damage.kind === 'battlePointPhase'
      ? [member(operation, sequence)]
      : [],
  );
  const initialValue = prepared.orderedScenario.baseInput.battlePointPhase;
  const canonicalIdentity = `tsk-08:scalar-quantity:${JSON.stringify(operations.filter((operation) => operation.kind === 'addQuantity').map(({ operationId }) => operationId))}`;
  return {
    contract: snapshot({
      canonicalIdentity,
      writers,
      readers,
      groups,
      boundary,
      initialValue,
    }),
    receipts: (state?.scalarNpConsumptions ?? []).map(snapshot),
    canonicalIdentity,
    boundary,
    prepared,
    calculation,
    operations,
    groups,
    writers: operations.flatMap((operation, sequence) =>
      operation.kind === 'addQuantity' ? [member(operation, sequence)] : [],
    ),
    readers: operations.flatMap((operation, sequence) =>
      operation.kind === 'executeNpDamage' && operation.damage.kind === 'battlePointPhase'
        ? [member(operation, sequence)]
        : [],
    ),
    initialValue: prepared.orderedScenario.baseInput.battlePointPhase,
    canonical: snapshot(canonical(prepared)),
    owner: snapshot(owner(source)),
    references: {
      observation: source.observation,
      target,
      state,
      input: source.input,
      effects: source.effects,
      contributions: source.effectiveContributions,
      result: source.result,
      groups: [...(state?.executionGroups ?? [])],
      events: [...(selected?.operationEvents ?? [])],
      reads: [...(state?.scalarNpConsumptions ?? [])],
      mutations: state?.executionGroups.flatMap((group) => group.mutations) ?? [],
      effectMembers: [...source.effects],
      contributionMembers: [...source.effectiveContributions.contributions],
    },
  };
}
export function scalarQuantitySource(program: ScalarQuantityProgram): ScalarQuantitySource {
  const calculation = program.calculation;
  const target = calculation.executionObservation?.targetExecution;
  const selected = target?.selection === 'selected' ? target : undefined;
  return {
    program,
    calculation,
    observation: calculation.executionObservation,
    input: calculation.input,
    effects: calculation.effects,
    effectiveContributions: calculation.effectiveContributions,
    result: calculation.result,
    readerUses: program.readers.map(({ operationId }) => ({
      operationId,
      events: selected?.operationEvents.filter((event) => event.operationId === operationId) ?? [],
      projections: calculation.effects.filter((effect) => effect.operationId === operationId),
      contributions: calculation.effectiveContributions.contributions.filter(
        (item) => item.operationId === operationId,
      ),
      consumption: selected?.candidateState?.scalarNpConsumptions.find(
        (read) => read.operationId === operationId,
      ),
      input: calculation.input,
      result: calculation.result,
    })),
  };
}
export type ScalarQuantityFailureReason =
  | 'scalarPopulationMismatch'
  | 'scalarSourceMismatch'
  | 'scalarTraceMissing'
  | 'scalarIdentityMismatch'
  | 'scalarCommitMismatch'
  | 'scalarOrderMismatch'
  | 'scalarValueMismatch'
  | 'scalarUseMismatch'
  | 'scalarOutcomeMismatch'
  | 'scalarRollbackMismatch';
export interface ScalarQuantityFailure {
  reason: ScalarQuantityFailureReason;
  checkPath: string;
  canonicalIdentity: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
}
export interface ScalarQuantityGate {
  canonicalIdentity: 'tsk-08:scalar-quantity';
  status: 'passed' | 'failed';
  expected: readonly string[];
  actual: readonly (string | null)[];
  failures: readonly ScalarQuantityFailure[];
  firstDifference: CanonicalAuditDifference | null;
  committedMutations: number;
  consumptions: number;
}
/** Recovery expectations come from the original canonical failure operation, not trace outcomes. */
export interface ScalarQuantityRecoveryContract {
  failedGroupIndex: number;
  failedOperation: BattleOperation;
  issue: { kind: 'unsupportedOperation'; operationId: string; detail: string };
  snapshot: CanonicalAuditValue;
}
export function auditScalarQuantityObservations(input: {
  expected: readonly ScalarQuantityProgram[];
  observations: readonly ScalarQuantitySource[];
}): ScalarQuantityGate {
  return auditScalarQuantityContract(input);
}

/** Comparison of authoritative receipts only: no mutation, condition, clamp or damage replay. */
export function auditScalarQuantityContract(
  input: {
    expected: readonly ScalarQuantityProgram[];
    observations: readonly ScalarQuantitySource[];
  },
  recovery?: ScalarQuantityRecoveryContract,
): ScalarQuantityGate {
  const failures: ScalarQuantityFailure[] = [];
  let committedMutations = 0;
  let consumptions = 0;
  const check = (
    identity: string,
    reason: ScalarQuantityFailureReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => {
    if (equal(expected, actual)) return;
    const wanted = snapshot(expected);
    const observed = snapshot(actual);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: wanted }],
      [{ identity, value: observed }],
    );
    failures.push({
      reason,
      checkPath: path,
      canonicalIdentity: identity,
      expected: wanted,
      actual: observed,
      firstDifference: {
        identity,
        path: difference?.path ? `${path}.${difference.path}` : path,
        expected: difference?.expected,
        actual: difference?.actual,
      },
    });
  };
  const ids = input.expected.map(({ canonicalIdentity }) => canonicalIdentity);
  const actualIds = input.observations.map((source) => sourceIdentity(source));
  check('tsk-08:scalar-quantity', 'scalarPopulationMismatch', 'population', ids, actualIds);
  check(
    'tsk-08:scalar-quantity',
    'scalarPopulationMismatch',
    'population.unique',
    ids.length,
    new Set(ids).size,
  );
  for (const program of input.expected) {
    const c = (
      reason: ScalarQuantityFailureReason,
      path: string,
      expected: unknown,
      actual: unknown,
    ) => check(program.canonicalIdentity, reason, path, expected, actual);
    const sources = input.observations.filter(
      (source) => sourceIdentity(source) === program.canonicalIdentity,
    );
    c('scalarPopulationMismatch', 'source.count', 1, sources.length);
    const source = sources[0];
    if (!source) continue;
    const shape =
      record(source.calculation) &&
      record(source.input) &&
      record(source.result) &&
      Array.isArray(source.effects) &&
      source.effects.every(record) &&
      record(source.effectiveContributions) &&
      Array.isArray(source.effectiveContributions.contributions) &&
      source.effectiveContributions.contributions.every(record) &&
      Array.isArray(source.readerUses) &&
      source.readerUses.every(record);
    c('scalarTraceMissing', 'source.shape', true, shape);
    if (!shape) continue;
    c('scalarPopulationMismatch', 'program.contract', program.contract, {
      canonicalIdentity: program.canonicalIdentity,
      writers: program.writers,
      readers: program.readers,
      groups: program.groups,
      boundary: program.boundary,
      initialValue: program.initialValue,
    });
    c('scalarOutcomeMismatch', 'calculation.status', 'executable', source.calculation.status);
    const refs = program.references;
    c(
      'scalarSourceMismatch',
      'source.references',
      true,
      source.program === program &&
        source.calculation === program.calculation &&
        source.observation === refs.observation &&
        source.observation === program.prepared.executionObservation &&
        source.observation === source.calculation.executionObservation &&
        source.input === refs.input &&
        source.input === source.calculation.input &&
        source.input ===
          ('input' in program.prepared.resolved ? program.prepared.resolved.input : null) &&
        source.effects === program.prepared.resolved.effects &&
        source.effectiveContributions === program.prepared.resolved.effectiveContributions &&
        source.effects === refs.effects &&
        source.effects === source.calculation.effects &&
        source.effectiveContributions === refs.contributions &&
        source.effectiveContributions === source.calculation.effectiveContributions &&
        source.result === refs.result &&
        source.result === source.calculation.result &&
        source.calculation.scenario === program.prepared.scenario &&
        program.operations === program.prepared.orderedScenario?.operations,
    );
    c('scalarSourceMismatch', 'canonical.owner', program.canonical, canonical(program.prepared));
    const target = source.observation?.targetExecution;
    c('scalarTraceMissing', 'target.selection', 'selected', target?.selection);
    if (!target || target.selection !== 'selected') continue;
    c('scalarSourceMismatch', 'target.reference', true, target === refs.target);
    c(
      'scalarIdentityMismatch',
      'candidate.identity',
      program.prepared.orderedScenario?.targetResolution.kind === 'candidates'
        ? program.prepared.orderedScenario.targetResolution.candidates[target.candidateIndex]
        : null,
      target.targetCandidate,
    );
    const state = target.candidateState;
    c('scalarTraceMissing', 'state.present', true, state != null);
    if (!state) continue;
    const traceShape =
      Array.isArray(target.operationEvents) &&
      target.operationEvents.every(record) &&
      Array.isArray(state.executionGroups) &&
      state.executionGroups.every(
        (group) =>
          record(group) &&
          Array.isArray(group.mutations) &&
          group.mutations.every(record) &&
          Array.isArray(group.operationIds) &&
          Array.isArray(group.appliedOperationIds) &&
          Array.isArray(group.issues),
      ) &&
      Array.isArray(state.scalarNpConsumptions) &&
      state.scalarNpConsumptions.every(
        (read) => record(read) && record(read.evaluation) && record(read.input),
      );
    c('scalarTraceMissing', 'trace.shape', true, traceShape);
    if (!traceShape) continue;
    c(
      'scalarSourceMismatch',
      'trace.references',
      true,
      state === refs.state &&
        target.operationEvents.every((event, index) => event === refs.events[index]) &&
        state.executionGroups.every((group, index) => group === refs.groups[index]) &&
        state.scalarNpConsumptions.every((read, index) => read === refs.reads[index]) &&
        state.executionGroups
          .flatMap((group) => group.mutations)
          .every((mutation, index) => mutation === refs.mutations[index]),
    );
    c(
      'scalarIdentityMismatch',
      'groups.identity',
      program.groups,
      state.executionGroups.map(({ groupIndex, transactionIdentity: identity, operationIds }) => ({
        groupIndex,
        transactionIdentity: identity,
        operationIds,
      })),
    );
    c(
      'scalarOrderMismatch',
      'events.order',
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
    c(
      'scalarIdentityMismatch',
      'readers.identity',
      program.readers.map((reader) => ({ ...reader, stateAddress: address })),
      state.scalarNpConsumptions.map(
        ({ operationId, operationSequence, operationGroupIndex, stateAddress }) => ({
          operationId,
          operationSequence,
          operationGroupIndex,
          stateAddress,
        }),
      ),
    );
    let current = program.initialValue;
    let groupStart = current;
    let previousGroupIndex = -1;
    let changedRollbackAttempt = false;
    if (recovery) {
      c('scalarPopulationMismatch', 'recovery.contract', recovery.snapshot, {
        failedGroupIndex: recovery.failedGroupIndex,
        failedOperation: recovery.failedOperation,
        issue: recovery.issue,
      });
      c(
        'scalarSourceMismatch',
        'recovery.operationReference',
        true,
        program.operations.includes(recovery.failedOperation),
      );
      c(
        'scalarIdentityMismatch',
        'recovery.groupMembership',
        true,
        program.groups[recovery.failedGroupIndex]?.operationIds.includes(
          recovery.failedOperation.operationId,
        ),
      );
      c(
        'scalarPopulationMismatch',
        'recovery.readers',
        true,
        program.readers.length > 0 &&
          program.readers.every((reader) => reader.operationGroupIndex > recovery.failedGroupIndex),
      );
      c(
        'scalarPopulationMismatch',
        'recovery.writers',
        true,
        program.writers.some((writer) => writer.operationGroupIndex === recovery.failedGroupIndex),
      );
      c(
        'scalarOrderMismatch',
        'recovery.writerOrder',
        true,
        program.writers
          .filter((writer) => writer.operationGroupIndex === recovery.failedGroupIndex)
          .every(
            (writer) =>
              writer.operationSequence < program.operations.indexOf(recovery.failedOperation),
          ),
      );
      for (const expectedGroup of program.groups) {
        const group = state.executionGroups[expectedGroup.groupIndex];
        const failed = expectedGroup.groupIndex === recovery.failedGroupIndex;
        c(
          'scalarRollbackMismatch',
          `group.${expectedGroup.groupIndex}.transaction`,
          {
            outcome: failed ? 'rolledBack' : 'committed',
            issues: failed ? [recovery.issue] : [],
            rollbackProof: failed ? { battleStateRestored: true, damageInputRestored: true } : null,
          },
          group && {
            outcome: group.outcome,
            issues: group.issues,
            rollbackProof: group.rollbackProof,
          },
        );
        const operations = program.operations.filter((operation) =>
          expectedGroup.operationIds.includes(operation.operationId),
        );
        const scalarWriters = program.writers.filter(
          (writer) => writer.operationGroupIndex === expectedGroup.groupIndex,
        );
        c(
          'scalarIdentityMismatch',
          `group.${expectedGroup.groupIndex}.scalarMutations`,
          scalarWriters.map((writer) => writer.operationId),
          group?.mutations
            .filter((mutation) => mutation.stateAddress === address)
            .map((mutation) => mutation.operationId),
        );
        if (!failed) continue;
        c(
          'scalarOutcomeMismatch',
          'recovery.failedEvents',
          operations.map((operation) => ({
            operationId: operation.operationId,
            outcome: 'unsupported',
          })),
          target.operationEvents
            .filter((event) => expectedGroup.operationIds.includes(event.operationId))
            .map((event) => ({ operationId: event.operationId, outcome: event.operationOutcome })),
        );
        c(
          'scalarUseMismatch',
          'recovery.discardedContributions',
          true,
          source.effectiveContributions.contributions
            .filter(
              (item) => item.operationId && expectedGroup.operationIds.includes(item.operationId),
            )
            .every((item) => !item.effective),
        );
        c(
          'scalarUseMismatch',
          'recovery.discardedProjections',
          true,
          source.effects
            .filter(
              (item) => item.operationId && expectedGroup.operationIds.includes(item.operationId),
            )
            .every((item) => item.outcome === 'unsupported'),
        );
      }
      c(
        'scalarOutcomeMismatch',
        'recovery.resultRows',
        [],
        'rows' in source.result ? source.result.rows : null,
      );
    }
    for (const [sequence, operation] of program.operations.entries()) {
      const operationGroupIndex = recovery
        ? program.groups.findIndex((group) => group.operationIds.includes(operation.operationId))
        : -1;
      if (recovery && operationGroupIndex !== previousGroupIndex) {
        if (previousGroupIndex === recovery.failedGroupIndex) current = groupStart;
        groupStart = current;
        previousGroupIndex = operationGroupIndex;
      }
      const rolledBack = recovery && operationGroupIndex === recovery.failedGroupIndex;
      const writer = program.writers.find((item) => item.operationSequence === sequence);
      const reader = program.readers.find((item) => item.operationSequence === sequence);
      if (writer) {
        const group = state.executionGroups[writer.operationGroupIndex];
        const events = target.operationEvents.filter(
          (event) => event.operationId === operation.operationId,
        );
        c('scalarIdentityMismatch', `writer.${sequence}.event`, 1, events.length);
        const outcome = rolledBack
          ? 'unsupported'
          : program.boundary === 'notRelevant'
            ? 'notRelevant'
            : program.boundary === 'nullScalar'
              ? 'unsupported'
              : 'applied';
        c(
          'scalarOutcomeMismatch',
          `writer.${sequence}.outcome`,
          outcome,
          events[0]?.operationOutcome,
        );
        const mutations =
          group?.mutations.filter((mutation) => mutation.operationId === operation.operationId) ??
          [];
        c(
          'scalarTraceMissing',
          `writer.${sequence}.mutation.count`,
          program.boundary === 'notRelevant' ? 0 : 1,
          mutations.length,
        );
        if (program.boundary === 'nullScalar')
          c(
            'scalarOutcomeMismatch',
            `writer.${sequence}.missing`,
            true,
            group?.issues.some(
              (issue) =>
                issue.kind === 'unsupportedOperation' &&
                issue.operationId === operation.operationId &&
                issue.detail === 'quantity_missing:battlePointPhase',
            ),
          );
        if (!group || !mutations[0] || program.boundary !== 'committed') continue;
        if (!rolledBack)
          c(
            'scalarCommitMismatch',
            `writer.${sequence}.commit`,
            { outcome: 'committed', issues: [], rollbackProof: null, applied: true },
            {
              outcome: group.outcome,
              issues: group.issues,
              rollbackProof: group.rollbackProof,
              applied: group.appliedOperationIds.includes(operation.operationId),
            },
          );
        const mutation = mutations[0];
        c(
          'scalarIdentityMismatch',
          `writer.${sequence}.identity`,
          {
            operationId: operation.operationId,
            operationSequence: sequence,
            operationKind: 'addQuantity',
            stateAddress: address,
          },
          {
            operationId: mutation.operationId,
            operationSequence: mutation.operationSequence,
            operationKind: mutation.operationKind,
            stateAddress: mutation.stateAddress,
          },
        );
        c('scalarValueMismatch', `writer.${sequence}.before`, current, mutation.before);
        c(
          rolledBack ? 'scalarRollbackMismatch' : 'scalarCommitMismatch',
          `writer.${sequence}.after`,
          rolledBack ? groupStart : mutation.attemptedAfter,
          mutation.afterTransaction,
        );
        if (rolledBack) {
          c(
            'scalarRollbackMismatch',
            `writer.${sequence}.attemptApplied`,
            true,
            group.appliedOperationIds.includes(operation.operationId),
          );
          const originalGroup = (program.owner as Record<string, CanonicalAuditValue>)
            .observation as Record<string, CanonicalAuditValue>;
          const originalTarget = originalGroup.targetExecution as Record<
            string,
            CanonicalAuditValue
          >;
          const originalState = originalTarget.candidateState as Record<
            string,
            CanonicalAuditValue
          >;
          const originalGroups = originalState.executionGroups as Record<
            string,
            CanonicalAuditValue
          >[];
          const originalMutations = originalGroups[operationGroupIndex]!.mutations as Record<
            string,
            CanonicalAuditValue
          >[];
          c(
            'scalarValueMismatch',
            `writer.${sequence}.receipt`,
            originalMutations.find((item) => item.operationId === operation.operationId),
            mutation,
          );
          if (
            mutation.before !== mutation.attemptedAfter &&
            mutation.attemptedAfter !== mutation.afterTransaction
          )
            changedRollbackAttempt = true;
          current = mutation.attemptedAfter;
        } else if (group.outcome === 'committed') {
          current = mutation.afterTransaction;
          committedMutations++;
        }
      }
      if (reader) {
        const reads = state.scalarNpConsumptions.filter(
          (read) => read.operationId === operation.operationId,
        );
        const read = reads[0];
        c('scalarTraceMissing', `reader.${sequence}.count`, 1, reads.length);
        if (!read) continue;
        const readerGroup = state.executionGroups[reader.operationGroupIndex];
        c(
          'scalarCommitMismatch',
          `reader.${sequence}.commit`,
          { outcome: 'committed', issues: [], rollbackProof: null },
          readerGroup && {
            outcome: readerGroup.outcome,
            issues: readerGroup.issues,
            rollbackProof: readerGroup.rollbackProof,
          },
        );
        c(
          'scalarOutcomeMismatch',
          `reader.${sequence}.eventOutcome`,
          'applied',
          target.operationEvents.find((event) => event.operationId === operation.operationId)
            ?.operationOutcome,
        );
        c(
          'scalarValueMismatch',
          `reader.${sequence}.receipt`,
          program.receipts[program.readers.indexOf(reader)],
          read,
        );
        c(
          'scalarUseMismatch',
          `reader.${sequence}.producedInput`,
          {
            npMultipliers: read.input.npMultipliers,
            npSpecialMultipliers: read.input.npSpecialMultipliers,
            damageFunction: read.input.damageFunction,
          },
          {
            npMultipliers: source.input.npMultipliers,
            npSpecialMultipliers: source.input.npSpecialMultipliers,
            damageFunction: source.input.damageFunction,
          },
        );
        c('scalarValueMismatch', `reader.${sequence}.value`, current, read.value);
        c(
          'scalarOutcomeMismatch',
          `reader.${sequence}.disposition`,
          program.boundary === 'nullScalar' ? 'missing' : 'consumed',
          read.disposition,
        );
        c(
          'scalarOutcomeMismatch',
          `reader.${sequence}.evaluation`,
          program.boundary === 'nullScalar' ? 'unsupported' : 'resolved',
          read.evaluation.status,
        );
        if (read.evaluation.status === 'resolved')
          c(
            'scalarUseMismatch',
            `reader.${sequence}.input`,
            {
              npMultipliers: read.evaluation.npMultipliers,
              npSpecialMultipliers: read.evaluation.npSpecialMultipliers,
            },
            {
              npMultipliers: source.input.npMultipliers,
              npSpecialMultipliers: source.input.npSpecialMultipliers,
            },
          );
        else
          c(
            'scalarOutcomeMismatch',
            `reader.${sequence}.missing`,
            'missing_battle_point_phase',
            read.evaluation.missingEvidence,
          );
        if (read.disposition === 'consumed' && read.evaluation.status === 'resolved')
          consumptions++;
      }
    }
    c(
      'scalarUseMismatch',
      'use.identity',
      program.readers.map(({ operationId }) => operationId),
      source.readerUses.map((use) => use.operationId),
    );
    for (const [index, reader] of program.readers.entries()) {
      const use = source.readerUses[index];
      if (!use) continue;
      const read = state.scalarNpConsumptions.find(
        (item) => item.operationId === reader.operationId,
      );
      c(
        'scalarSourceMismatch',
        `use.${index}.references`,
        true,
        use.consumption === read && use.input === source.input && use.result === source.result,
      );
      c(
        'scalarUseMismatch',
        `use.${index}.events`,
        target.operationEvents.filter((event) => event.operationId === reader.operationId),
        use.events,
      );
      c(
        'scalarUseMismatch',
        `use.${index}.projections`,
        source.effects.filter((effect) => effect.operationId === reader.operationId),
        use.projections,
      );
      c(
        'scalarUseMismatch',
        `use.${index}.contributions`,
        source.effectiveContributions.contributions.filter(
          (item) => item.operationId === reader.operationId,
        ),
        use.contributions,
      );
      const projections = source.effects.filter(
        (effect) => effect.operationId === reader.operationId,
      );
      const events = target.operationEvents.filter(
        (event) => event.operationId === reader.operationId,
      );
      c('scalarUseMismatch', `use.${index}.projectionCount`, 1, projections.length);
      c('scalarUseMismatch', `use.${index}.eventCount`, 1, events.length);
      c(
        'scalarUseMismatch',
        `use.${index}.projectionBinding`,
        {
          projectionKey: events[0]?.projectionKey,
          contributionId: events[0]?.contributionId,
          outcome: events[0]?.projectionOutcome,
        },
        {
          projectionKey: projections[0]?.projectionKey,
          contributionId: projections[0]?.contributionId,
          outcome: projections[0]?.outcome,
        },
      );
      const contributions = source.effectiveContributions.contributions.filter(
        (item) => item.operationId === reader.operationId,
      );
      c(
        'scalarUseMismatch',
        `use.${index}.components`,
        ['npBase', 'npSpecial'],
        contributions.map((item) => item.component),
      );
      c(
        'scalarIdentityMismatch',
        `use.${index}.contributionSource`,
        contributions.map(() => program.operations[reader.operationSequence]!.source),
        contributions.map((item) => item.source),
      );
      c(
        'scalarIdentityMismatch',
        `use.${index}.contributionIdentity`,
        true,
        new Set(contributions.map((item) => item.contributionId)).size === contributions.length &&
          contributions.find((item) => item.component === 'npBase')?.contributionId ===
            projections[0]?.contributionId,
      );
      if (program.boundary === 'committed')
        c(
          'scalarUseMismatch',
          `use.${index}.effective`,
          [true, true],
          contributions.map((item) => item.effective),
        );
    }
    c(
      'scalarUseMismatch',
      'use.memberReferences',
      true,
      source.effects.every((effect, index) => effect === refs.effectMembers[index]) &&
        source.effectiveContributions.contributions.every(
          (item, index) => item === refs.contributionMembers[index],
        ),
    );
    // Owner snapshots detect in-place corruption as well as detached transport replacement.
    const observed = owner(source);
    const ownerRecord = program.owner as Record<string, CanonicalAuditValue>;
    c(
      'scalarIdentityMismatch',
      'candidate.owner',
      (ownerRecord.observation as Record<string, CanonicalAuditValue>).targetExecution &&
        (
          (ownerRecord.observation as Record<string, CanonicalAuditValue>)
            .targetExecution as Record<string, CanonicalAuditValue>
        ).candidateIndex,
      target.candidateIndex,
    );
    for (const key of ['observation', 'input', 'effects', 'contributions', 'result'] as const)
      c(
        key === 'result' ? 'scalarOutcomeMismatch' : 'scalarUseMismatch',
        `owner.${key}`,
        ownerRecord[key],
        observed[key],
      );
    c(
      'scalarOutcomeMismatch',
      'result.status',
      recovery || program.boundary === 'nullScalar' ? 'unsupported' : 'calculated',
      source.result.status,
    );
    if (recovery) c('scalarValueMismatch', 'recovery.changed', true, changedRollbackAttempt);
    if (!recovery && program.boundary === 'committed') {
      c('scalarPopulationMismatch', 'committed.readers', true, program.readers.length > 0);
      c(
        'scalarValueMismatch',
        'committed.changed',
        true,
        state.executionGroups.some(
          (group) =>
            group.outcome === 'committed' &&
            group.mutations.some(
              (mutation) =>
                mutation.stateAddress === address && mutation.before !== mutation.afterTransaction,
            ),
        ),
      );
    }
  }
  return {
    canonicalIdentity: 'tsk-08:scalar-quantity',
    status: failures.length ? 'failed' : 'passed',
    expected: ids,
    actual: actualIds,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
    committedMutations,
    consumptions,
  };
}

/** Published canonical population is independent of captured success and fixture population. */
export function scalarQuantityCanonicalInventory(master: MasterDataSnapshot) {
  const sources = [
    ...master.servants.flatMap((servant) => [
      ...[...servant.skills, ...servant.passives].map((skill) => ({
        ownerId: servant.id,
        sourceId: skill.id,
        effects: skill.effects,
      })),
      ...servant.noblePhantasmVariantGroups.flatMap((group) =>
        group.variants.map((variant) => ({
          ownerId: servant.id,
          sourceId: `np:${noblePhantasmVariantKey(variant.ref)}`,
          effects: variant.effects,
        })),
      ),
    ]),
    ...master.craftEssences.map((ce) => ({ ownerId: ce.id, sourceId: ce.id, effects: ce.effects })),
    ...master.mysticCodes.flatMap((code) =>
      code.skills.map((skill) => ({
        ownerId: code.id,
        sourceId: skill.id,
        effects: skill.effects,
      })),
    ),
  ];
  return sources.flatMap(({ ownerId, sourceId, effects }) =>
    effects.flatMap((effect) =>
      effect.execution.flatMap((semantic, semanticIndex) =>
        semantic.kind === 'contextMutation' && semantic.mutation === 'addQuantity'
          ? [
              {
                ownerId,
                sourceId,
                effectOccurrenceId: effect.occurrenceId,
                semanticIndex,
                semantic,
              },
            ]
          : [],
      ),
    ),
  );
}
export function auditPublishedScalarQuantityObservations(
  inventory: ReturnType<typeof scalarQuantityCanonicalInventory>,
  observations: readonly ScalarQuantitySource[],
) {
  const programs = observations.map(({ program }) => program);
  const gate = auditScalarQuantityObservations({ expected: programs, observations });
  const expected = [
    ...new Set(
      inventory.map((item) => `${item.ownerId}:${item.sourceId}:${item.effectOccurrenceId}`),
    ),
  ].sort();
  const actual = [
    ...new Set(
      programs.flatMap((program) =>
        program.writers.map(({ operationSequence }) => {
          const source = program.operations[operationSequence]!.source;
          return `${source.sourceId}:${source.skillId}:${source.effectOccurrenceId}`;
        }),
      ),
    ),
  ].sort();
  const difference = firstCanonicalAuditDifference(
    [{ identity: 'published-scalar-writers', value: expected }],
    [{ identity: 'published-scalar-writers', value: actual }],
  );
  return {
    population: 'published-master' as const,
    inventory,
    expected,
    actual,
    gate,
    status:
      gate.status === 'passed' && difference === null ? ('passed' as const) : ('failed' as const),
    firstDifference: difference ?? gate.firstDifference,
  };
}
