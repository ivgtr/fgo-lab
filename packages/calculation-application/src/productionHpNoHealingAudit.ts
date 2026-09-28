import type { MasterEffect } from '@fgo-lab/master-data';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import type { HpProofDeclaration } from './productionHpProofCoverage';
import { scalarQuantitySnapshot } from './productionScalarQuantityAudit';
import {
  hpPreparationCanonicalFor,
  hpPreparationSource,
  type HpPreparationSelection,
} from './productionHpPreparationAudit';
import type { HpPublishedDependencyRequest } from './productionHpPublishedDependencyCoverage';
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';

type Modifier = Extract<MasterEffect['execution'][number], { kind: 'hpModifier' }>;
export function isEnemyNoHealing(
  operation: MasterEffect['execution'][number],
): operation is Modifier {
  return (
    operation.kind === 'hpModifier' &&
    operation.action === 'noHealing' &&
    operation.lifetime === 'active' &&
    operation.route.target === 'enemy' &&
    operation.selection === 'allEnemies'
  );
}

export function noHealingCanonical(prepared: PreparedCalculationScenario) {
  return hpPreparationCanonicalFor(prepared, isEnemyNoHealing, () => false);
}

export type NoHealingSelection = HpPreparationSelection<Modifier>;
export function noHealingSelection(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  requestIndex: number,
): NoHealingSelection | null {
  const canonical = noHealingCanonical(prepared);
  return canonical
    ? {
        index: requestIndex,
        identity: `hpNoHealing:${requestIndex}:${JSON.stringify(
          canonical.writers.map((writer) => [
            writer.sourceId,
            writer.form,
            writer.actionId,
            writer.skillId,
            writer.effect.occurrenceId,
            writer.operationIndex,
          ]),
        )}`,
        prepared,
        calculation,
        canonical,
      }
    : null;
}

export function noHealingSource(selection: NoHealingSelection) {
  return hpPreparationSource(selection);
}
export type NoHealingSource = ReturnType<typeof noHealingSource>;
export interface NoHealingProgram {
  selection: NoHealingSelection;
}
const authorities = new WeakMap<
  NoHealingProgram,
  {
    source: NoHealingSource;
    proof: ReturnType<typeof noHealingDiagnostic>;
  }
>();
export function noHealingProgram(selection: NoHealingSelection): NoHealingProgram {
  const program = { selection };
  const source = noHealingSource(selection);
  authorities.set(program, { source, proof: structuredClone(noHealingDiagnostic(source)) });
  return program;
}

export function noHealingDiagnostic(source: NoHealingSource) {
  return {
    identity: source.identity,
    masterVersion: source.master.version,
    status: source.calculation.status,
    availableActions: source.canonical.actions.map((action) => ({
      index: action.index,
      actionId: action.actionId,
      skillId: action.skillId,
      command: action.command,
    })),
    writers: source.canonical.writers.map((writer) => ({
      actionIndex: writer.actionIndex,
      actionId: writer.actionId,
      form: writer.form,
      sourceId: writer.sourceId,
      skillId: writer.skillId,
      occurrence: writer.effect.occurrenceId,
      operationIndex: writer.operationIndex,
      valueSetIndex: writer.valueSetIndex,
      valueIndex: writer.valueIndex,
      recipient: writer.operation.route.target,
      selection: writer.operation.selection,
    })),
    transitions:
      source.transitions?.map((transition, index) => ({
        index,
        command: transition.command,
        status: transition.result.status,
        actions:
          transition.hpActions?.map((action) => ({
            actionId: action.actionId,
            nativeStatus: action.native?.status ?? null,
            attemptedHp: action.attempted?.hp ?? null,
            returnedHp: action.returned?.hp ?? null,
            writes:
              action.noHealingWrites?.map((write) => ({
                sourceId: write.source.sourceId,
                skillId: write.source.skillId,
                occurrence: write.source.effect.occurrenceId,
                operationIndex: write.operationIndex,
                valueSetIndex: write.valueSetIndex,
                valueIndex: write.valueIndex,
                modifiers: write.modifiers.map((modifier) => ({
                  id: modifier.id,
                  actor: modifier.actor,
                  value: modifier.value,
                  operation: modifier.operation,
                })),
                beforeCount: write.before.modifiers?.length ?? 0,
                afterCount: write.after.modifiers?.length ?? 0,
              })) ?? [],
          })) ?? [],
      })) ?? [],
    physicalRead: 'notProvenByThisCapture' as const,
    recovery: 'notProvenByThisCapture' as const,
  };
}

