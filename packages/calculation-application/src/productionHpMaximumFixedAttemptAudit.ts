import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  auditMaximumFixed,
  maximumFixedCanonical,
  maximumFixedDiagnostic,
  maximumFixedProgram,
  maximumFixedSource,
  type MaximumFixedProgram,
  type MaximumFixedSelection,
  type MaximumFixedSource,
} from './productionHpMaximumFixedPreparationAudit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type {
  CalculationApplicationResult,
  CalculationExecution,
  PreparedCalculationScenario,
} from './scenario';

export type MaximumFixedAttemptBoundary =
  'attemptBeforeNative' | 'writerUnreached' | 'deadActor' | 'maximumUnchanged' | 'nativeCommitted';

export type MaximumFixedAttemptExpectation =
  | { kind: 'changedNoncommit'; actionIndex: number }
  | { kind: 'boundary'; actionIndex: number; boundary: MaximumFixedAttemptBoundary };

export interface MaximumFixedAttemptRequest {
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
}

export interface MaximumFixedAttemptProgram {
  identity: string;
  selection: MaximumFixedSelection;
  forwardProgram: MaximumFixedProgram;
  expectation: MaximumFixedAttemptExpectation;
  directResult: CalculationApplicationResult;
}

export interface MaximumFixedAttemptSource {
  identity: string;
  forwardSource: MaximumFixedSource;
  directResult: CalculationApplicationResult;
}

type AttemptCheckReason =
  | 'maximumFixedAttemptPopulationMismatch'
  | 'maximumFixedAttemptCanonicalMismatch'
  | 'maximumFixedAttemptIdentityMismatch'
  | 'maximumFixedAttemptMissing'
  | 'maximumFixedAttemptWriteMismatch'
  | 'maximumFixedAttemptNativeMismatch'
  | 'maximumFixedAttemptReducerMismatch'
  | 'maximumFixedAttemptRetainedMismatch'
  | 'maximumFixedAttemptTransportMismatch'
  | 'maximumFixedAttemptDownstreamGenerated'
  | 'maximumFixedAttemptResetMismatch';

type AttemptCheck = {
  identity: string;
  reason: AttemptCheckReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
};

type AttemptFailure = AttemptCheck & {
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
};

type AttemptAnchor = { path: string; value: unknown };

function attemptProofReason(path: string): AttemptCheckReason {
  if (path.includes('modifierWrites') || path.includes('.writes'))
    return 'maximumFixedAttemptWriteMismatch';
  if (path.includes('sourceEnds') || path.includes('stochasticFailure'))
    return 'maximumFixedAttemptResetMismatch';
  if (path.includes('native')) return 'maximumFixedAttemptNativeMismatch';
  if (path.includes('reducer') || path.includes('rejection') || path.includes('refusal'))
    return 'maximumFixedAttemptReducerMismatch';
  if (path.includes('transport') || path.includes('directResult'))
    return 'maximumFixedAttemptTransportMismatch';
  if (
    path.includes('ordered') ||
    path.includes('damageInput') ||
    path.includes('candidate') ||
    path.includes('result')
  )
    return 'maximumFixedAttemptDownstreamGenerated';
  if (
    path.includes('attempted') ||
    path.includes('returned') ||
    path.includes('before') ||
    path.includes('after') ||
    path.includes('prefix') ||
    path.includes('.hp')
  )
    return 'maximumFixedAttemptRetainedMismatch';
  if (path.includes('canonical') || path.includes('operation') || path.includes('value'))
    return 'maximumFixedAttemptCanonicalMismatch';
  return 'maximumFixedAttemptIdentityMismatch';
}

const authorities = new WeakMap<
  MaximumFixedAttemptProgram,
  {
    proof: unknown;
    anchors: readonly AttemptAnchor[];
    expectation: MaximumFixedAttemptExpectation;
    writerPopulation: unknown;
  }
>();

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalValue(value: unknown): CanonicalAuditValue {
  if (value === undefined) return { type: 'undefined' };
  if (value instanceof Set) return { type: 'set', values: [...value].map(canonicalValue) };
  if (value instanceof Map)
    return {
      type: 'map',
      values: [...value].map(([key, item]) => [canonicalValue(key), canonicalValue(item)]),
    };
  if (Array.isArray(value)) return { type: 'array', values: value.map(canonicalValue) };
  if (record(value))
    return {
      type: 'object',
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, canonicalValue(item)]),
      ),
    };
  return { type: typeof value, value: value as CanonicalAuditValue };
}

function sourceIdentity(source: {
  origin: string;
  sourceInstanceId: string;
  sourceId: string;
  skillId: string;
  valueSetIndex: number;
  valueIndex: number;
  effect: { occurrenceId: string };
}) {
  return [
    source.origin,
    source.sourceInstanceId,
    source.sourceId,
    source.skillId,
    source.effect.occurrenceId,
    source.valueSetIndex,
    source.valueIndex,
  ];
}

