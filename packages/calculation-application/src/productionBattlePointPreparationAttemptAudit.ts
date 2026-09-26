import type { PreparationOcAttempt } from '@fgo-lab/battle-execution/preparation-audit';
import { getSkillsForActorForm, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { npProgramEffects, resolveResourceTargetPolicy } from '@fgo-lab/battle-execution';
import {
  canonicalAuditDigest,
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  battlePointPreparationRejectionObservationFor,
  type BattlePointPreparationRejectionObservation,
} from './battlePointPreparationObservation';
import { scalarQuantitySnapshot as snapshot } from './productionScalarQuantityAudit';
import { battlePointPreparationCanonicalInventory } from './productionBattlePointPreparationAudit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';

type Transition = BattlePointPreparationRejectionObservation['transitions'][number];
function canonical(prepared: Partial<PreparedCalculationScenario>, capacity = false) {
  if (prepared.scenario?.mode !== 'resolved') return null;
  const scenario = prepared.scenario;
  const master = prepared.master;
  if (!master) return null;
  const servant = master.servants.find(({ id }) => id === scenario.attacker.servantId);
  if (!servant) return null;
  if (
    capacity &&
    (!Array.isArray(scenario.preNoblePhantasmPlan) ||
      (scenario.preNoblePhantasmPlan as readonly unknown[]).some(
        (c) => c === null || typeof c !== 'object',
      ))
  )
    return null;
  const actions = scenario.preNoblePhantasmPlan.map((command, commandIndex) => {
    const skill =
      command.kind === 'useSkillSlot'
        ? getSkillsForActorForm(servant, scenario.attacker.initialActorFormId).find(
            ({ slot }) => slot === command.slot,
          )
        : undefined;
    const effects =
      skill && command.kind === 'useSkillSlot'
        ? npProgramEffects(skill.effects).filter(
            (effect) =>
              effect.selection?.kind !== 'playerChoice' ||
              (effect.selection.group.key === command.choice?.groupKey &&
                effect.selection.group.candidate === command.choice.candidateKey),
          )
        : [];
    return { command, commandIndex, skillId: skill?.id ?? null, effects };
  });
  const writers = actions.flatMap((action) =>
    action.effects.flatMap((effect) =>
      effect.execution.flatMap((operation, operationIndex) =>
        ((capacity && operation.kind === 'battlePointCapacityModifier') ||
          (operation.kind === 'resourceMutation' &&
            operation.resource === 'battlePoint' &&
            operation.unit === 'fixed' &&
            operation.amount.kind === 'fixed')) &&
        resolveResourceTargetPolicy('attacker', operation.recipient) === 'attacker'
          ? [
              {
                commandIndex: action.commandIndex,
                skillId: action.skillId,
                occurrenceId: effect.occurrenceId,
                operationIndex,
                operation,
                sourceInstanceId: `attacker:${servant.id}`,
                sourceId: servant.id,
                actor: 'attacker',
                domainId: operation.subjectId,
              },
            ]
          : [],
      ),
    ),
  );
  return { scenario, domains: master.battlePointDomains, actions, writers };
}
function view(source: BattlePointPreparationAttemptSource) {
  const { prepared, calculation, capture } = source;
  return {
    capture,
    prepared: {
      status: prepared.status,
      resolved: prepared.resolved,
      orderedScenario: prepared.orderedScenario,
      canonicalInputs: prepared.canonicalInputs,
      executionObservation:
        prepared.status === 'executable' ? prepared.executionObservation : undefined,
    },
    calculation,
  };
}
export interface BattlePointPreparationAttemptProgram {
  canonicalIdentity: string;
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
  expected: NonNullable<ReturnType<typeof canonical>>;
  contract: CanonicalAuditValue;
  owner: CanonicalAuditValue;
  capture: BattlePointPreparationRejectionObservation | undefined;
}
export interface BattlePointPreparationAttemptSource {
  program: BattlePointPreparationAttemptProgram;
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
  capture: BattlePointPreparationRejectionObservation | undefined;
}
function originalReferences(capture: BattlePointPreparationRejectionObservation | undefined) {
  return capture?.transitions.map((t) => ({
    before: t.before,
    result: t.result,
    attempts: t.attempts?.map((a) => ({
      attempt: a,
      start: a.start,
      native: a.native,
      returned: a.returned,
      attempted: a.attempted,
      sources: a.sources,
      writes: a.writes.map((w) => ({ ...w, receiptReferences: [...w.receipts] })),
    })),
  }));
}
const authorities = new WeakMap<
  BattlePointPreparationAttemptProgram,
  {
    identity: string;
    contract: CanonicalAuditValue;
    owner: CanonicalAuditValue;
    prepared: PreparedCalculationScenario;
    calculation: CalculationExecution;
    result: CalculationExecution['result'];
    references: ReturnType<typeof originalReferences>;
    capacity: boolean;
  }
>();
/** Canonical capacity membership is independent of activation, receipts and native outcome. */
export function battlePointCapacityAttemptCanonical(
  prepared: Partial<PreparedCalculationScenario>,
) {
  return canonical(prepared, true);
}
export function battlePointCapacityAttemptRejectionProgram(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  evaluationIndex = 0,
) {
  return createAttemptProgram(prepared, calculation, evaluationIndex, true);
}
/** Selection is canonical-writer based, before any success/rejection/changed observation filter. */
export function battlePointPreparationAttemptProgram(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  evaluationIndex = 0,
): BattlePointPreparationAttemptProgram | null {
  return createAttemptProgram(prepared, calculation, evaluationIndex, false);
}
function createAttemptProgram(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  evaluationIndex: number,
  capacity: boolean,
): BattlePointPreparationAttemptProgram | null {
  const expected = canonical(prepared, capacity);
  if (!expected?.writers.length) return null;
  const program: BattlePointPreparationAttemptProgram = {
    canonicalIdentity: `tsk-08:preparation-bp-${capacity ? 'capacity-attempt' : 'attempt'}:${canonicalAuditDigest([{ identity: 'selected-scenario', value: snapshot([expected.scenario, prepared.contributionPolicy, prepared.preparation, evaluationIndex]) }])}`,
    prepared,
    calculation,
    expected,
    contract: snapshot(expected),
    owner: null,
    capture: battlePointPreparationRejectionObservationFor(prepared),
  };
  program.owner = snapshot(view(battlePointPreparationAttemptSource(program)));
  authorities.set(program, {
    identity: program.canonicalIdentity,
    contract: snapshot(expected),
    owner: snapshot(view(battlePointPreparationAttemptSource(program))),
    prepared,
    calculation,
    result: calculation.result,
    references: originalReferences(program.capture),
    capacity,
  });
  return program;
}
export function battlePointPreparationAttemptSource(
  program: BattlePointPreparationAttemptProgram,
): BattlePointPreparationAttemptSource {
  return {
    program,
    prepared: program.prepared,
    calculation: program.calculation,
    capture: program.capture,
  };
}
export type BattlePointPreparationAttemptFailureReason =
  | 'attemptPopulationMismatch'
  | 'attemptCanonicalMismatch'
  | 'attemptTransportMissing'
  | 'attemptIdentityMismatch'
  | 'attemptOrderMismatch'
  | 'attemptNativeMismatch'
  | 'attemptStateMismatch'
  | 'attemptCommitLeak'
  | 'attemptRejectionMismatch'
  | 'attemptResultMismatch'
  | 'attemptDownstreamLeak';
export interface BattlePointPreparationAttemptFailure {
  reason: BattlePointPreparationAttemptFailureReason;
  canonicalIdentity: string;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
}
type TransitionProof = Omit<Partial<Transition>, 'attempts'> & {
  attempts?: readonly Partial<PreparationOcAttempt>[] | undefined;
};
type CaptureProof = Omit<Partial<BattlePointPreparationRejectionObservation>, 'transitions'> & {
  transitions?: readonly TransitionProof[];
};
type SourceProof = {
  program?: BattlePointPreparationAttemptProgram;
  prepared?: PreparedCalculationScenario;
  calculation?: Partial<CalculationExecution>;
  capture?: CaptureProof | undefined;
};
function savedTransitionsForStart(capture: Record<string, CanonicalAuditValue>, index: number) {
  const transitions = capture.transitions as Record<string, CanonicalAuditValue>[] | undefined;
  return transitions?.[index]?.before as Record<string, CanonicalAuditValue> | undefined;
}

export function auditBattlePointPreparationAttemptObservations(input: {
  expected: readonly BattlePointPreparationAttemptProgram[];
  observations: readonly SourceProof[];
}) {
  const failures: BattlePointPreparationAttemptFailure[] = [];
  const boundaries: {
    canonicalIdentity: string;
    kind: 'changedNonCommit' | 'unchangedNonCommit' | 'beforeAttempt' | 'committed';
    changedAttempts: number;
  }[] = [];
  const check = (
    identity: string,
    reason: BattlePointPreparationAttemptFailureReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const wanted = snapshot(expected),
      observed = snapshot(actual);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: wanted }],
      [{ identity, value: observed }],
    );
    if (difference)
      failures.push({
        reason,
        canonicalIdentity: identity,
        checkPath,
        expected: wanted,
        actual: observed,
        firstDifference: {
          ...difference,
          path: difference.path ? `${checkPath}.${difference.path}` : checkPath,
        },
      });
  };
  const root = 'tsk-08:preparation-bp-attempt';
  check(
    root,
    'attemptPopulationMismatch',
    'population',
    input.expected.map((p) => p.canonicalIdentity),
    input.observations.map((s) => s.program?.canonicalIdentity),
  );
  check(
    root,
    'attemptPopulationMismatch',
    'population.unique',
    input.expected.length,
    new Set(input.expected.map((p) => p.canonicalIdentity)).size,
  );
  for (const program of input.expected) {
    const c = (
      reason: BattlePointPreparationAttemptFailureReason,
      path: string,
      expected: unknown,
      actual: unknown,
    ) => check(program.canonicalIdentity, reason, path, expected, actual);
    const source = input.observations.find(
      (s) => s.program?.canonicalIdentity === program.canonicalIdentity,
    );
    if (!source) continue;
    c('attemptTransportMissing', 'transport.preparedObject', true, source.prepared !== undefined);
    c(
      'attemptTransportMissing',
      'transport.calculationObject',
      true,
      source.calculation !== undefined,
    );
    if (!source.prepared || !source.calculation) continue;
    c('attemptTransportMissing', 'transport.result', true, source.calculation.result !== undefined);
    if (!source.calculation.result) continue;
    c(
      'attemptIdentityMismatch',
      'transport.resultCapture',
      true,
      source.capture !== undefined &&
        source.capture === battlePointPreparationRejectionObservationFor(source.calculation.result),
    );
    const authority = authorities.get(program);
    c('attemptTransportMissing', 'canonical.authority', true, authority !== undefined);
    if (!authority) continue;
    c(
      'attemptIdentityMismatch',
      'canonical.identity',
      authority.identity,
      program.canonicalIdentity,
    );
    c(
      'attemptIdentityMismatch',
      'canonical.preparedReference',
      true,
      program.prepared === authority.prepared,
    );
    c(
      'attemptIdentityMismatch',
      'canonical.calculationReference',
      true,
      program.calculation === authority.calculation,
    );
    c(
      'attemptIdentityMismatch',
      'transport.captureReference',
      true,
      program.capture === battlePointPreparationRejectionObservationFor(authority.prepared),
    );
    c('attemptCanonicalMismatch', 'canonical.seal', authority.contract, program.contract);
    c('attemptStateMismatch', 'transport.seal', authority.owner, program.owner);
    c(
      'attemptCanonicalMismatch',
      'canonical.observed',
      authority.contract,
      canonical(source.prepared, authority.capacity),
    );
    c('attemptCanonicalMismatch', 'canonical.contract', program.contract, program.expected);
    c(
      'attemptCanonicalMismatch',
      'canonical.owner',
      program.contract,
      canonical(program.prepared, authority.capacity),
    );
    c(
      'attemptCanonicalMismatch',
      'canonical.writerPopulation',
      true,
      program.expected.writers.length > 0,
    );
    c('attemptIdentityMismatch', 'transport.program', true, source.program === program);
    c(
      'attemptIdentityMismatch',
      'transport.prepared',
      true,
      source.prepared === authority.prepared,
    );
    c(
      'attemptIdentityMismatch',
      'transport.calculation',
      true,
      source.calculation === authority.calculation,
    );
    c('attemptTransportMissing', 'transport.capture', true, source.capture !== undefined);
    c(
      'attemptIdentityMismatch',
      'transport.sameCapture',
      true,
      source.capture === battlePointPreparationRejectionObservationFor(source.prepared) &&
        source.capture === battlePointPreparationRejectionObservationFor(source.calculation),
    );
    const capture = source.capture;
    if (!capture) continue;
    const sealed = authority.owner as Record<string, CanonicalAuditValue>;
    const savedCapture = sealed.capture as Record<string, CanonicalAuditValue>;
    c('attemptStateMismatch', 'transport.owner', savedCapture, capture);
    c('attemptTransportMissing', 'transition.list', true, capture.transitions !== undefined);
    if (capture.transitions === undefined) continue;
    const transitions = capture.transitions;
    c(
      'attemptOrderMismatch',
      'transition.commandPrefix',
      program.expected.actions.slice(0, transitions.length).map((a) => a.command),
      transitions.map((t) => t.command),
    );
    const rejectionIndex = transitions.findIndex((t) => t.result?.status === 'rejected');
    const failed = transitions[rejectionIndex];
    if (source.prepared.status !== 'rejected') {
      c('attemptNativeMismatch', 'boundary.committed', -1, rejectionIndex);
      boundaries.push({
        canonicalIdentity: program.canonicalIdentity,
        kind: 'committed',
        changedAttempts: 0,
      });
      continue;
    }
    c('attemptRejectionMismatch', 'rejection.transition', true, failed !== undefined);
    c('attemptOrderMismatch', 'transition.stop', transitions.length - 1, rejectionIndex);
    if (!failed) continue;
    c('attemptTransportMissing', 'rejection.commandObject', true, failed.command !== undefined);
    if (!failed.command) continue;
    const command = failed.command;
    c('attemptCanonicalMismatch', 'rejection.commandKind', 'useSkillSlot', command.kind);
    const action = program.expected.actions[rejectionIndex];
    c('attemptCanonicalMismatch', 'rejection.command', action?.command, failed.command);
    c('attemptTransportMissing', 'rejection.actionStart', true, failed.before !== undefined);
    c('attemptTransportMissing', 'rejection.reducerResult', true, failed.result !== undefined);
    if (!failed.before || !failed.result) continue;
    const original = authority.references?.[rejectionIndex];
    c(
      'attemptIdentityMismatch',
      'rejection.originalBefore',
      true,
      failed.before === original?.before,
    );
    c(
      'attemptIdentityMismatch',
      'rejection.originalResult',
      true,
      failed.result === original?.result,
    );
    const actionStartCount = failed.before.appliedActions.length;
    c('attemptOrderMismatch', 'action.startCount', rejectionIndex, actionStartCount);
    for (let i = 1; i < transitions.length; i++) {
      const prior = transitions[i - 1]!,
        next = transitions[i]!;
      c('attemptStateMismatch', `transition.${i}.start`, true, prior.result?.state === next.before);
    }
    c(
      'attemptStateMismatch',
      'rejection.stateReference',
      true,
      failed.result.state === failed.before,
    );
    c(
      'attemptStateMismatch',
      'rejection.battlePoints',
      failed.before.battlePoints,
      failed.result.state.battlePoints,
    );
    c(
      'attemptCommitLeak',
      'rejection.appliedActions',
      failed.before.appliedActions,
      failed.result.state.appliedActions,
    );
    const attempts = failed.attempts;
    c(
      'attemptTransportMissing',
      'native.attempt',
      true,
      attempts !== undefined && attempts.length === 1,
    );
    const attempt = attempts?.[0];
    if (!attempt) {
      boundaries.push({
        canonicalIdentity: program.canonicalIdentity,
        kind: 'beforeAttempt',
        changedAttempts: 0,
      });
      continue;
    }
    c('attemptTransportMissing', 'native.startState', true, attempt.start !== undefined);
    c('attemptTransportMissing', 'native.sourceList', true, attempt.sources !== undefined);
    c('attemptTransportMissing', 'native.reachedList', true, attempt.reached !== undefined);
    c('attemptTransportMissing', 'native.originList', true, attempt.stepOrigins !== undefined);
    c('attemptTransportMissing', 'native.writeList', true, attempt.writes !== undefined);
    if (
      !attempt.start ||
      attempt.sources === undefined ||
      attempt.reached === undefined ||
      attempt.stepOrigins === undefined ||
      attempt.writes === undefined
    )
      continue;
    const originalAttempt = original?.attempts?.[0];
    c(
      'attemptIdentityMismatch',
      'native.originalAttempt',
      true,
      attempt === originalAttempt?.attempt,
    );
    c(
      'attemptIdentityMismatch',
      'native.originalStart',
      true,
      attempt.start === originalAttempt?.start,
    );
    c(
      'attemptIdentityMismatch',
      'native.originalResult',
      true,
      attempt.native === originalAttempt?.native,
    );
    c(
      'attemptIdentityMismatch',
      'native.originalReturned',
      true,
      attempt.returned === originalAttempt?.returned,
    );
    c(
      'attemptIdentityMismatch',
      'native.originalAttempted',
      true,
      attempt.attempted === originalAttempt?.attempted,
    );
    c(
      'attemptIdentityMismatch',
      'native.originalSources',
      true,
      attempt.sources === originalAttempt?.sources,
    );
    const { reached, stepOrigins, writes, sources: attemptSources } = attempt;
    const actionId = `preparation:${actionStartCount}:${command.kind}`;
    c('attemptIdentityMismatch', 'native.actionId', actionId, attempt.actionId);
    c(
      'attemptStateMismatch',
      'native.start',
      true,
      attempt.start.battlePoints === failed.before.battlePoints,
    );
    c(
      'attemptCanonicalMismatch',
      'native.sources',
      action?.effects,
      attemptSources.map((s) => s.effect),
    );
    c(
      'attemptIdentityMismatch',
      'native.sourceIdentity',
      action?.effects.map((effect) => ({
        origin: 'attacker',
        sourceInstanceId: `attacker:${program.expected.scenario.attacker.servantId}`,
        sourceId: program.expected.scenario.attacker.servantId,
        skillId: action.skillId,
        occurrenceId: effect.occurrenceId,
        valueSetIndex: 0,
        valueIndex: command.kind === 'useSkillSlot' ? command.skillLevel - 1 : null,
      })),
      attemptSources.map((s) => ({
        origin: s.origin,
        sourceInstanceId: s.sourceInstanceId,
        sourceId: s.sourceId,
        skillId: s.skillId,
        occurrenceId: s.effect.occurrenceId,
        valueSetIndex: s.valueSetIndex,
        valueIndex: s.valueIndex,
      })),
    );
    const savedTransitions = savedCapture.transitions as Record<string, CanonicalAuditValue>[];
    const savedAttempt = (
      savedTransitions[rejectionIndex]?.attempts as
        Record<string, CanonicalAuditValue>[] | undefined
    )?.[0];
    c('attemptNativeMismatch', 'native.result', savedAttempt?.native, attempt.native);
    c(
      'attemptNativeMismatch',
      'native.nonCommit',
      true,
      attempt.native !== undefined && attempt.native.status !== 'committed',
    );
    c(
      'attemptOrderMismatch',
      'native.prefix',
      reached.map((_, i) => i),
      reached.map((r) => r.index),
    );
    c('attemptOrderMismatch', 'native.reached', savedAttempt?.reached, reached);
    c('attemptIdentityMismatch', 'native.stepOrigins', savedAttempt?.stepOrigins, stepOrigins);
    const savedActionStart = savedAttempt?.start as Record<string, CanonicalAuditValue> | undefined;
    const savedActionStartPoints = savedActionStart?.battlePoints as
      Record<string, CanonicalAuditValue> | undefined;
    const savedReducerStart = savedTransitionsForStart(savedCapture, rejectionIndex);
    const native: Partial<NonNullable<PreparationOcAttempt['native']>> | undefined = attempt.native;
    if (native) {
      c('attemptTransportMissing', 'native.ocStateObject', true, native.state !== undefined);
      if (!native.state) continue;
      const state: Partial<typeof native.state> = native.state;
      c('attemptTransportMissing', 'native.ocActions', true, state.committedActions !== undefined);
      const savedStart = savedAttempt?.start as Record<string, CanonicalAuditValue> | undefined;
      const savedOcState = savedStart?.ocState as Record<string, CanonicalAuditValue> | undefined;
      c('attemptCommitLeak', 'native.ocReceipts', savedOcState?.receipts, state.receipts);
      c(
        'attemptNativeMismatch',
        'native.nonCommitStatus',
        true,
        native.status === 'invalid' ||
          native.status === 'unsupported' ||
          native.status === 'inputRequired',
      );
      c('attemptCommitLeak', 'native.ocState', true, native.state === attempt.start.ocState);
      c('attemptCommitLeak', 'native.outcomes', [], native.outcomes);
      c(
        'attemptCommitLeak',
        'native.committedAction',
        false,
        state.committedActions?.has(actionId),
      );
    }
    let changedAttempts = 0;
    const writers = program.expected.writers.filter((w) => w.commandIndex === rejectionIndex);
    const reachedWriters = writers.filter((w) =>
      reached.some((r) =>
        stepOrigins.some(
          (o) =>
            o.index === r.index &&
            o.source.effect.occurrenceId === w.occurrenceId &&
            o.operationIndex === w.operationIndex,
        ),
      ),
    );
    c(
      'attemptPopulationMismatch',
      'writer.reachedPopulation',
      reachedWriters.map((w) => [w.occurrenceId, w.operationIndex]),
      writes.map((w) => [
        (w as { source?: typeof w.source }).source?.effect.occurrenceId,
        w.operationIndex,
      ]),
    );
    let previous = attempt.start.battlePoints;
    for (const [index, nativeWrite] of writes.entries()) {
      const write: Omit<PreparationOcAttempt['writes'][number], 'before' | 'after' | 'receipts'> &
        Partial<Pick<PreparationOcAttempt['writes'][number], 'before' | 'after' | 'receipts'>> =
        nativeWrite;
      if (authority.capacity) {
        const sourceProof: Partial<typeof write> = write;
        c('attemptTransportMissing', `writer.${index}.source`, true, !!sourceProof.source);
        if (!sourceProof.source) continue;
      }
      const writer = reachedWriters[index];
      const path = `writer.${index}`;
      c(
        'attemptTransportMissing',
        `${path}.states`,
        true,
        write.before !== undefined && write.after !== undefined,
      );
      c('attemptTransportMissing', `${path}.receipts`, true, write.receipts !== undefined);
      if (!write.before || !write.after || write.receipts === undefined) continue;
      c(
        'attemptIdentityMismatch',
        `${path}.canonical`,
        writer
          ? {
              occurrenceId: writer.occurrenceId,
              operationIndex: writer.operationIndex,
              operation: writer.operation,
            }
          : undefined,
        {
          occurrenceId: write.source.effect.occurrenceId,
          operationIndex: write.operationIndex,
          operation: write.source.effect.execution[write.operationIndex],
        },
      );
      c(
        'attemptOrderMismatch',
        `${path}.step`,
        true,
        reached.some(
          (r) =>
            r.index === write.step &&
            stepOrigins.some(
              (o) =>
                o.index === r.index &&
                o.source === write.source &&
                o.operationIndex === write.operationIndex,
            ),
        ),
      );
      const originalWrite = originalAttempt?.writes[index];
      c(
        'attemptIdentityMismatch',
        `${path}.beforeReference`,
        true,
        write.before === originalWrite?.before,
      );
      c(
        'attemptIdentityMismatch',
        `${path}.afterReference`,
        true,
        write.after === originalWrite?.after,
      );
      c(
        'attemptIdentityMismatch',
        `${path}.sourceReference`,
        true,
        write.source === originalWrite?.source,
      );
      c(
        'attemptIdentityMismatch',
        `${path}.receiptReferences`,
        true,
        write.receipts.length === originalWrite?.receiptReferences.length &&
          write.receipts.every((r, i) => r === originalWrite.receiptReferences[i]),
      );
      // Capacity uses the original write/source/reconcile timeline in its focused consumer.
      if (!authority.capacity) c('attemptStateMismatch', `${path}.before`, previous, write.before);
      const savedWrite = (
        savedAttempt?.writes as Record<string, CanonicalAuditValue>[] | undefined
      )?.[index];
      for (const key of ['status', 'before', 'after', 'receipts'] as const)
        c('attemptStateMismatch', `${path}.${key}.owner`, savedWrite?.[key], write[key]);
      c(
        'attemptStateMismatch',
        `${path}.receiptAppend`,
        write.before.receipts.concat(write.receipts),
        write.after.receipts,
      );
      c(
        'attemptCommitLeak',
        `${path}.executedEffects`,
        write.before.executedEffects,
        write.after.executedEffects,
      );
      for (const receipt of write.receipts) {
        c(
          'attemptIdentityMismatch',
          `${path}.receiptIdentity`,
          writer
            ? {
                identity: JSON.stringify([
                  actionId,
                  writer.sourceInstanceId,
                  writer.occurrenceId,
                  writer.operationIndex,
                ]),
                actor: writer.actor,
                domainId: writer.domainId,
              }
            : undefined,
          { identity: receipt.identity, actor: receipt.actor, domainId: receipt.domainId },
        );
        c(
          'attemptStateMismatch',
          `${path}.receiptBefore`,
          write.before.actors[receipt.actor]?.domains[receipt.domainId],
          receipt.before,
        );
        c(
          'attemptStateMismatch',
          `${path}.receiptAfter`,
          write.after.actors[receipt.actor]?.domains[receipt.domainId],
          receipt.after,
        );
        if (
          firstCanonicalAuditDifference(
            [{ identity: actionId, value: snapshot(receipt.before) }],
            [{ identity: actionId, value: snapshot(receipt.after) }],
          )
        )
          changedAttempts++;
      }
      previous = write.after;
    }
    if (!authority.capacity)
      c('attemptStateMismatch', 'native.attempted', previous, attempt.attempted);
    c('attemptStateMismatch', 'native.returnedReference', true, attempt.returned === attempt.start);
    c(
      'attemptStateMismatch',
      'native.retainedState',
      authority.capacity ? savedActionStart?.battlePoints : failed.before.battlePoints,
      attempt.returned?.battlePoints,
    );
    c(
      'attemptCommitLeak',
      'native.retainedReceipts',
      authority.capacity ? savedActionStartPoints?.receipts : failed.before.battlePoints.receipts,
      attempt.returned?.battlePoints.receipts,
    );
    c(
      'attemptCommitLeak',
      'native.executedEffects',
      authority.capacity
        ? savedActionStartPoints?.executedEffects
        : failed.before.battlePoints.executedEffects,
      attempt.returned?.battlePoints.executedEffects,
    );
    const rejection = capture.rejection;
    c('attemptTransportMissing', 'rejection.outcome', true, rejection !== undefined);
    c('attemptRejectionMismatch', 'rejection.owner', savedCapture.rejection, rejection);
    if (failed.result.status === 'rejected') {
      c(
        'attemptRejectionMismatch',
        'rejection.code',
        failed.result.code,
        rejection?.rejection.code,
      );
      c(
        'attemptRejectionMismatch',
        'rejection.requiredInputs',
        failed.result.requiredInput && failed.result.requiredInputEffectOccurrenceId
          ? [
              {
                ...failed.result.requiredInput,
                effectOccurrenceIds: [failed.result.requiredInputEffectOccurrenceId],
              },
            ]
          : [],
        rejection?.requiredInputs,
      );
      c(
        'attemptRejectionMismatch',
        'rejection.operationId',
        `preparation:${program.expected.scenario.attacker.servantId}:${command.kind}`,
        rejection?.rejection.operationId,
      );
    }
    c(
      'attemptCommitLeak',
      'rejection.committedPrefix',
      authority.capacity ? savedReducerStart?.appliedActions : failed.before.appliedActions,
      rejection?.appliedPreparationActions,
    );
    c(
      'attemptRejectionMismatch',
      'resolved.rejection',
      rejection?.rejection,
      source.prepared.resolved.preparationRejection,
    );
    c(
      'attemptRejectionMismatch',
      'resolved.requiredInputs',
      rejection?.requiredInputs,
      source.prepared.resolved.requiredInputs,
    );
    c(
      'attemptResultMismatch',
      'resolved.owner',
      (sealed.prepared as Record<string, CanonicalAuditValue>).resolved,
      source.prepared.resolved,
    );
    c(
      'attemptResultMismatch',
      'result.owner',
      (sealed.calculation as Record<string, CanonicalAuditValue>).result,
      source.calculation.result,
    );
    c(
      'attemptResultMismatch',
      'result.scenario',
      program.expected.scenario,
      source.calculation.scenario,
    );
    c(
      'attemptIdentityMismatch',
      'result.originalReference',
      true,
      source.calculation.result === authority.result,
    );
    c('attemptResultMismatch', 'result.application', sealed.calculation, source.calculation);
    c('attemptResultMismatch', 'result.status', 'rejected', source.calculation.status);
    c(
      'attemptResultMismatch',
      'result.notCalculated',
      false,
      source.calculation.result.status === 'calculated',
    );
    c(
      'attemptResultMismatch',
      'result.trace',
      source.prepared.resolved.trace,
      'trace' in source.calculation.result ? source.calculation.result.trace : undefined,
    );
    c(
      'attemptDownstreamLeak',
      'downstream.phaseConversion',
      undefined,
      capture.damageInputGenerated,
    );
    c('attemptDownstreamLeak', 'downstream.orderedPreparation', undefined, capture.orderedScenario);
    c('attemptDownstreamLeak', 'downstream.orderedExecution', undefined, capture.orderedExecution);
    c('attemptDownstreamLeak', 'downstream.orderedScenario', null, source.prepared.orderedScenario);
    c('attemptDownstreamLeak', 'downstream.canonicalInputs', null, source.prepared.canonicalInputs);
    c(
      'attemptDownstreamLeak',
      'downstream.executionObservation',
      undefined,
      source.calculation.executionObservation,
    );
    c(
      'attemptDownstreamLeak',
      'downstream.input',
      false,
      'input' in source.calculation || 'scenarioInput' in source.calculation,
    );
    c('attemptDownstreamLeak', 'downstream.effects', [], source.calculation.effects);
    c(
      'attemptDownstreamLeak',
      'downstream.contributions',
      [],
      source.calculation.effectiveContributions?.contributions,
    );
    c(
      'attemptCommitLeak',
      'result.appliedActions',
      failed.before.appliedActions,
      source.calculation.appliedPreparationActions,
    );
    boundaries.push({
      canonicalIdentity: program.canonicalIdentity,
      kind: changedAttempts ? 'changedNonCommit' : 'unchangedNonCommit',
      changedAttempts,
    });
  }
  return {
    canonicalIdentity: root,
    status: failures.length ? ('failed' as const) : ('passed' as const),
    boundaries,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
export function auditPublishedBattlePointPreparationAttempts(
  master: MasterDataSnapshot,
  programs: readonly BattlePointPreparationAttemptProgram[],
  observations: readonly BattlePointPreparationAttemptSource[],
) {
  const inventory = battlePointPreparationCanonicalInventory(master);
  const gate = auditBattlePointPreparationAttemptObservations({ expected: programs, observations });
  const selectedWriters = programs.flatMap((p) =>
    p.expected.writers.map((w) => ({
      ownerId: w.sourceId,
      skillId: w.skillId,
      occurrenceId: w.occurrenceId,
      operationIndex: w.operationIndex,
      domainId: w.domainId,
      operation: w.operation,
    })),
  );
  const missing = selectedWriters.filter(
    (w) =>
      !inventory.writers.some(
        (item) =>
          firstCanonicalAuditDifference(
            [{ identity: 'writer', value: snapshot(w) }],
            [{ identity: 'writer', value: snapshot(item) }],
          ) === null,
      ),
  );
  const failures: BattlePointPreparationAttemptFailure[] = [...gate.failures];
  for (const writer of missing) {
    const identity = `tsk-08:published-preparation-bp-attempt:${JSON.stringify([writer.ownerId, writer.skillId, writer.occurrenceId, writer.operationIndex])}`;
    const expected = snapshot(writer),
      actual = snapshot(undefined);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: expected }],
      [{ identity, value: actual }],
    )!;
    failures.push({
      reason: 'attemptPopulationMismatch',
      canonicalIdentity: identity,
      checkPath: 'published.population',
      expected,
      actual,
      firstDifference: { ...difference, path: 'published.population' },
    });
  }
  return {
    inventory,
    selectedWriters,
    gate,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
    status:
      gate.status === 'passed' && missing.length === 0 ? ('passed' as const) : ('failed' as const),
    missing,
  };
}