export type NoHealingReason =
  | 'populationMismatch'
  | 'missingRequest'
  | 'duplicateRequest'
  | 'unmatchedRequest'
  | 'foreignIdentity'
  | 'foreignReference'
  | 'orderMismatch'
  | 'nativeMissing'
  | 'nativeMismatch'
  | 'recipientMismatch'
  | 'transactionMismatch'
  | 'proofMismatch';
export function auditNoHealing(input: {
  requests: readonly HpPublishedDependencyRequest[];
  declarations: readonly HpProofDeclaration[];
  expected: readonly NoHealingProgram[];
  observations: readonly NoHealingSource[];
}) {
  const failures: {
    reason: NoHealingReason;
    checkPath: string;
    expected: unknown;
    actual: unknown;
    firstDifference: ReturnType<typeof firstCanonicalAuditDifference>;
  }[] = [];
  const check = (
    reason: NoHealingReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const firstDifference = firstCanonicalAuditDifference(
      [{ identity: checkPath, value: scalarQuantitySnapshot(expected) }],
      [{ identity: checkPath, value: scalarQuantitySnapshot(actual) }],
    );
    if (firstDifference) failures.push({ reason, checkPath, expected, actual, firstDifference });
  };
  const selected = input.requests.flatMap((request, requestIndex) =>
    noHealingCanonical(request.prepared) ? [requestIndex] : [],
  );
  let reached = 0;
  let nativeAttempts = 0;
  let nativeCommitted = 0;
  let committedModifiers = 0;
  check('populationMismatch', 'selected.length', selected.length, input.expected.length);
  check(
    'populationMismatch',
    'observations.length',
    input.expected.length,
    input.observations.length,
  );
  const seen = new Set<number>();
  input.expected.forEach((program, index) => {
    const selection = program.selection;
    const requestIndex = selection.index;
    if (seen.has(requestIndex))
      check('duplicateRequest', `programs.${index}.requestIndex`, null, requestIndex);
    seen.add(requestIndex);
    check('orderMismatch', `programs.${index}.requestIndex`, selected[index] ?? null, requestIndex);
    const request = input.requests[requestIndex];
    if (!request) {
      check('missingRequest', `programs.${index}.request`, true, false);
      return;
    }
    if (request.prepared !== selection.prepared || request.calculation !== selection.calculation)
      check('foreignReference', `programs.${index}.request`, true, false);
    const authority = authorities.get(program);
    const observation = input.observations[index];
    if (!authority || !observation) {
      check('missingRequest', `programs.${index}.observation`, true, false);
      return;
    }
    check(
      'orderMismatch',
      `observations.${index}.identity`,
      authority.source.identity,
      observation.identity,
    );
    if (
      observation.selection !== selection ||
      observation.canonical !== selection.canonical ||
      observation.scenario !== request.prepared.scenario ||
      observation.calculation !== request.calculation ||
      observation.transport !== authority.source.transport
    )
      check('foreignReference', `observations.${index}.owner`, true, false);
    const canonical = noHealingCanonical(request.prepared);
    check(
      'foreignIdentity',
      `programs.${index}.identity`,
      canonical?.writers.map((writer) => [
        writer.sourceId,
        writer.skillId,
        writer.effect.occurrenceId,
        writer.operationIndex,
      ]),
      selection.canonical.writers.map((writer) => [
        writer.sourceId,
        writer.skillId,
        writer.effect.occurrenceId,
        writer.operationIndex,
      ]),
    );
    for (const writer of selection.canonical.writers) {
      const declaration = input.declarations.filter(
        (item) =>
          item.identity.kind === 'writer' &&
          item.identity.origin === 'attacker' &&
          item.identity.owner === writer.sourceId &&
          item.identity.skill === writer.skillId &&
          item.identity.occurrence === writer.effect.occurrenceId &&
          item.identity.path === `execution.${writer.operationIndex}` &&
          item.effect === writer.effect &&
          item.operation === writer.operation,
      );
      check('foreignIdentity', `programs.${index}.declaration`, 1, declaration.length);
      const transition = observation.transitions?.[writer.actionIndex];
      const action = transition?.hpActions?.find((item) => item.actionId === writer.actionId);
      check('nativeMissing', `observations.${index}.action`, true, !!action);
      if (!action) continue;
      nativeAttempts++;
      const writes = action.noHealingWrites?.filter(
        (write) =>
          write.source.sourceId === writer.sourceId &&
          write.source.skillId === writer.skillId &&
          write.source.effect === writer.effect &&
          write.operationIndex === writer.operationIndex,
      );
      reached += writes?.length ?? 0;
      const nativeStatus = action.native?.status;
      if (nativeStatus === 'committed') {
        nativeCommitted++;
        check(
          'nativeMismatch',
          `observations.${index}.transitionStatus`,
          'applied',
          transition?.result.status,
        );
        check('nativeMissing', `observations.${index}.writes`, 1, writes?.length ?? 0);
        for (const [writeIndex, write] of (writes ?? []).entries()) {
          committedModifiers += write.modifiers.length;
          check(
            'foreignReference',
            `observations.${index}.writes.${writeIndex}.source`,
            true,
            action.sources.includes(write.source),
          );
          check(
            'foreignReference',
            `observations.${index}.writes.${writeIndex}.operation`,
            true,
            write.operation === writer.operation,
          );
          check(
            'foreignIdentity',
            `observations.${index}.writes.${writeIndex}.cell`,
            [writer.valueSetIndex, writer.valueIndex],
            [write.valueSetIndex, write.valueIndex],
          );
          check(
            'recipientMismatch',
            `observations.${index}.writes.${writeIndex}.recipients`,
            ['enemy:0', 'enemy:1', 'enemy:2'],
            write.modifiers.map((modifier) => modifier.actor),
          );
          check(
            'nativeMismatch',
            `observations.${index}.writes.${writeIndex}.append`,
            (write.before.modifiers?.length ?? 0) + write.modifiers.length,
            write.after.modifiers?.length ?? 0,
          );
          check(
            'nativeMismatch',
            `observations.${index}.writes.${writeIndex}.retained`,
            true,
            write.modifiers.every(
              (modifier) => action.returned?.hp?.modifiers?.includes(modifier) === true,
            ),
          );
          check(
            'transactionMismatch',
            `observations.${index}.returned`,
            true,
            action.returned === action.attempted,
          );
        }
      } else if (nativeStatus) {
        check(
          'transactionMismatch',
          `observations.${index}.returned`,
          true,
          action.returned === action.start,
        );
      } else check('nativeMissing', `observations.${index}.native`, true, false);
    }
    check(
      'proofMismatch',
      `observations.${index}.proof`,
      authority.proof,
      noHealingDiagnostic(observation),
    );
  });
  for (const requestIndex of selected)
    if (!seen.has(requestIndex)) check('unmatchedRequest', `requests.${requestIndex}`, true, false);
  return {
    requestCount: input.requests.length,
    noCanonicalSelection: input.requests.length - selected.length,
    selected: selected.length,
    observed: input.observations.length,
    reached,
    nativeAttempts,
    nativeCommitted,
    committedModifiers,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
