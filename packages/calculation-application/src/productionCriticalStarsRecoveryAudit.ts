import type {
  OrderedExecutionAuditObservation,
  OrderedExecutionGroupAuditEvent,
  OrderedScenarioExecution,
  EffectProjection,
} from '@fgo-lab/battle-execution';
import type { MasterEffect } from '@fgo-lab/master-data';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';
import type { RejectedCalculationDiagnostic } from './scenario';
import type {
  PreparationActionExecution,
  PreparationSourceExecution,
} from '@fgo-lab/battle-execution';
import { inputQuantityLeaves, transactionIdentity } from './productionCriticalStarsAudit';
import { diagnosticUserControlSideObservation } from './productionUserControlObservation';
import type { ProductionUserControlSideObservation } from './productionParityDiagnostics';

const starAddress = 'battle:criticalStars';
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function physicalValue(
  value: unknown,
  copies = new WeakMap<object, CanonicalAuditValue>(),
): CanonicalAuditValue {
  if (value === undefined) return { kind: 'absent' };
  if (value === null || typeof value !== 'object') return value as CanonicalAuditValue;
  const cached = copies.get(value);
  if (cached !== undefined) return cached;
  // One lossless transport may reach the same immutable receipt through many paths.
  // The map belongs to this call; a later corrupted live observation gets a fresh view.
  let result: CanonicalAuditValue;
  if (value instanceof Map)
    result = {
      kind: 'map',
      entries: [...value].map(([key, item]) => [
        physicalValue(key, copies),
        physicalValue(item, copies),
      ]),
    };
  else if (value instanceof Set)
    result = { kind: 'set', values: [...value].map((item) => physicalValue(item, copies)) };
  else if (Array.isArray(value)) result = value.map((item) => physicalValue(item, copies));
  else
    result = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, physicalValue(item, copies)]),
    );
  copies.set(value, result);
  return result;
}

/** Compare the lossless physical view without allocating every unchanged subtree. */
function physicalDifference(
  left: unknown,
  right: unknown,
  path = '$',
  equalPairs = new WeakMap<object, WeakSet<object>>(),
): {
  path: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
} | null {
  if (left === right) return null;
  const pair =
    left !== null && typeof left === 'object' && right !== null && typeof right === 'object';
  if (pair && equalPairs.get(left)?.has(right)) return null;
  const complete = () => {
    if (pair) {
      const rights = equalPairs.get(left) ?? new WeakSet();
      rights.add(right);
      equalPairs.set(left, rights);
    }
    return null;
  };
  const view = (value: unknown): unknown => {
    if (value === undefined) return { kind: 'absent' };
    if (value instanceof Map) return { kind: 'map', entries: [...value] };
    if (value instanceof Set) return { kind: 'set', values: [...value] };
    return value;
  };
  const wanted = view(left);
  const observed = view(right);
  const mismatch = (expected: unknown, actual: unknown) => ({
    path,
    expected: physicalValue(expected),
    actual: physicalValue(actual),
  });
  if (Array.isArray(wanted) && Array.isArray(observed)) {
    if (wanted.length !== observed.length) return mismatch(wanted.length, observed.length);
    for (let index = 0; index < wanted.length; index++) {
      const difference = physicalDifference(
        wanted[index],
        observed[index],
        `${path}[${index}]`,
        equalPairs,
      );
      if (difference) return difference;
    }
    return complete();
  }
  if (record(wanted) && record(observed)) {
    const keys = Object.keys(wanted);
    if (!equal(keys, Object.keys(observed))) return mismatch(keys, Object.keys(observed));
    for (const key of keys) {
      const difference = physicalDifference(
        wanted[key],
        observed[key],
        `${path}.${key}`,
        equalPairs,
      );
      if (difference) return difference;
    }
    return complete();
  }
  return mismatch(wanted, observed);
}

function recoveryCanonical(
  prepared: Extract<PreparedCalculationScenario, { status: 'rejected' }>,
  diagnostic: RejectedCalculationDiagnostic,
) {
  return {
    scenario: prepared.scenario,
    master: prepared.master,
    operations: diagnostic.orderedScenario.operations,
    targetResolution: diagnostic.orderedScenario.targetResolution,
    inputs: diagnostic.canonicalInputs,
  };
}

export interface SourceActionRecoveryProgram {
  readonly canonicalIdentity: string;
  readonly prepared: Extract<PreparedCalculationScenario, { status: 'rejected' }>;
  readonly calculation: Extract<CalculationExecution, { status: 'rejected' }>;
  readonly diagnostic: RejectedCalculationDiagnostic;
  readonly canonical: CanonicalAuditValue;
  readonly receipt: CanonicalAuditValue;
  readonly actionReferences: readonly PreparationActionExecution[];
  readonly sourceReferences: readonly PreparationSourceExecution[];
  readonly nativeReads: readonly PreparationSourceExecution['binding']['conditionReads'][number][];
  readonly ownerReferences: readonly { path: string; value: unknown }[];
  readonly failedSource: PreparationSourceExecution;
  readonly readerIds: readonly string[];
  readonly owner: {
    readonly input: OrderedScenarioExecution['input'];
    readonly effects: readonly EffectProjection[];
    readonly effectiveContributions: OrderedScenarioExecution['effectiveContributions'];
    readonly result: CalculationExecution['result'];
    readonly observation: RejectedCalculationDiagnostic['executionObservation'];
  };
  readonly useReceipt: CanonicalAuditValue;
  readonly target: {
    readonly index: number;
    readonly value: CanonicalAuditValue;
    readonly reference: unknown;
  };
}