function attemptDiagnostic(source: MaximumFixedAttemptSource) {
  const core = source.forwardSource;
  const transport = core.transport;
  return {
    identity: source.identity,
    core: maximumFixedDiagnostic(core),
    directResult: source.directResult,
    reducerAttempts: transport?.transitions.map((transition, index) => ({
      command: transition.command,
      before: transition.before,
      result: transition.result,
      attempts: transition.attempts?.map((attempt) => ({
        actionId: attempt.actionId,
        start: attempt.start,
        stepOrigins: attempt.stepOrigins.map((origin) => ({
          index: origin.index,
          operationIndex: origin.operationIndex,
          source: sourceIdentity(origin.source),
          operation:
            origin.operationIndex === null
              ? null
              : (origin.source.effect.execution[origin.operationIndex] ?? null),
        })),
        reached: attempt.reached,
        writes: attempt.writes,
        native: attempt.native,
        attempted: attempt.attempted,
        returned: attempt.returned,
      })),
      hpActions: core.transitions?.[index]?.hpActions?.map((action) => ({
        actionId: action.actionId,
        start: action.start,
        sources: action.sources.map(sourceIdentity),
        modifierWrites: action.modifierWrites,
        sourceEnds: action.sourceEnds,
        native: action.native,
        rejectionInput: action.rejectionInput,
        attempted: action.attempted,
        returned: action.returned,
      })),
    })),
    selectedTransport: transport
      ? {
          rejection: transport.rejection,
          orderedScenario: transport.orderedScenario,
          orderedExecution: transport.orderedExecution,
          damageInputGenerated: transport.damageInputGenerated,
        }
      : undefined,
  };
}

function attemptAnchors(source: MaximumFixedAttemptSource): AttemptAnchor[] {
  const core = source.forwardSource;
  const anchors: AttemptAnchor[] = [
    { path: 'identity', value: source.identity },
    { path: 'selection', value: core.selection },
    { path: 'prepared', value: core.selection.prepared },
    { path: 'calculation', value: core.calculation },
    { path: 'master', value: core.master },
    { path: 'scenario', value: core.scenario },
    { path: 'transport', value: core.transport },
    { path: 'transport.transitions', value: core.transport?.transitions },
    { path: 'transport.rejection', value: core.transport?.rejection },
    { path: 'directResult', value: source.directResult },
    {
      path: 'directResult.capture',
      value: battlePointPreparationRejectionObservationFor(source.directResult),
    },
    {
      path: 'calculation.result.capture',
      value: battlePointPreparationRejectionObservationFor(core.calculation.result),
    },
  ];
  core.transport?.transitions.forEach((transition, index) => {
    anchors.push(
      { path: `reducer.${index}`, value: transition },
      { path: `reducer.${index}.before`, value: transition.before },
      { path: `reducer.${index}.result`, value: transition.result },
      { path: `reducer.${index}.attempts`, value: transition.attempts },
    );
    transition.attempts?.forEach((attempt, attemptIndex) => {
      const path = `reducer.${index}.attempt.${attemptIndex}`;
      anchors.push(
        { path, value: attempt },
        { path: `${path}.native`, value: attempt.native },
        { path: `${path}.reached`, value: attempt.reached },
        { path: `${path}.stepOrigins`, value: attempt.stepOrigins },
        { path: `${path}.attempted`, value: attempt.attempted },
        { path: `${path}.returned`, value: attempt.returned },
      );
      attempt.reached.forEach((reached, reachedIndex) =>
        anchors.push({ path: `${path}.reached.${reachedIndex}`, value: reached }),
      );
    });
  });
  core.transitions?.forEach((transition, index) =>
    transition.hpActions?.forEach((action, actionIndex) => {
      const path = `hp.${index}.${actionIndex}`;
      anchors.push(
        { path, value: action },
        { path: `${path}.start`, value: action.start },
        { path: `${path}.modifierWrites`, value: action.modifierWrites },
        { path: `${path}.sourceEnds`, value: action.sourceEnds },
        { path: `${path}.native`, value: action.native },
        { path: `${path}.rejectionInput`, value: action.rejectionInput },
        { path: `${path}.attempted`, value: action.attempted },
        { path: `${path}.returned`, value: action.returned },
      );
      action.sourceEnds.forEach((end, endIndex) =>
        anchors.push({ path: `${path}.sourceEnd.${endIndex}`, value: end }),
      );
    }),
  );
  return anchors;
}

