import {
  preparationBattlePointStepsFor,
  type PreparationBattlePointStep,
} from '@fgo-lab/battle-execution/preparation-audit';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  canonicalAuditDigest,
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  battlePointCapacityAttemptCanonical,
  battlePointCapacityAttemptRejectionProgram,
  battlePointPreparationAttemptSource,
  auditBattlePointPreparationAttemptObservations,
  type BattlePointPreparationAttemptProgram,
  type BattlePointPreparationAttemptSource,
  type BattlePointPreparationAttemptFailure,
} from './productionBattlePointPreparationAttemptAudit';
import { battlePointCapacityCanonicalInventory } from './productionBattlePointCapacityPreparationAudit';
import { scalarQuantitySnapshot as snapshot } from './productionScalarQuantityAudit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';

export interface BattlePointCapacityAttemptSelection {
  canonicalIdentity: string;
  writers: CanonicalAuditValue;
}
export interface BattlePointCapacityAttemptProgram {
  canonicalIdentity: string;
  selection: BattlePointCapacityAttemptSelection;
  rejection: BattlePointPreparationAttemptProgram;
}
export interface BattlePointCapacityAttemptSource {
  program: BattlePointCapacityAttemptProgram;
  rejection: BattlePointPreparationAttemptSource;
  steps: readonly (readonly PreparationBattlePointStep[] | undefined)[];
}

type SourceProof = Omit<Partial<BattlePointCapacityAttemptSource>, 'rejection'> & {
  rejection?: Partial<BattlePointCapacityAttemptSource['rejection']>;
};
function hasFields(value: unknown, keys: readonly string[]) {
  return (
    value !== null &&
    typeof value === 'object' &&
    keys.every((key) => Reflect.get(value, key) !== undefined)
  );
}

/** Membership comes from commands/master/choice, including unreached and non-applied writers. */
export function battlePointCapacityAttemptSelection(
  prepared: PreparedCalculationScenario,
  evaluationIndex = 0,
): BattlePointCapacityAttemptSelection | null {
  const expected = battlePointCapacityAttemptCanonical(prepared);
  const writers = expected?.writers.filter(
    (w) => w.operation.kind === 'battlePointCapacityModifier',
  );
  if (!expected || !writers?.length) return null;
  return {
    canonicalIdentity: `tsk-08:preparation-bp-capacity-attempt:${canonicalAuditDigest([{ identity: 'selection', value: snapshot([expected, prepared.contributionPolicy, prepared.preparation, evaluationIndex]) }])}`,
    writers: snapshot(writers),
  };
}

function view(source: SourceProof) {
  const r = source.rejection;
  // Keep the complete prepared transport, including forbidden extra input/observation fields.
  // The selected canonical contract above owns master evidence without unrelated master graphs.
  const prepared =
    r?.prepared &&
    Object.fromEntries(Object.entries(r.prepared).filter(([key]) => key !== 'master'));
  return {
    selection: source.program?.selection,
    canonical: r?.program?.expected,
    capture: r?.capture,
    steps: source.steps,
    prepared,
    calculation: r?.calculation,
  };
}
function references(source: BattlePointCapacityAttemptSource) {
  return source.steps.map((steps) => ({
    steps,
    entries: steps?.map((step) => ({ step, ...step })),
  }));
}
const authorities = new WeakMap<
  BattlePointCapacityAttemptProgram,
  {
    selection: CanonicalAuditValue;
    owner: CanonicalAuditValue;
    rejection: BattlePointPreparationAttemptProgram;
    references: ReturnType<typeof references>;
  }
>();
export function battlePointCapacityAttemptProgram(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  evaluationIndex = 0,
): BattlePointCapacityAttemptProgram | null {
  const selection = battlePointCapacityAttemptSelection(prepared, evaluationIndex);
  if (!selection) return null;
  const rejection = battlePointCapacityAttemptRejectionProgram(
    prepared,
    calculation,
    evaluationIndex,
  );
  if (!rejection) throw new TypeError('capacity_attempt_canonical_program_missing');
  const program = { canonicalIdentity: selection.canonicalIdentity, selection, rejection };
  const source = battlePointCapacityAttemptSource(program);
  authorities.set(program, {
    selection: snapshot(selection),
    owner: snapshot(view(source)),
    rejection,
    references: references(source),
  });
  return program;
}
export function battlePointCapacityAttemptSource(
  program: BattlePointCapacityAttemptProgram,
): BattlePointCapacityAttemptSource {
  const rejection = battlePointPreparationAttemptSource(program.rejection);
  return {
    program,
    rejection,
    steps:
      rejection.capture?.transitions.map((t) => preparationBattlePointStepsFor(t.result)) ?? [],
  };
}
export function battlePointCapacityAttemptDiagnostic(source: SourceProof): unknown {
  return view(source);
}