export interface SourceActionRecoveryObservation {
  readonly program: SourceActionRecoveryProgram;
  readonly calculation: SourceActionRecoveryProgram['calculation'];
  readonly diagnostic: RejectedCalculationDiagnostic;
  readonly normalActions: readonly PreparationActionExecution[];
  readonly diagnosticActions: readonly PreparationActionExecution[];
  readonly input: SourceActionRecoveryProgram['owner']['input'];
  readonly effects: SourceActionRecoveryProgram['owner']['effects'];
  readonly effectiveContributions: SourceActionRecoveryProgram['owner']['effectiveContributions'];
  readonly result: SourceActionRecoveryProgram['owner']['result'];
  readonly observation: SourceActionRecoveryProgram['owner']['observation'];
  readonly readerUses: readonly {
    operationId: string;
    side: ProductionUserControlSideObservation;
  }[];
  readonly nativeReads: SourceActionRecoveryProgram['nativeReads'];
}

function sourceActionReceipt(diagnostic: RejectedCalculationDiagnostic) {
  return {
    normalActions: diagnostic.normalActions,
    preparation: diagnostic.preparation,
    input: diagnostic.execution.input,
    projections: diagnostic.execution.projections,
    contributions: diagnostic.execution.effectiveContributions,
    observation: diagnostic.executionObservation,
  };
}

function sourceActionReferences(diagnostic: RejectedCalculationDiagnostic) {
  const references: { path: string; value: unknown }[] = [];
  const capture = (path: string, value: unknown) => references.push({ path, value });
  capture('preparation', diagnostic.preparation);
  capture('restored', diagnostic.preparation.restored);
  capture('commands', diagnostic.preparation.commands);
  capture('normalActions', diagnostic.normalActions);
  capture('diagnosticActions', diagnostic.preparation.transitions);
  capture('orderedScenario', diagnostic.orderedScenario);
  capture('canonicalInputs', diagnostic.canonicalInputs);
  capture('execution', diagnostic.execution);
  capture('input', diagnostic.execution.input);
  capture('projections', diagnostic.execution.projections);
  diagnostic.execution.projections.forEach((projection, index) =>
    capture(`projection:${index}`, projection),
  );
  capture('contributions', diagnostic.execution.effectiveContributions);
  capture('contributionMembers', diagnostic.execution.effectiveContributions.contributions);
  diagnostic.execution.effectiveContributions.contributions.forEach((contribution, index) =>
    capture(`contribution:${index}`, contribution),
  );
  capture('observation', diagnostic.executionObservation);
  const target = diagnostic.executionObservation.targetExecution;
  capture('target', target);
  if (target?.selection === 'selected') {
    capture('targetCandidate', target.targetCandidate);
    capture('candidateState', target.candidateState);
    capture('events', target.operationEvents);
    target.operationEvents.forEach((event, index) => capture(`event:${index}`, event));
    capture('groups', target.candidateState?.executionGroups);
    target.candidateState?.executionGroups.forEach((group, index) => {
      capture(`group:${index}`, group);
      capture(`group:${index}:mutations`, group.mutations);
      group.mutations.forEach((mutation, mutationIndex) =>
        capture(`group:${index}:mutation:${mutationIndex}`, mutation),
      );
    });
    capture('reads', target.candidateState?.inputQuantityReads);
    target.candidateState?.inputQuantityReads.forEach((read, index) =>
      capture(`read:${index}`, read),
    );
  }
  const actions = [...diagnostic.normalActions, ...diagnostic.preparation.transitions];
  actions.forEach((action, actionIndex) => {
    const path = `action:${actionIndex}`;
    capture(`${path}:command`, action.command);
    capture(`${path}:before`, action.before);
    capture(`${path}:after`, action.state);
    capture(`${path}:sources`, action.sources);
    capture(`${path}:committedSources`, action.committedSources);
    action.sources.forEach((source, sourceIndex) => {
      const sourcePath = `${path}:source:${sourceIndex}`;
      capture(`${sourcePath}:canonical`, source.source);
      capture(`${sourcePath}:binding`, source.binding);
      capture(`${sourcePath}:activation`, source.binding.activation);
      capture(`${sourcePath}:reads`, source.binding.conditionReads);
      source.binding.conditionReads.forEach((read, index) =>
        capture(`${sourcePath}:read:${index}`, read),
      );
      capture(`${sourcePath}:transaction`, source.transaction);
      if (source.transaction) {
        capture(`${sourcePath}:before`, source.transaction.before);
        capture(`${sourcePath}:attempted`, source.transaction.attempted);
        if (source.transaction.kind !== 'rejected')
          capture(`${sourcePath}:after`, source.transaction.after);
      }
      capture(`${sourcePath}:restored`, source.restored);
      capture(`${sourcePath}:operations`, source.operations);
      source.operations.forEach((operation, operationIndex) => {
        const operationPath = `${sourcePath}:operation:${operationIndex}`;
        capture(operationPath, operation);
        capture(`${operationPath}:canonical`, operation.operation);
        capture(`${operationPath}:steps`, operation.steps);
        operation.steps.forEach((step, stepIndex) => {
          const stepPath = `${operationPath}:step:${stepIndex}`;
          capture(stepPath, step);
          capture(`${stepPath}:native`, step.native);
          capture(`${stepPath}:before`, step.before);
          capture(`${stepPath}:after`, step.after);
        });
      });
    });
  });
  return references;
}