export function maximumFixedAttemptProgram(
  selection: MaximumFixedSelection,
  expectation: MaximumFixedAttemptExpectation,
  directResult: CalculationApplicationResult,
): MaximumFixedAttemptProgram {
  const identity = selection.identity;
  const program = {
    identity,
    selection,
    forwardProgram: maximumFixedProgram(selection),
    expectation,
    directResult,
  };
  const source = maximumFixedAttemptSource(selection, directResult);
  authorities.set(program, {
    proof: structuredClone(attemptDiagnostic(source)),
    anchors: attemptAnchors(source),
    expectation: structuredClone(expectation),
    writerPopulation: structuredClone(
      selection.canonical.writers
        .filter((writer) => writer.actionIndex === expectation.actionIndex)
        .map((writer) => ({
          origin: writer.origin,
          sourceInstanceId: writer.sourceInstanceId,
          sourceId: writer.sourceId,
          form: writer.form,
          actionId: writer.actionId,
          skillId: writer.skillId,
          occurrenceId: writer.effect.occurrenceId,
          operationIndex: writer.operationIndex,
          valueSetIndex: writer.valueSetIndex,
          valueIndex: writer.valueIndex,
          operation: writer.operation,
        })),
    ),
  });
  return program;
}

export function maximumFixedAttemptSource(
  selection: MaximumFixedSelection,
  directResult: CalculationApplicationResult,
): MaximumFixedAttemptSource {
  return {
    identity: selection.identity,
    forwardSource: maximumFixedSource(selection),
    directResult,
  };
}

export function maximumFixedAttemptDiagnostic(source: MaximumFixedAttemptSource): unknown {
  return attemptDiagnostic(source);
}

function classifyBoundary(args: {
  actionIndex: number;
  source: MaximumFixedAttemptSource;
  changed: boolean;
  capturedWriteCount: number;
}): MaximumFixedAttemptBoundary | null {
  const transition = args.source.forwardSource.transitions?.[args.actionIndex];
  const action = args.source.forwardSource.canonical.actions[args.actionIndex];
  const hpAction = transition?.hpActions?.find((item) => item.actionId === action?.actionId);
  if (!transition) return 'attemptBeforeNative';
  if (transition.result.status === 'applied')
    return args.capturedWriteCount ? 'nativeCommitted' : 'writerUnreached';
  if (!hpAction?.native) return 'attemptBeforeNative';
  if (hpAction.native.status === 'committed') return 'nativeCommitted';
  if (!args.capturedWriteCount) return 'writerUnreached';
  const writes = hpAction.modifierWrites ?? [];
  if (
    writes.some(
      (write) =>
        write.before.actors.attacker?.kind === 'absolute' &&
        write.before.actors.attacker.current === 0,
    )
  )
    return 'deadActor';
  return args.changed ? null : 'maximumUnchanged';
}

function actionFor(source: MaximumFixedAttemptSource, index: number) {
  const action = source.forwardSource.canonical.actions[index];
  const transition = source.forwardSource.transitions?.[index];
  const hpAction = transition?.hpActions?.find((item) => item.actionId === action?.actionId);
  return { action, transition, hpAction };
}