type Failure = BattlePointPreparationAttemptFailure;
type Reason = Failure['reason'];
export function auditBattlePointCapacityPreparationAttempts(input: {
  selections: readonly BattlePointCapacityAttemptSelection[];
  expected: readonly BattlePointCapacityAttemptProgram[];
  observations: readonly SourceProof[];
}) {
  const failures: Failure[] = [];
  const boundaries: {
    canonicalIdentity: string;
    kind: 'changedCapacity' | 'modifierOnly' | 'notApplicable' | 'beforeAttempt' | 'committed';
    changedCapacityWrites: number;
    modifierWrites: number;
  }[] = [];
  const check = (
    identity: string,
    reason: Reason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const wanted = snapshot(expected),
      observed = snapshot(actual);
    const diff = firstCanonicalAuditDifference(
      [{ identity, value: wanted }],
      [{ identity, value: observed }],
    );
    if (diff)
      failures.push({
        reason,
        canonicalIdentity: identity,
        checkPath,
        expected: wanted,
        actual: observed,
        firstDifference: { ...diff, path: diff.path ? `${checkPath}.${diff.path}` : checkPath },
      });
  };
  const root = 'tsk-08:preparation-bp-capacity-attempt';
  check(
    root,
    'attemptPopulationMismatch',
    'capacity.population.selections',
    input.selections,
    input.expected.map((p) => p.selection),
  );
  check(
    root,
    'attemptPopulationMismatch',
    'capacity.population.observations',
    input.expected.map((p) => p.canonicalIdentity),
    input.observations.map((s) => s.program?.canonicalIdentity),
  );
  check(
    root,
    'attemptPopulationMismatch',
    'capacity.population.unique',
    input.selections.length,
    new Set(input.selections.map((s) => s.canonicalIdentity)).size,
  );
  for (const p of input.expected) {
    const c = (reason: Reason, path: string, expected: unknown, actual: unknown) =>
      check(p.canonicalIdentity, reason, path, expected, actual);
    const source = input.observations.find(
      (s) => s.program?.canonicalIdentity === p.canonicalIdentity,
    );
    if (!source) continue;
    const authority = authorities.get(p);
    c('attemptTransportMissing', 'capacity.authority', true, !!authority);
    if (!authority) continue;
    c('attemptCanonicalMismatch', 'capacity.selection', authority.selection, p.selection);
    c(
      'attemptIdentityMismatch',
      'capacity.identity',
      p.selection.canonicalIdentity,
      p.canonicalIdentity,
    );
    c('attemptIdentityMismatch', 'capacity.program', true, source.program === p);
    c(
      'attemptIdentityMismatch',
      'capacity.rejectionProgram',
      true,
      p.rejection === authority.rejection && source.rejection?.program === authority.rejection,
    );
    c('attemptTransportMissing', 'capacity.rejection', true, !!source.rejection);
    if (!source.rejection) continue;
    const common = auditBattlePointPreparationAttemptObservations({
      expected: [authority.rejection],
      observations: [source.rejection],
    });
    failures.push(
      ...common.failures.map((f) => ({
        ...f,
        canonicalIdentity: p.canonicalIdentity,
        firstDifference: { ...f.firstDifference, identity: p.canonicalIdentity },
      })),
    );
    c('attemptStateMismatch', 'capacity.owner', authority.owner, view(source));
    if (!source.rejection.prepared || !source.rejection.calculation || !source.rejection.program)
      continue;
    const transitions = source.rejection.capture?.transitions;
    c('attemptTransportMissing', 'capacity.transitions', true, !!transitions);
    c('attemptTransportMissing', 'capacity.steps', true, !!source.steps);
    if (!transitions || !source.steps) continue;
    c('attemptPopulationMismatch', 'capacity.steps.count', transitions.length, source.steps.length);
    const saved = authority.owner as Record<string, CanonicalAuditValue>;
    const savedSteps = saved.steps as CanonicalAuditValue[];
    // Committed selections remain a boundary here; their full forward proof belongs to the strict committed gate.
    if (source.rejection.prepared.status !== 'rejected') {
      boundaries.push({
        canonicalIdentity: p.canonicalIdentity,
        kind: 'committed',
        changedCapacityWrites: 0,
        modifierWrites: 0,
      });
      continue;
    }
    let changedCapacityWrites = 0,
      modifierWrites = 0,
      reachedCapacityWrites = 0;
    for (const [index, t] of transitions.entries()) {
      const path = `capacity.action.${index}`;
      if (!hasFields(t, ['before', 'command', 'result'])) continue;
      const attempt = t.attempts?.[0];
      const steps = source.steps[index];
      const original = authority.references[index];
      c('attemptTransportMissing', `${path}.timeline`, true, !!steps);
      if (!steps) continue;
      c(
        'attemptIdentityMismatch',
        `${path}.timelineReference`,
        true,
        steps === original?.steps && steps === preparationBattlePointStepsFor(t.result),
      );
      c('attemptStateMismatch', `${path}.timelineOwner`, savedSteps[index], steps);
      c(
        'attemptPopulationMismatch',
        `${path}.writes`,
        attempt?.writes ?? [],
        steps.flatMap((s) => (s.kind === 'write' ? [s.write] : [])),
      );
      if (attempt && !hasFields(attempt, ['writes'])) continue;
      let cursor = t.before.battlePoints;
      for (const [i, step] of steps.entries()) {
        const sp = `${path}.step.${i}`;
        const ref = original?.entries?.[i];
        c('attemptIdentityMismatch', `${sp}.reference`, true, step === ref?.step);
        if (step.kind === 'write') {
          c('attemptTransportMissing', `${sp}.write`, true, hasFields(step, ['write']));
          if (!hasFields(step, ['write'])) continue;
          const w: Partial<typeof step.write> = step.write;
          c(
            'attemptTransportMissing',
            `${sp}.states`,
            true,
            !!w.before && !!w.after && !!w.receipts && !!w.source,
          );
          if (!w.before || !w.after || !w.receipts || !w.source) continue;
          c(
            'attemptIdentityMismatch',
            `${sp}.attemptWrite`,
            true,
            attempt?.actionId === step.actionId && attempt.writes.includes(step.write),
          );
          c('attemptOrderMismatch', `${sp}.before`, true, w.before === cursor);
          cursor = w.after;
          const sourceEffect = w.source;
          const writer = p.rejection.expected.writers.find(
            (wrt) =>
              wrt.commandIndex === index &&
              wrt.occurrenceId === sourceEffect.effect.occurrenceId &&
              wrt.operationIndex === w.operationIndex,
          );
          const op = writer?.operation;
          c('attemptCanonicalMismatch', `${sp}.writer`, true, !!writer);
          if (!writer || !op) continue;
          c(
            'attemptIdentityMismatch',
            `${sp}.indices`,
            [0, t.command.kind === 'useSkillSlot' ? t.command.skillLevel - 1 : null],
            [w.source.valueSetIndex, w.source.valueIndex],
          );
          c(
            'attemptStateMismatch',
            `${sp}.receiptAppend`,
            [...w.before.receipts, ...w.receipts],
            w.after.receipts,
          );
          c(
            'attemptCommitLeak',
            `${sp}.executedEffects`,
            w.before.executedEffects,
            w.after.executedEffects,
          );
          if (op.kind !== 'battlePointCapacityModifier') continue;
          if (t.result.status === 'rejected') reachedCapacityWrites++;
          const before = w.before.actors[writer.actor]?.domains[writer.domainId!];
          const after = w.after.actors[writer.actor]?.domains[writer.domainId!];
          const applicable = w.status === 'applied' && before?.kind === 'present';
          c(
            'attemptPopulationMismatch',
            `${sp}.receiptCount`,
            applicable ? 1 : 0,
            w.receipts.length,
          );
          const receipt = w.receipts[0];
          if (!applicable || after?.kind !== 'present') continue;
          c(
            'attemptTransportMissing',
            `${sp}.modifierLists`,
            true,
            hasFields(before, ['capacityModifiers']) && hasFields(after, ['capacityModifiers']),
          );
          if (!hasFields(before, ['capacityModifiers']) || !hasFields(after, ['capacityModifiers']))
            continue;
          const identity = JSON.stringify([
            attempt?.actionId,
            writer.sourceInstanceId,
            writer.occurrenceId,
            writer.operationIndex,
          ]);
          c(
            'attemptIdentityMismatch',
            `${sp}.receiptIdentity`,
            [identity, writer.actor, writer.domainId],
            receipt && [receipt.identity, receipt.actor, receipt.domainId],
          );
          c(
            'attemptIdentityMismatch',
            `${sp}.receiptState`,
            true,
            receipt?.before === before && receipt.after === after,
          );
          const amount =
            op.values[0][t.command.kind === 'useSkillSlot' ? t.command.skillLevel - 1 : -1];
          c(
            'attemptStateMismatch',
            `${sp}.modifiers`,
            [
              ...before.capacityModifiers,
              { identity, amount, lifetime: op.lifetime, traits: op.traits },
            ],
            after.capacityModifiers,
          );
          c(
            'attemptIdentityMismatch',
            `${sp}.modifierReference`,
            true,
            before.capacityModifiers.every((m, j) => m === after.capacityModifiers[j]),
          );
          if (t.result.status === 'rejected') {
            modifierWrites++;
            if (
              before.capacity !== null &&
              after.capacity !== null &&
              (before.capacity !== after.capacity || before.point !== after.point)
            )
              changedCapacityWrites++;
          }
        } else if (step.kind === 'sourceEnd') {
          c('attemptOrderMismatch', `${sp}.sourceEnd`, true, step.state === cursor);
          c(
            'attemptIdentityMismatch',
            `${sp}.source`,
            true,
            ref?.kind === 'sourceEnd' && step.source === ref.source && step.state === ref.state,
          );
        } else if (step.kind === 'reconcile') {
          c(
            'attemptTransportMissing',
            `${sp}.reconcileStates`,
            true,
            hasFields(step, ['before', 'after']),
          );
          if (!hasFields(step, ['before', 'after'])) continue;
          c(
            'attemptIdentityMismatch',
            `${sp}.reconcileReference`,
            true,
            ref?.kind === 'reconcile' &&
              step.before === ref.before &&
              step.after === ref.after &&
              step.domains === ref.domains &&
              step.source === ref.source,
          );
          c(
            'attemptOrderMismatch',
            `${sp}.reconcileBefore`,
            true,
            step.before.battlePoints === cursor,
          );
          c(
            'attemptStateMismatch',
            `${sp}.reconcileReceipts`,
            cursor.receipts,
            step.after.battlePoints.receipts,
          );
          c(
            'attemptCommitLeak',
            `${sp}.reconcileEffects`,
            cursor.executedEffects,
            step.after.battlePoints.executedEffects,
          );
          c(
            'attemptCommitLeak',
            `${sp}.rejectedReducer`,
            false,
            t.result.status === 'rejected' && step.owner === 'reducer',
          );
          cursor = step.after.battlePoints;
        } else {
          c('attemptCommitLeak', `${sp}.commit`, 'applied', t.result.status);
          c('attemptOrderMismatch', `${sp}.commitBefore`, true, step.before === cursor);
          c(
            'attemptIdentityMismatch',
            `${sp}.commitReference`,
            true,
            ref?.kind === 'commit' && step.before === ref.before && step.after === ref.after,
          );
          cursor = step.after;
        }
      }
      if (t.result.status === 'rejected') {
        c('attemptStateMismatch', `${path}.attempted`, true, attempt?.attempted === cursor);
        c(
          'attemptStateMismatch',
          `${path}.retained`,
          true,
          t.result.state === t.before && attempt?.returned?.battlePoints === t.before.battlePoints,
        );
      } else {
        c(
          'attemptStateMismatch',
          `${path}.priorRetained`,
          true,
          cursor === t.result.state.battlePoints,
        );
        c('attemptNativeMismatch', `${path}.priorCommit`, 'committed', attempt?.native?.status);
      }
    }
    boundaries.push({
      canonicalIdentity: p.canonicalIdentity,
      kind: changedCapacityWrites
        ? 'changedCapacity'
        : modifierWrites
          ? 'modifierOnly'
          : reachedCapacityWrites
            ? 'notApplicable'
            : 'beforeAttempt',
      changedCapacityWrites,
      modifierWrites,
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

export function auditPublishedBattlePointCapacityPreparationAttempts(
  master: MasterDataSnapshot,
  selections: readonly BattlePointCapacityAttemptSelection[],
  programs: readonly BattlePointCapacityAttemptProgram[],
  observations: readonly BattlePointCapacityAttemptSource[],
) {
  const inventory = battlePointCapacityCanonicalInventory(master);
  const gate = auditBattlePointCapacityPreparationAttempts({
    selections,
    expected: programs,
    observations,
  });
  const selected = programs.flatMap((p) =>
    p.rejection.expected.writers.filter((w) => w.operation.kind === 'battlePointCapacityModifier'),
  );
  const missing = selected.filter(
    (w) =>
      !inventory.declarations.some(
        (d) =>
          d.ownerId === w.sourceId &&
          d.skillId === w.skillId &&
          d.occurrenceId === w.occurrenceId &&
          d.operationIndex === w.operationIndex &&
          firstCanonicalAuditDifference(
            [{ identity: 'operation', value: snapshot(d.operation) }],
            [{ identity: 'operation', value: snapshot(w.operation) }],
          ) === null,
      ),
  );
  const failures = [...gate.failures];
  const populationDifference = firstCanonicalAuditDifference(
    [{ identity: gate.canonicalIdentity, value: [] }],
    [{ identity: gate.canonicalIdentity, value: snapshot(missing) }],
  );
  if (populationDifference)
    failures.push({
      reason: 'attemptPopulationMismatch',
      canonicalIdentity: gate.canonicalIdentity,
      checkPath: 'capacity.published.population',
      expected: [],
      actual: snapshot(missing),
      firstDifference: {
        ...populationDifference,
        path: `capacity.published.population.${populationDifference.path}`,
      },
    });
  return {
    inventory,
    selections,
    selected,
    gate,
    failures,
    status: failures.length ? ('failed' as const) : ('passed' as const),
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