/** Failure identity comes from the canonical fixture operation, never from an observed read. */
export function sourceActionRecoveryProgram(
  prepared: SourceActionRecoveryProgram['prepared'],
  calculation: SourceActionRecoveryProgram['calculation'],
  failedOperation: MasterEffect['execution'][number],
): SourceActionRecoveryProgram {
  const diagnostic = prepared.diagnosticExecution;
  if (!diagnostic || calculation.diagnosticExecution !== diagnostic)
    throw new TypeError('actual_source_action_diagnostic_required');
  const actionReferences = [...diagnostic.normalActions, ...diagnostic.preparation.transitions];
  const rejected = diagnostic.normalActions.at(-1);
  if (rejected?.status !== 'rejected') throw new TypeError('actual_rejected_action_required');
  const failures = rejected.sources.filter((source) =>
    source.operations.some(({ operation }) => operation === failedOperation),
  );
  if (failures.length !== 1 || failures[0]!.status !== 'rejected')
    throw new TypeError('canonical_failed_source_required');
  const failedSource = failures[0]!;
  const target = diagnostic.executionObservation.targetExecution;
  if (target?.selection !== 'selected') throw new TypeError('actual_selected_diagnostic_required');
  const owner = {
    input: diagnostic.execution.input,
    effects: [...diagnostic.execution.projections, ...diagnostic.execution.retainedProjections],
    effectiveContributions: diagnostic.execution.effectiveContributions,
    result: calculation.result,
    observation: diagnostic.executionObservation,
  };
  const readerIds = [
    ...new Set(
      diagnostic.orderedScenario.operations
        .filter((operation) =>
          inputQuantityLeaves(operation.condition).some(({ inputKey }) => inputKey === starAddress),
        )
        .map(({ operationId }) => operationId),
    ),
  ];
  return {
    canonicalIdentity: `production-audit:critical-stars-recovery:${JSON.stringify([
      failedSource.actionId,
      failedSource.source.origin,
      failedSource.source.sourceInstanceId,
      failedSource.source.effect.occurrenceId,
    ])}`,
    prepared,
    calculation,
    diagnostic,
    canonical: physicalValue(recoveryCanonical(prepared, diagnostic)),
    receipt: physicalValue(sourceActionReceipt(diagnostic)),
    actionReferences,
    sourceReferences: actionReferences.flatMap(({ sources }) => sources),
    nativeReads: actionReferences.flatMap(({ sources }) =>
      sources.flatMap(({ binding }) => binding.conditionReads),
    ),
    ownerReferences: sourceActionReferences(diagnostic),
    failedSource,
    readerIds,
    owner,
    useReceipt: physicalValue(owner),
    target: {
      index: target.candidateIndex,
      value: physicalValue(target.targetCandidate),
      reference: target.targetCandidate,
    },
  };
}

export function sourceActionRecoveryObservation(
  program: SourceActionRecoveryProgram,
): SourceActionRecoveryObservation {
  return {
    program,
    calculation: program.calculation,
    diagnostic: program.diagnostic,
    normalActions: program.diagnostic.normalActions,
    diagnosticActions: program.diagnostic.preparation.transitions,
    ...program.owner,
    nativeReads: program.nativeReads,
    readerUses: program.readerIds.flatMap((operationId) =>
      program.owner.effects
        .filter((projection) => projection.operationId === operationId)
        .map((projection) => ({
          operationId,
          side: diagnosticUserControlSideObservation(
            projection,
            program.calculation,
            program.diagnostic,
          ),
        })),
    ),
  };
}

export function auditSourceActionRecovery(
  program: SourceActionRecoveryProgram,
  source: SourceActionRecoveryObservation | undefined,
): CriticalStarsRecoveryGate {
  const failures: CriticalStarsRecoveryFailure[] = [];
  const check = (
    reason: CriticalStarsRecoveryFailureReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const difference = physicalDifference(expected, actual);
    if (!difference) return;
    const wanted = difference.expected;
    const observed = difference.actual;
    const identity = `${program.canonicalIdentity}:${path}:${difference.path}`;
    failures.push({
      reason,
      checkPath: path,
      canonicalIdentity: identity,
      expected: wanted,
      actual: observed,
      firstDifference: firstCanonicalAuditDifference(
        [{ identity, value: wanted }],
        [{ identity, value: observed }],
      )!,
    });
  };
  const finish = (): CriticalStarsRecoveryGate => {
    const common = {
      canonicalIdentity: 'production-audit:critical-stars-recovery' as const,
      expected: [program.canonicalIdentity],
      actual: source && record(source.program) ? [source.program.canonicalIdentity] : [],
    };
    return failures.length
      ? { ...common, status: 'failed', failures, firstDifference: failures[0]!.firstDifference }
      : { ...common, status: 'passed', failures: [], firstDifference: null };
  };
  check('recoveryCoverageMismatch', 'source.present', true, source !== undefined);
  if (!source) return finish();
  const shape = sourceActionRecoveryShape(source);
  check('recoveryTraceMissing', 'source.shape', true, shape);
  if (!shape) return finish();
  const actions = auditSourceActionOwner(program, source, check);
  auditDiagnosticRecoveryUse(program, source, check);
  auditSourceActionWrites(actions, check);
  return finish();
}