export function auditMaximumFixedAttemptIsolation(input: {
  requests: readonly MaximumFixedAttemptRequest[];
  expected: readonly MaximumFixedAttemptProgram[];
  observations: readonly MaximumFixedAttemptSource[];
}) {
  const checks: AttemptCheck[] = [];
  const failures: AttemptFailure[] = [];
  const boundaries: { identity: string; reason: MaximumFixedAttemptBoundary }[] = [];
  const isolated: string[] = [];
  const check = (
    identity: string,
    reason: AttemptCheckReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const expectedValue = canonicalValue(expected);
    const actualValue = canonicalValue(actual);
    const item = { identity, reason, checkPath, expected: expectedValue, actual: actualValue };
    checks.push(item);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: expectedValue }],
      [{ identity, value: actualValue }],
    );
    if (difference)
      failures.push({
        ...item,
        reason: checkPath === 'proof' ? attemptProofReason(difference.path) : reason,
        checkPath: difference.path ? `${checkPath}.${difference.path}` : checkPath,
        firstDifference: {
          ...difference,
          path: difference.path ? `${checkPath}.${difference.path}` : checkPath,
        },
      });
  };

  const forward = auditMaximumFixed({
    expected: input.expected.map(({ forwardProgram }) => forwardProgram),
    observations: input.observations.map(({ forwardSource }) => forwardSource),
  });
  check(
    'hpMaximumFixedAttempt:population',
    'maximumFixedAttemptPopulationMismatch',
    'population.requests',
    input.expected.map(({ identity }) => identity),
    input.requests.flatMap((request, index) => {
      const canonical = maximumFixedCanonical(request.prepared);
      return canonical ? [input.expected[index]?.identity ?? `request:${index}`] : [];
    }),
  );
  check(
    'hpMaximumFixedAttempt:population',
    'maximumFixedAttemptPopulationMismatch',
    'population.expected',
    input.expected.map(({ identity }) => identity),
    input.expected.map(({ forwardProgram }) => forwardProgram.selection.identity),
  );
  check(
    'hpMaximumFixedAttempt:population',
    'maximumFixedAttemptPopulationMismatch',
    'population.unique',
    input.expected.length,
    new Set(input.expected.map(({ identity }) => identity)).size,
  );
  check(
    'hpMaximumFixedAttempt:population',
    'maximumFixedAttemptPopulationMismatch',
    'population.observations',
    input.expected.map(({ identity }) => identity),
    input.observations.map(({ identity }) => identity),
  );
  check(
    'hpMaximumFixedAttempt:population',
    'maximumFixedAttemptPopulationMismatch',
    'population.requestCount',
    input.expected.length,
    input.requests.length,
  );

  for (const [index, program] of input.expected.entries()) {
    const identity = program.identity;
    const c = (reason: AttemptCheckReason, path: string, expected: unknown, actual: unknown) =>
      check(identity, reason, path, expected, actual);
    const authority = authorities.get(program);
    const source = input.observations.find((candidate) => candidate.identity === identity);
    const request = input.requests[index];
    c('maximumFixedAttemptMissing', 'authority', true, !!authority);
    c('maximumFixedAttemptMissing', 'request', true, !!request);
    c('maximumFixedAttemptMissing', 'source', true, !!source);
    if (!authority || !source || !request) continue;

    c('maximumFixedAttemptIdentityMismatch', 'identity', program.selection.identity, identity);
    c(
      'maximumFixedAttemptIdentityMismatch',
      'expectation',
      authority.expectation,
      program.expectation,
    );
    c(
      'maximumFixedAttemptIdentityMismatch',
      'request.references',
      [program.selection.prepared, program.selection.calculation],
      [request.prepared, request.calculation],
    );
    c(
      'maximumFixedAttemptCanonicalMismatch',
      'request.canonical',
      maximumFixedCanonical(request.prepared),
      program.selection.canonical,
    );
    c(
      'maximumFixedAttemptIdentityMismatch',
      'source.selection',
      program.selection,
      source.forwardSource.selection,
    );

    const diagnostic = attemptDiagnostic(source);
    c('maximumFixedAttemptCanonicalMismatch', 'proof', authority.proof, diagnostic);
    const anchors = attemptAnchors(source);
    c(
      'maximumFixedAttemptIdentityMismatch',
      'reference.population',
      authority.anchors.map(({ path }) => path),
      anchors.map(({ path }) => path),
    );
    for (let anchorIndex = 0; anchorIndex < authority.anchors.length; anchorIndex += 1) {
      const expectedAnchor = authority.anchors[anchorIndex]!;
      const actualAnchor = anchors[anchorIndex];
      c(
        'maximumFixedAttemptIdentityMismatch',
        `reference.${expectedAnchor.path}`,
        true,
        actualAnchor?.path === expectedAnchor.path && actualAnchor.value === expectedAnchor.value,
      );
    }
    const { action, transition, hpAction } = actionFor(source, program.expectation.actionIndex);
    c('maximumFixedAttemptMissing', 'target.action', true, !!action);
    c('maximumFixedAttemptMissing', 'target.transition', true, !!transition);
    if (!action || !transition) continue;
    c('maximumFixedAttemptIdentityMismatch', 'target.command', action.command, transition.command);
    c(
      'maximumFixedAttemptIdentityMismatch',
      'target.form',
      action.form,
      transition.before.currentFormId,
    );
    if (program.expectation.kind === 'changedNoncommit')
      c('maximumFixedAttemptIdentityMismatch', 'target.nativeCapture', true, !!hpAction);
    else if (
      program.expectation.boundary === 'maximumUnchanged' ||
      program.expectation.boundary === 'deadActor' ||
      program.expectation.boundary === 'nativeCommitted'
    )
      c('maximumFixedAttemptIdentityMismatch', 'target.nativeCapture', true, !!hpAction);

    const targetWriters = source.forwardSource.canonical.writers.filter(
      (writer) => writer.actionIndex === program.expectation.actionIndex,
    );
    c(
      'maximumFixedAttemptCanonicalMismatch',
      'target.writerPopulation',
      authority.writerPopulation,
      targetWriters.map((writer) => ({
        origin: writer.origin,
        sourceInstanceId: writer.sourceInstanceId,
        sourceId: writer.sourceId,
        form: writer.form,
        actionId: writer.actionId,
        skillId: writer.skillId,
        occurrenceId: writer.effect.occurrenceId,
        operationIndex: writer.operationIndex,
        valueSetIndex: writer.valueSetIndex,
        valueIndex: writer.valueIndex,
        operation: writer.operation,
      })),
    );

    const direct = source.directResult;
    const refusal = source.forwardSource.transport?.rejection;
    const reducerResult = transition.result;
    const native = hpAction?.native;
    const prepared = source.forwardSource.selection.prepared;
    const matchingAttempt = transition.attempts?.find(
      (attempt) => attempt.actionId === action.actionId,
    );
    const attempt = matchingAttempt;
    const stepOrigin = (step: number) =>
      attempt?.stepOrigins.find((origin) => origin.index === step);
    const rejectedStep = [...(attempt?.reached ?? [])]
      .reverse()
      .find(({ step }) => step.kind === 'reject');
    const rejectedOrigin = rejectedStep ? stepOrigin(rejectedStep.index) : undefined;
    const inputRequiredReached =
      native?.status === 'inputRequired' && hpAction?.rejectionInput
        ? [...(attempt?.reached ?? [])]
            .reverse()
            .find(
              ({ index, step }) =>
                step.kind === 'grant' &&
                stepOrigin(index)?.source.effect.occurrenceId ===
                  hpAction.rejectionInput?.occurrenceId,
            )
        : undefined;
    const nativeFailureIndex = rejectedStep?.index ?? inputRequiredReached?.index;
    const hasNativeRejection =
      !!native && native.status !== 'committed' && reducerResult.status === 'rejected';
    const operationId = `preparation:${source.forwardSource.canonical.servantId}:${action.command.kind}`;
    const rejectionIdentity = (value: unknown) => {
      if (!record(value)) return null;
      const rejection = record(value['rejection']) ? value['rejection'] : value;
      return [rejection['code'], rejection['operationId']];
    };
    const requiredInputIdentity = (value: unknown) =>
      record(value) ? [value['key'], value['kind']] : null;
    const reducerRequiredInput =
      reducerResult.status === 'rejected' ? reducerResult.requiredInput : null;
    const originalRequiredInput = hpAction?.rejectionInput?.requiredInput;
    if (hpAction)
      c(
        'maximumFixedAttemptRetainedMismatch',
        'target.actionStart',
        [transition.before, transition.before.hp, transition.before.appliedActions],
        [hpAction.start, hpAction.start.hp, hpAction.start.appliedActions],
      );
    if (hasNativeRejection) {
      c(
        'maximumFixedAttemptRetainedMismatch',
        'target.reducerRollback',
        [transition.before, transition.before.hp, transition.before.appliedActions],
        [reducerResult.state, reducerResult.state.hp, reducerResult.state.appliedActions],
      );
      c(
        'maximumFixedAttemptRetainedMismatch',
        'target.returnedRollback',
        [transition.before, transition.before.hp, transition.before.appliedActions],
        hpAction.returned
          ? [hpAction.returned, hpAction.returned.hp, hpAction.returned.appliedActions]
          : null,
      );
      c(
        'maximumFixedAttemptNativeMismatch',
        'target.nativeStateRollback',
        hpAction.start.ocState,
        native.state,
      );
    }
    let expectedNativeStatus: 'noncommit' | 'committed' | 'missing' | null = null;
    if (program.expectation.kind === 'changedNoncommit') expectedNativeStatus = 'noncommit';
    else if (program.expectation.boundary === 'maximumUnchanged')
      expectedNativeStatus = 'noncommit';
    else if (program.expectation.boundary === 'deadActor') expectedNativeStatus = 'noncommit';
    else if (program.expectation.boundary === 'nativeCommitted') expectedNativeStatus = 'committed';
    else if (program.expectation.boundary === 'attemptBeforeNative')
      expectedNativeStatus = 'missing';
    const actualNativeStatus = !native
      ? 'missing'
      : native.status === 'committed'
        ? 'committed'
        : 'noncommit';
    if (expectedNativeStatus)
      c(
        'maximumFixedAttemptNativeMismatch',
        'target.nativeStatus',
        expectedNativeStatus,
        actualNativeStatus,
      );
    if (hasNativeRejection) {
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.reducerStatus',
        'rejected',
        reducerResult.status,
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.reducerCode',
        reducerResult.code,
        refusal?.status === 'rejected' ? refusal.rejection.code : null,
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.operationId',
        operationId,
        refusal?.status === 'rejected' ? refusal.rejection.operationId : null,
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.applicationRefusal',
        rejectionIdentity(refusal?.status === 'rejected' ? refusal : null),
        rejectionIdentity(
          prepared.status === 'rejected' ? prepared.resolved.preparationRejection : null,
        ),
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.calculationExecutionStatus',
        'rejected',
        source.forwardSource.calculation.status,
      );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.calculationExecutionOwner',
        source.forwardSource.transport,
        battlePointPreparationRejectionObservationFor(source.forwardSource.calculation.result),
      );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.directResult',
        source.forwardSource.calculation.result,
        direct,
      );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.directResultRefusal',
        refusal?.status === 'rejected'
          ? [`preparation:${refusal.rejection.code}`, refusal.rejection.operationId]
          : null,
        direct.issues[0] ? [direct.issues[0].code, direct.issues[0].detail] : null,
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.requiredInput',
        originalRequiredInput ?? null,
        reducerRequiredInput,
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.requiredInputOccurrence',
        native.status === 'inputRequired' ? (hpAction.rejectionInput?.occurrenceId ?? null) : null,
        reducerResult.requiredInputEffectOccurrenceId,
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.transportRequiredInputs',
        originalRequiredInput ? [originalRequiredInput] : [],
        refusal?.status === 'rejected'
          ? refusal.requiredInputs.map(
              ({ effectOccurrenceIds: _ids, ...requiredInput }) => requiredInput,
            )
          : [],
      );
      if (native.status === 'inputRequired')
        c(
          'maximumFixedAttemptNativeMismatch',
          'target.nativeRequiredInput',
          requiredInputIdentity(originalRequiredInput),
          requiredInputIdentity(hpAction.rejectionInput?.requiredInput),
        );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.sameCaptureTransport',
        source.forwardSource.transport,
        battlePointPreparationRejectionObservationFor(prepared),
      );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.calculationResultOwner',
        source.forwardSource.transport,
        battlePointPreparationRejectionObservationFor(source.forwardSource.calculation.result),
      );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.directResultOwner',
        source.forwardSource.transport,
        battlePointPreparationRejectionObservationFor(direct),
      );

      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.preparedStatus',
        'rejected',
        prepared.status,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.orderedScenario',
        null,
        prepared.orderedScenario,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.canonicalInputs',
        null,
        prepared.canonicalInputs,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.transportScenario',
        undefined,
        source.forwardSource.transport?.orderedScenario,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.transportExecution',
        undefined,
        source.forwardSource.transport?.orderedExecution,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.damageInput',
        undefined,
        source.forwardSource.transport?.damageInputGenerated,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.hpCandidate',
        undefined,
        source.forwardSource.candidate,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.applicationInput',
        undefined,
        source.forwardSource.input,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.resultStatus',
        native.status === 'inputRequired' ? 'inputRequired' : 'unsupported',
        direct.status,
      );
      c(
        'maximumFixedAttemptDownstreamGenerated',
        'downstream.calculationStatus',
        'rejected',
        source.forwardSource.calculation.status,
      );
    }

    const attemptedWrites = hpAction?.modifierWrites ?? [];
    if (program.expectation.kind === 'changedNoncommit')
      c('maximumFixedAttemptMissing', 'target.nativeAttempt', true, !!attempt);
    else if (program.expectation.boundary === 'attemptBeforeNative')
      c('maximumFixedAttemptMissing', 'target.nativeAttempt', false, !!attempt);
    c(
      'maximumFixedAttemptNativeMismatch',
      'target.nativeRejectReached',
      native && native.status !== 'committed' ? [native.status, native.reason] : null,
      rejectedStep?.step.kind === 'reject'
        ? [rejectedStep.step.status, rejectedStep.step.reason]
        : inputRequiredReached && native?.status === 'inputRequired'
          ? attempt?.native?.status === 'inputRequired'
            ? [attempt.native.status, attempt.native.reason]
            : null
          : null,
    );
    c(
      'maximumFixedAttemptNativeMismatch',
      'target.nativeRejectOrigin',
      native?.status === 'inputRequired'
        ? [hpAction?.rejectionInput?.occurrenceId ?? null]
        : rejectedStep?.step.kind === 'reject'
          ? [rejectedStep.index]
          : null,
      native?.status === 'inputRequired'
        ? [
            inputRequiredReached
              ? (stepOrigin(inputRequiredReached.index)?.source.effect.occurrenceId ?? null)
              : null,
          ]
        : rejectedStep?.step.kind === 'reject'
          ? [rejectedOrigin?.index ?? null]
          : null,
    );

    const writerSteps = new Map(
      targetWriters.map((writer) => [
        `${writer.effect.occurrenceId}:${writer.operationIndex}`,
        attempt?.stepOrigins.find(
          (origin) =>
            origin.source.effect === writer.effect &&
            origin.operationIndex === writer.operationIndex,
        ),
      ]),
    );
    const expectedReached = targetWriters.filter((writer) => {
      const origin = writerSteps.get(`${writer.effect.occurrenceId}:${writer.operationIndex}`);
      return (
        origin !== undefined &&
        (nativeFailureIndex === undefined || origin.index < nativeFailureIndex)
      );
    });
    const expectedWriteKeys = expectedReached.map((writer) => [
      writer.effect.occurrenceId,
      writer.operationIndex,
    ]);
    const actualWriteKeys = attemptedWrites.map((write) => [
      write.source.effect.occurrenceId,
      write.operationIndex,
    ]);
    c('maximumFixedAttemptWriteMismatch', 'target.writeOrder', expectedWriteKeys, actualWriteKeys);

    let changedWriteCount = 0;
    for (const [writeIndex, writer] of expectedReached.entries()) {
      const path = `target.write.${writeIndex}`;
      const write = attemptedWrites.find(
        (candidate) =>
          candidate.source.effect === writer.effect &&
          candidate.operationIndex === writer.operationIndex,
      );
      const source = hpAction?.sources.find(
        (candidate) => candidate.effect === writer.effect && candidate.origin === 'attacker',
      );
      c('maximumFixedAttemptMissing', `${path}.source`, true, !!source);
      c('maximumFixedAttemptMissing', `${path}.write`, true, !!write);
      if (!source || !write) continue;
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.sourceIdentity`,
        [
          writer.origin,
          writer.sourceInstanceId,
          writer.sourceId,
          writer.skillId,
          writer.valueSetIndex,
          writer.valueIndex,
        ],
        [
          source.origin,
          source.sourceInstanceId,
          source.sourceId,
          source.skillId,
          source.valueSetIndex,
          source.valueIndex,
        ],
      );
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.operationReference`,
        true,
        writer.operation === write.operation,
      );
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.operationIndex`,
        writer.operationIndex,
        write.operationIndex,
      );
      c(
        'maximumFixedAttemptWriteMismatch',
        `${path}.cells`,
        [writer.valueSetIndex, writer.valueIndex],
        [write.valueSetIndex, write.valueIndex],
      );
      c(
        'maximumFixedAttemptWriteMismatch',
        `${path}.selectedValue`,
        writer.operation.values[writer.valueSetIndex]?.[writer.valueIndex],
        write.modifiers[0]?.value,
      );
      c('maximumFixedAttemptWriteMismatch', `${path}.modifierCount`, 1, write.modifiers.length);
      c('maximumFixedAttemptWriteMismatch', `${path}.receiptCount`, 1, write.receipts.length);
      const modifier = write.modifiers[0];
      const receipt = write.receipts[0];
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.modifierReference`,
        true,
        !!modifier &&
          write.after.modifiers?.at(-1) === modifier &&
          modifier.operation === writer.operation,
      );
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.modifierActor`,
        'attacker',
        modifier?.actor,
      );
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.modifierForm`,
        source.constantFormKey ?? null,
        modifier?.formKey,
      );
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.receiptIdentity`,
        [action.actionId, writer.effect.occurrenceId, 'attacker', 0, 0],
        receipt
          ? [
              receipt.actionId,
              receipt.occurrenceId,
              receipt.actor,
              receipt.attempted,
              receipt.actual,
            ]
          : null,
      );
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.receiptReferences`,
        [true, true, true],
        receipt
          ? [
              receipt.before === write.before.actors.attacker,
              receipt.after === write.after.actors.attacker,
              write.after.receipts.at(-1) === receipt,
            ]
          : null,
      );
      c(
        'maximumFixedAttemptRetainedMismatch',
        `${path}.modifierPrefix`,
        write.before.modifiers ?? [],
        write.after.modifiers?.slice(0, -1),
      );
      c(
        'maximumFixedAttemptRetainedMismatch',
        `${path}.receiptPrefix`,
        write.before.receipts,
        write.after.receipts.slice(0, -1),
      );
      const before = write.before.actors.attacker;
      const after = write.after.actors.attacker;
      c(
        'maximumFixedAttemptWriteMismatch',
        `${path}.actorKinds`,
        ['absolute', 'absolute'],
        [before?.kind, after?.kind],
      );
      if (before?.kind !== 'absolute' || after?.kind !== 'absolute') continue;
      c(
        'maximumFixedAttemptRetainedMismatch',
        `${path}.baseMaximum`,
        before.baseMaximum,
        after.baseMaximum,
      );
      if (before.current > 0 && after.current > 0 && before.maximum !== after.maximum)
        changedWriteCount += 1;
    }

    const timelineEvents = [
      ...attemptedWrites.map((write) => ({
        kind: 'modifierWrite' as const,
        index: attempt?.stepOrigins.find(
          (origin) =>
            origin.source === write.source && origin.operationIndex === write.operationIndex,
        )?.index,
        before: write.before,
        after: write.after,
        source: write.source,
      })),
      ...(hpAction?.sourceEnds ?? []).map((end) => ({
        kind: 'sourceEnd' as const,
        index: end.step,
        before: end.before.hp!,
        after: end.after.hp!,
        source: end.source,
        end,
      })),
    ].sort(
      (left, right) =>
        (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER),
    );
    let timelineHp = hpAction?.start.hp;
    for (const [eventIndex, event] of timelineEvents.entries()) {
      const path = `target.timeline.${eventIndex}`;
      c(
        'maximumFixedAttemptIdentityMismatch',
        `${path}.reached`,
        true,
        event.index !== undefined &&
          attempt?.reached.some((reached) => reached.index === event.index),
      );
      c('maximumFixedAttemptRetainedMismatch', `${path}.before`, timelineHp, event.before);
      timelineHp = event.after;
      if (event.kind === 'sourceEnd' && event.end.stochasticFailureSteps?.length) {
        const end = event.end;
        const failureSteps = end.stochasticFailureSteps ?? [];
        const failureOrigins = failureSteps.map((step) => stepOrigin(step));
        c('maximumFixedAttemptResetMismatch', `${path}.resetSourceStart`, true, !!end.sourceStart);
        c(
          'maximumFixedAttemptResetMismatch',
          `${path}.resetSourceIdentity`,
          failureOrigins.map(() => sourceIdentity(end.source)),
          failureOrigins.map((origin) => (origin ? sourceIdentity(origin.source) : null)),
        );
        c(
          'maximumFixedAttemptResetMismatch',
          `${path}.resetReached`,
          failureSteps,
          failureSteps.filter((step) => attempt?.reached.some((reached) => reached.index === step)),
        );
        c(
          'maximumFixedAttemptResetMismatch',
          `${path}.resetOwnerState`,
          [true, true],
          [end.after === end.sourceStart, end.after.hp === end.sourceStart?.hp],
        );
      }
    }
    const attemptEndHp = hpAction?.attempted?.hp;
    const timelineEndHp = timelineHp;
    c(
      'maximumFixedAttemptRetainedMismatch',
      'target.attemptEndHp',
      native?.status === 'committed'
        ? [attemptEndHp?.actors, attemptEndHp?.modifiers, attemptEndHp?.receipts]
        : attemptEndHp,
      native?.status === 'committed'
        ? [timelineEndHp?.actors, timelineEndHp?.modifiers, timelineEndHp?.receipts]
        : timelineEndHp,
    );
    if (hpAction?.sourceEnds.length && attempt && native?.status !== 'committed')
      c(
        'maximumFixedAttemptRetainedMismatch',
        'target.lastSourceEnd',
        hpAction.attempted,
        hpAction.sourceEnds.at(-1)?.after,
      );

    const boundary = classifyBoundary({
      actionIndex: program.expectation.actionIndex,
      source,
      changed: changedWriteCount > 0,
      capturedWriteCount: attemptedWrites.length,
    });
    if (program.expectation.actionIndex > 0) {
      const prefixTransitions =
        source.forwardSource.transitions?.slice(0, program.expectation.actionIndex) ?? [];
      c(
        'maximumFixedAttemptRetainedMismatch',
        'target.committedPrefix',
        prefixTransitions.map(() => 'applied'),
        prefixTransitions.map((item) => item.result.status),
      );
      c(
        'maximumFixedAttemptRetainedMismatch',
        'target.prefixReference',
        [true, true],
        [
          transition.before === prefixTransitions.at(-1)?.result.state,
          prefixTransitions.every((item) => item.result.status === 'applied'),
        ],
      );
    }
    if (program.expectation.kind === 'changedNoncommit') {
      c('maximumFixedAttemptWriteMismatch', 'target.realChangedWrite', true, changedWriteCount > 0);
      c(
        'maximumFixedAttemptNativeMismatch',
        'target.nativeNoncommit',
        true,
        !!native && native.status !== 'committed',
      );
      c(
        'maximumFixedAttemptReducerMismatch',
        'target.sameActionRefused',
        true,
        reducerResult.status === 'rejected',
      );
      c(
        'maximumFixedAttemptTransportMismatch',
        'target.sameSelectedRefused',
        true,
        refusal?.status === 'rejected' && direct.status !== 'calculated',
      );
      if (boundary) boundaries.push({ identity, reason: boundary });
      if (!boundary && changedWriteCount > 0 && native?.status !== 'committed')
        isolated.push(identity);
    } else {
      c(
        'maximumFixedAttemptPopulationMismatch',
        'target.expectedBoundary',
        program.expectation.boundary,
        boundary,
      );
      if (boundary) boundaries.push({ identity, reason: boundary });
    }
  }

  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    expected: input.expected.map(({ identity }) => identity),
    requests: input.requests.length,
    observed: input.observations.length,
    isolated,
    boundaries,
    forward,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