function sourceActionRecoveryShape(source: SourceActionRecoveryObservation): boolean {
  const array = (value: unknown): boolean => Array.isArray(value);
  const transactionShape = (execution: unknown): boolean => {
    if (!record(execution)) return false;
    if (execution.status === 'unreached')
      return execution.transaction === undefined && execution.restored === undefined;
    const transaction = execution.transaction;
    if (
      !record(transaction) ||
      !record(transaction.before) ||
      !(transaction.before.inputFacts instanceof Map) ||
      !record(transaction.before.ocState) ||
      !array(transaction.before.ocState.receipts) ||
      !record(transaction.attempted)
    )
      return false;
    if (execution.status === 'rejected')
      return (
        transaction.kind === 'rejected' &&
        record(transaction.rejection) &&
        record(execution.restored)
      );
    return (
      (execution.status === 'completed' || execution.status === 'rolledBack') &&
      (transaction.kind === 'committed' || transaction.kind === 'stochasticFailure') &&
      record(transaction.after) &&
      (execution.status === 'rolledBack'
        ? record(execution.restored)
        : execution.restored === undefined)
    );
  };
  const targetShape = (target: OrderedExecutionAuditObservation | null): boolean =>
    target === null ||
    (record(target) &&
      (target.selection !== 'selected' ||
        (array(target.operationEvents) &&
          (!target.candidateState ||
            (record(target.candidateState) &&
              array(target.candidateState.inputQuantityReads) &&
              array(target.candidateState.executionGroups) &&
              target.candidateState.executionGroups.every(
                (group) => record(group) && array(group.mutations),
              ))))));
  const actionShape = (action: PreparationActionExecution) =>
    record(action) &&
    record(action.before) &&
    action.before.inputFacts instanceof Map &&
    record(action.state) &&
    action.state.inputFacts instanceof Map &&
    array(action.sources) &&
    array(action.committedSources) &&
    action.sources.every(
      (execution) =>
        record(execution) &&
        record(execution.source) &&
        record(execution.source.effect) &&
        array(execution.source.effect.execution) &&
        record(execution.binding) &&
        record(execution.binding.activation) &&
        (execution.binding.activation.kind !== 'read' ||
          (record(execution.binding.activation.read) &&
            record(execution.binding.activation.read.clock))) &&
        array(execution.binding.conditionReads) &&
        execution.binding.conditionReads.every(record) &&
        Object.keys(execution).every((key) =>
          [
            'actionId',
            'source',
            'binding',
            'operations',
            'status',
            'transaction',
            'restored',
          ].includes(key),
        ) &&
        transactionShape(execution) &&
        array(execution.operations) &&
        execution.operations.every(
          (operation) =>
            record(operation) &&
            record(operation.operation) &&
            array(operation.steps) &&
            operation.steps.every(
              (step) =>
                record(step) &&
                record(step.native) &&
                record(step.before) &&
                step.before.inputFacts instanceof Map &&
                record(step.after) &&
                step.after.inputFacts instanceof Map,
            ),
        ),
    );
  return (
    record(source.calculation) &&
    record(source.calculation.result) &&
    record(source.input) &&
    array(source.effects) &&
    source.effects.every(record) &&
    record(source.effectiveContributions) &&
    array(source.effectiveContributions.contributions) &&
    record(source.result) &&
    record(source.observation) &&
    array(source.readerUses) &&
    array(source.nativeReads) &&
    source.nativeReads.every(record) &&
    source.readerUses.every((use) => record(use) && record(use.side)) &&
    targetShape(source.observation.targetExecution) &&
    record(source.diagnostic) &&
    record(source.diagnostic.preparation) &&
    record(source.diagnostic.preparation.restored) &&
    record(source.diagnostic.orderedScenario) &&
    record(source.diagnostic.orderedScenario.preparationExecution) &&
    record(source.diagnostic.execution) &&
    array(source.diagnostic.execution.projections) &&
    record(source.diagnostic.execution.effectiveContributions) &&
    array(source.diagnostic.execution.effectiveContributions.contributions) &&
    record(source.diagnostic.executionObservation) &&
    targetShape(source.diagnostic.executionObservation.targetExecution) &&
    array(source.diagnostic.normalActions) &&
    array(source.diagnostic.preparation.transitions) &&
    array(source.normalActions) &&
    source.normalActions.every(actionShape) &&
    array(source.diagnosticActions) &&
    source.diagnosticActions.every(actionShape)
  );
}

function auditSourceActionOwner(
  program: SourceActionRecoveryProgram,
  source: SourceActionRecoveryObservation,
  check: RecoveryCheck,
) {
  const ownerReferences = sourceActionReferences(source.diagnostic);
  check(
    'recoverySourceMismatch',
    'owner.references',
    true,
    ownerReferences.length === program.ownerReferences.length &&
      ownerReferences.every(
        ({ path, value }, index) =>
          path === program.ownerReferences[index]!.path &&
          value === program.ownerReferences[index]!.value,
      ),
  );
  check(
    'recoverySourceMismatch',
    'source.references',
    true,
    source.program === program &&
      source.calculation === program.calculation &&
      source.diagnostic === program.diagnostic &&
      source.diagnostic === program.prepared.diagnosticExecution &&
      source.diagnostic === source.calculation.diagnosticExecution &&
      source.normalActions === source.diagnostic.normalActions &&
      source.diagnosticActions === source.diagnostic.preparation.transitions &&
      source.input === source.diagnostic.execution.input &&
      source.input === program.owner.input &&
      source.effects === program.owner.effects &&
      source.effectiveContributions === source.diagnostic.execution.effectiveContributions &&
      source.effectiveContributions === program.owner.effectiveContributions &&
      source.result === source.calculation.result &&
      source.result === program.owner.result &&
      source.observation === source.diagnostic.executionObservation &&
      source.observation === program.owner.observation,
  );
  check(
    'recoverySourceMismatch',
    'canonical.ownerProgram',
    program.canonical,
    recoveryCanonical(program.prepared, program.diagnostic),
  );
  check('recoveryOutcomeMismatch', 'prepared.status', 'rejected', program.prepared.status);
  check(
    'recoveryOutcomeMismatch',
    'resolved.precision',
    'unsupported',
    program.prepared.resolved.precision,
  );
  check('recoveryOutcomeMismatch', 'calculation.status', 'rejected', source.calculation.status);
  check(
    'recoveryOutcomeMismatch',
    'result.status',
    'unsupported',
    source.calculation.result.status,
  );
  check('recoveryOutcomeMismatch', 'result.status', 'unsupported', source.result.status);
  check(
    'recoveryOutcomeMismatch',
    'result.rows',
    [],
    'rows' in source.calculation.result ? source.calculation.result.rows : null,
  );
  check(
    'recoveryOutcomeMismatch',
    'normal.orderedScenario',
    null,
    program.prepared.orderedScenario,
  );
  check(
    'recoveryOutcomeMismatch',
    'diagnostic.owner',
    'rejectedCalculationDiagnostic',
    source.diagnostic.kind,
  );
  check(
    'recoveryOutcomeMismatch',
    'diagnostic.preparationOwner',
    'diagnostic',
    source.diagnostic.orderedScenario.preparationExecution.kind,
  );
  const actions = [...source.normalActions, ...source.diagnosticActions];
  check(
    'recoveryOrderMismatch',
    'actions.identity',
    program.prepared.scenario.mode === 'resolved'
      ? program.prepared.scenario.preNoblePhantasmPlan
      : [],
    actions.map(({ command }) => command),
  );
  check('recoveryUseMismatch', 'use.ownerReceipt', program.useReceipt, {
    input: source.input,
    effects: source.effects,
    effectiveContributions: source.effectiveContributions,
    result: source.result,
    observation: source.observation,
  });
  check(
    'recoveryOutcomeMismatch',
    'result.rows',
    [],
    'rows' in source.result ? source.result.rows : null,
  );
  check(
    'recoverySourceMismatch',
    'actions.references',
    true,
    actions.length === program.actionReferences.length &&
      actions.every((action, index) => action === program.actionReferences[index]),
  );
  const sources = actions.flatMap(({ sources }) => sources);
  check(
    'recoveryOrderMismatch',
    'nativeReads.identity',
    program.nativeReads.map((_, index) => index),
    source.nativeReads.map((read) => program.nativeReads.indexOf(read)),
  );
  check(
    'recoverySourceMismatch',
    'sources.references',
    true,
    sources.length === program.sourceReferences.length &&
      sources.every((item, index) => item === program.sourceReferences[index]),
  );
  check(
    'recoveryReceiptMismatch',
    'receipt.owner',
    program.receipt,
    sourceActionReceipt(source.diagnostic),
  );
  const normalRejection = source.normalActions.at(-1);
  check('recoveryOutcomeMismatch', 'failed.sourceStatus', 'rejected', program.failedSource.status);
  check('recoveryRollbackMismatch', 'normal.rejectedAction', 'rejected', normalRejection?.status);
  if (normalRejection) {
    check(
      'recoveryRollbackMismatch',
      'normal.committedSources',
      [],
      normalRejection.committedSources,
    );
    check(
      'recoveryRollbackMismatch',
      'normal.restoredState',
      normalRejection.before,
      normalRejection.state,
    );
    check(
      'recoveryRollbackMismatch',
      'diagnostic.restoredState',
      normalRejection.state,
      source.diagnostic.preparation.restored,
    );
    check(
      'recoveryRollbackMismatch',
      'diagnostic.nonAlias',
      true,
      source.diagnostic.preparation.restored !== normalRejection.state &&
        source.diagnostic.preparation.restored.inputFacts !== normalRejection.state.inputFacts &&
        source.diagnostic.preparation.restored.usedSkillSlots !==
          normalRejection.state.usedSkillSlots,
    );
  }
  return actions;
}

function auditSourceActionWrites(
  actions: readonly PreparationActionExecution[],
  check: RecoveryCheck,
) {
  let changedAttempt = false;
  for (const [actionIndex, action] of actions.entries()) {
    check(
      'recoveryRollbackMismatch',
      `action:${actionIndex}:commit`,
      action.status === 'applied'
        ? action.sources.filter(
            (item) => item.status === 'completed' && item.transaction.kind === 'committed',
          )
        : [],
      action.committedSources,
    );
    if (action.status === 'rejected')
      check(
        'recoveryRollbackMismatch',
        `action:${actionIndex}:restore`,
        action.before,
        action.state,
      );
    for (const [sourceIndex, execution] of action.sources.entries()) {
      const path = `action:${actionIndex}:source:${sourceIndex}`;
      const { binding } = execution;
      check(
        'recoveryIdentityMismatch',
        `${path}:identity`,
        {
          actionId: execution.actionId,
          sourceInstanceId: execution.source.sourceInstanceId,
          skillId: execution.source.skillId,
          occurrenceId: execution.source.effect.occurrenceId,
        },
        {
          actionId: binding.actionId,
          sourceInstanceId: binding.sourceInstanceId,
          skillId: binding.skillId,
          occurrenceId: binding.occurrenceId,
        },
      );
      check(
        'recoveryOrderMismatch',
        `${path}:operations`,
        execution.source.effect.execution.map((operation, operationIndex) => ({
          operationIndex,
          operation,
        })),
        execution.operations.map(({ operationIndex, operation }) => ({
          operationIndex,
          operation,
        })),
      );
      if (execution.status === 'unreached') {
        check(
          'recoveryReceiptMismatch',
          `${path}:unreached`,
          { activation: { kind: 'unread' }, transaction: undefined, restored: undefined },
          {
            activation: binding.activation,
            transaction: execution.transaction,
            restored: execution.restored,
          },
        );
        continue;
      }
      const before = execution.transaction.before;
      if (execution.status === 'rejected' || execution.status === 'rolledBack') {
        check('recoveryRollbackMismatch', `${path}:restored`, action.before, execution.restored);
        check(
          'recoverySourceMismatch',
          `${path}:restoredReference`,
          true,
          execution.restored === action.before,
        );
      }
      check('recoveryTraceMissing', `${path}:before`, true, record(before));
      if (!record(before)) continue;
      check(
        'recoveryIdentityMismatch',
        `${path}:actorForm`,
        before.currentFormId,
        binding.actorFormId,
      );
      if (execution.source.origin === 'np') {
        const use = before.ocState.receipts.find(({ actionId }) => actionId === binding.actionId);
        check('recoveryIdentityMismatch', `${path}:npUse`, true, use !== undefined);
        check(
          'recoveryIdentityMismatch',
          `${path}:cell`,
          {
            valueSetIndex: use ? use.effectiveOc - 1 : null,
            valueIndex: before.npResource.npLevel - 1,
          },
          { valueSetIndex: binding.valueSetIndex, valueIndex: binding.valueIndex },
        );
      } else
        check(
          'recoveryIdentityMismatch',
          `${path}:cell`,
          {
            valueSetIndex: execution.source.valueSetIndex,
            valueIndex: execution.source.valueIndex,
          },
          { valueSetIndex: binding.valueSetIndex, valueIndex: binding.valueIndex },
        );
      if (binding.activation.kind === 'read') {
        check(
          'recoveryIdentityMismatch',
          `${path}:clock`,
          {
            phase: 'sourceUse',
            actionId: binding.actionId,
            actorFormId: binding.actorFormId,
            sourceInstanceId: binding.sourceInstanceId,
            occurrenceId: binding.occurrenceId,
            valueSetIndex: binding.valueSetIndex,
            valueIndex: binding.valueIndex,
          },
          {
            phase: binding.activation.read.clock.phase,
            actionId: binding.activation.read.clock.actionId,
            actorFormId: binding.activation.read.clock.actorFormId,
            sourceInstanceId: binding.activation.read.clock.sourceInstanceId,
            occurrenceId: binding.activation.read.clock.occurrenceId,
            valueSetIndex: binding.activation.read.clock.valueSetIndex,
            valueIndex: binding.activation.read.clock.valueIndex,
          },
        );
      }
      for (const [readIndex, read] of binding.conditionReads.entries()) {
        if (read.kind !== 'inputQuantity') continue;
        const fact = before.inputFacts.get(read.inputKey);
        check(
          'recoveryReadMismatch',
          `${path}:read:${readIndex}`,
          fact?.kind === 'known' ? fact.value : null,
          read.value,
        );
      }
      for (const operation of execution.operations) {
        check(
          'recoveryOrderMismatch',
          `${path}:operation:${operation.operationIndex}:reached`,
          operation.status === 'reached',
          operation.steps.length > 0,
        );
        for (const [stepIndex, step] of operation.steps.entries()) {
          const stepPath = `${path}:operation:${operation.operationIndex}:step:${stepIndex}`;
          check(
            'recoveryReceiptMismatch',
            `${stepPath}:nativeOc`,
            { before: step.before.ocState, after: step.after.ocState },
            { before: step.native.before, after: step.native.after },
          );
          const writer = operation.operation;
          if (writer.kind !== 'resourceMutation' || writer.resource !== 'criticalStars') continue;
          const initial = step.before.inputFacts.get(starAddress);
          const final = step.after.inputFacts.get(starAddress);
          const amount =
            writer.amount.kind === 'fixed'
              ? (execution.source.limitBreak
                  ? writer.amount.limitBreakValues
                  : writer.amount.values)?.[binding.valueSetIndex]?.[binding.valueIndex]
              : null;
          const value = initial?.kind === 'known' ? initial.value : null;
          if (value === null || amount === null || amount === undefined || amount < 0) {
            check(
              'recoveryReceiptMismatch',
              `${stepPath}:failure`,
              true,
              step.native.rejection !== null,
            );
            check('recoveryRollbackMismatch', `${stepPath}:failedWrite`, initial, final);
          } else {
            const expected = Math.max(
              0,
              Math.min(99, value + amount * (writer.direction === 'gain' ? 1 : -1)),
            );
            check(
              'recoveryReceiptMismatch',
              `${stepPath}:quantity`,
              expected,
              final?.kind === 'known' ? final.value : null,
            );
            if (action.status === 'rejected' && expected !== value) changedAttempt = true;
          }
        }
      }
    }
  }
  check('recoveryRollbackMismatch', 'changedAttempt.present', true, changedAttempt);
}

type RecoveryCheck = (
  reason: CriticalStarsRecoveryFailureReason,
  path: string,
  expected: unknown,
  actual: unknown,
) => void;

function auditDiagnosticRecoveryUse(
  program: SourceActionRecoveryProgram,
  source: SourceActionRecoveryObservation,
  check: RecoveryCheck,
) {
  const { diagnostic } = source;
  const target = source.observation.targetExecution;
  check('recoveryTraceMissing', 'target.selection', 'selected', target?.selection);
  if (!target || target.selection !== 'selected') return;
  check('recoveryIdentityMismatch', 'candidate.index', program.target.index, target.candidateIndex);
  const resolution = program.diagnostic.orderedScenario.targetResolution;
  const canonicalTarget =
    resolution.kind === 'candidates' ? resolution.candidates[target.candidateIndex] : undefined;
  check(
    'recoveryIdentityMismatch',
    'candidate.target',
    program.target.value,
    target.targetCandidate,
  );
  check(
    'recoverySourceMismatch',
    'candidate.reference',
    true,
    canonicalTarget === target.targetCandidate &&
      program.target.reference === target.targetCandidate,
  );
  const state = target.candidateState;
  check('recoveryTraceMissing', 'candidateState.present', true, state !== undefined);
  if (!state) return;
  const shape =
    Array.isArray(target.operationEvents) &&
    target.operationEvents.every(record) &&
    Array.isArray(state.executionGroups) &&
    state.executionGroups.every(
      (group) =>
        record(group) &&
        Array.isArray(group.mutations) &&
        group.mutations.every(record) &&
        Array.isArray(group.issues) &&
        Array.isArray(group.operationIds) &&
        Array.isArray(group.appliedOperationIds),
    ) &&
    Array.isArray(state.inputQuantityReads) &&
    state.inputQuantityReads.every(record);
  check('recoveryTraceMissing', 'trace.shape', true, shape);
  if (!shape) return;
  const operations = program.diagnostic.orderedScenario.operations;
  const groups: {
    groupIndex: number;
    transactionIdentity: OrderedExecutionGroupAuditEvent['transactionIdentity'];
    operationIds: string[];
  }[] = [];
  const groupIndexes = operations.map((operation) => {
    const identity = transactionIdentity(operation);
    if (!equal(groups.at(-1)?.transactionIdentity, identity))
      groups.push({ groupIndex: groups.length, transactionIdentity: identity, operationIds: [] });
    groups.at(-1)!.operationIds.push(operation.operationId);
    return groups.length - 1;
  });
  check(
    'recoveryOrderMismatch',
    'diagnostic.groups.identity',
    groups,
    state.executionGroups.map(({ groupIndex, transactionIdentity, operationIds }) => ({
      groupIndex,
      transactionIdentity,
      operationIds,
    })),
  );
  check(
    'recoveryOrderMismatch',
    'events.identity',
    operations.map(({ operationId, kind }, sequence) => ({
      sequence,
      operationId,
      operationKind: kind,
    })),
    target.operationEvents.map(({ sequence, operationId, operationKind }) => ({
      sequence,
      operationId,
      operationKind,
    })),
  );
  check(
    'recoveryOrderMismatch',
    'reads.identity',
    operations.flatMap((operation, operationSequence) =>
      inputQuantityLeaves(operation.condition).map(({ inputKey }) => ({
        operationId: operation.operationId,
        operationSequence,
        operationGroupIndex: groupIndexes[operationSequence],
        inputKey,
      })),
    ),
    state.inputQuantityReads.map(
      ({ operationId, operationSequence, operationGroupIndex, inputKey }) => ({
        operationId,
        operationSequence,
        operationGroupIndex,
        inputKey,
      }),
    ),
  );
  check('recoveryCoverageMismatch', 'recoveryReaders.present', true, program.readerIds.length > 0);
  check(
    'recoveryUseMismatch',
    'readerUses.identity',
    program.readerIds,
    source.readerUses.map(({ operationId }) => operationId),
  );
  check(
    'recoveryReadMismatch',
    'initialValue.known',
    true,
    knownStar(diagnostic.canonicalInputs.values[starAddress] ?? null),
  );
  const first = source.normalActions[0];
  const initialFact = first?.before.inputFacts.get(starAddress);
  check(
    'recoveryReadMismatch',
    'initialValue.actual',
    diagnostic.canonicalInputs.values[starAddress],
    initialFact?.kind === 'known' ? initialFact.value : undefined,
  );
  const failed = program.failedSource.source;
  const failedIdentity = (item: {
    source: { origin: string; skillId: string; effectOccurrenceId: string };
  }) =>
    item.source.origin === failed.origin &&
    item.source.skillId === failed.skillId &&
    item.source.effectOccurrenceId === failed.effect.occurrenceId;
  check(
    'recoveryRollbackMismatch',
    'failed.projections',
    [],
    source.effects.filter(failedIdentity),
  );
  check(
    'recoveryRollbackMismatch',
    'failed.contributions',
    [],
    source.effectiveContributions.contributions.filter(failedIdentity),
  );
  for (const operationId of program.readerIds) {
    const sequence = operations.findIndex((operation) => operation.operationId === operationId);
    const operation = operations[sequence]!;
    const binding = operation.runtimeBinding?.source;
    check('recoveryTraceMissing', `reader:${sequence}:binding`, true, binding !== undefined);
    if (!binding) continue;
    const execution = diagnostic.preparation.transitions
      .flatMap(({ sources }) => sources)
      .find((execution) => execution.binding === binding);
    check(
      'recoverySourceMismatch',
      `reader:${sequence}:bindingReference`,
      true,
      execution !== undefined,
    );
    const expectedReads = binding.conditionReads.filter((read) => read.kind === 'inputQuantity');
    const actualReads = state.inputQuantityReads.filter((read) => read.operationId === operationId);
    check(
      'recoveryReadMismatch',
      `reader:${sequence}:values`,
      expectedReads.map(({ inputKey, value }) => ({ inputKey, value })),
      actualReads.map(({ inputKey, value }) => ({ inputKey, value })),
    );
    const projections = source.effects.filter(
      (projection) => projection.operationId === operationId,
    );
    check('recoveryUseMismatch', `operation:${sequence}:projectionCount`, 1, projections.length);
    const projection = projections[0];
    const event = target.operationEvents[sequence];
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
    if (projection?.contributionId !== null && projection) {
      const contributions = source.effectiveContributions.contributions.filter(
        (item) =>
          item.operationId === operationId && item.contributionId === projection.contributionId,
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
    }
    const use = source.readerUses.find((use) => use.operationId === operationId);
    check(
      'recoverySourceMismatch',
      `reader:${sequence}:observationReference`,
      true,
      use?.side.executionObservation === source.observation,
    );
    if (projection)
      check(
        'recoveryUseMismatch',
        `reader:${sequence}:use`,
        diagnosticUserControlSideObservation(projection, program.calculation, program.diagnostic),
        use?.side,
      );
  }
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
  canonicalIdentity: 'production-audit:critical-stars-recovery';
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

function knownStar(value: number | null): boolean {
  return Number.isSafeInteger(value) && value !== null && value >= 0 && value <= 99;
}

/** Preserve Map/Set-bearing physical receipts in the existing diagnostic artifact. */
export function sourceActionRecoveryEvidence(
  program: SourceActionRecoveryProgram,
  source: SourceActionRecoveryObservation,
) {
  return physicalValue({
    canonical: program.canonical,
    receipt: sourceActionReceipt(source.diagnostic),
    transport: {
      input: source.input,
      effects: source.effects,
      effectiveContributions: source.effectiveContributions,
      result: source.result,
      observation: source.observation,
      readerUses: source.readerUses,
      nativeReads: source.nativeReads,
    },
  });
}

/** Negative transports retain the same control-side fields and native writer values. */
export function sourceActionRecoveryTransport(source: SourceActionRecoveryObservation) {
  return physicalValue({
    observation: source.observation,
    input: source.input,
    effects: source.effects,
    effectiveContributions: source.effectiveContributions,
    result: source.result,
    readerUses: source.readerUses,
    nativeReads: source.nativeReads,
    actions: [...source.normalActions, ...source.diagnosticActions].map((action) => ({
      command: action.command,
      status: action.status,
      committedSources: action.committedSources.map(({ actionId, source: identity }) => ({
        actionId,
        sourceInstanceId: identity.sourceInstanceId,
      })),
      sources: action.sources.map((execution) => ({
        actionId: execution.actionId,
        binding: execution.binding,
        status: execution.status,
        // Full state snapshots live in sourceActionReceipt; this negative transport
        // retains disposition plus actual native operand reads/writes, as before.
        transaction: execution.transaction?.kind,
        operations: execution.operations.map((operation) => ({
          operationIndex: operation.operationIndex,
          operation: operation.operation,
          status: operation.status,
          steps: operation.steps.map((step) => ({
            step: step.step,
            native: step.native,
            before: step.before.inputFacts,
            attemptedAfter: step.after.inputFacts,
          })),
        })),
      })),
    })),
  });
}

/** A passed diagnostic certifies the expected unsupported product execution, never calculated damage. */
export function auditCriticalStarsRecoveryObservations(input: {
  expected: readonly SourceActionRecoveryProgram[];
  observations: readonly (SourceActionRecoveryObservation | undefined)[];
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
    const identity = 'production-audit:critical-stars-recovery:coverage';
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
    failures.push(...auditSourceActionRecovery(program, input.observations[index]).failures);
  const common = {
    canonicalIdentity: 'production-audit:critical-stars-recovery' as const,
    expected,
    actual,
  };
  return failures.length > 0
    ? { ...common, status: 'failed', failures, firstDifference: failures[0]!.firstDifference }
    : { ...common, status: 'passed', failures: [], firstDifference: null };
}
