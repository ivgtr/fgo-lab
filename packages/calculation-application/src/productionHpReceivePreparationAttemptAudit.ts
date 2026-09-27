import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  receiveCanonical,
  receiveDiagnostic,
  receiveSource,
  type ReceiveSelection,
  type ReceiveSource,
  type ReceiveRequest,
} from './productionHpReceivePreparationAudit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type { CalculationApplicationResult } from './scenario';

export type ReceiveAttemptBoundary =
  | 'attemptBeforeNative'
  | 'writerUnreached'
  | 'writerNotApplied'
  | 'consumerUnreached'
  | 'consumerActualZero'
  | 'nativeCommitted'
  | 'outsideScope';
export type ReceiveAttemptExpectation = { actionIndex: number } & (
  { kind: 'changedNoncommit' } | { kind: 'boundary'; boundary: ReceiveAttemptBoundary }
);
export type ReceiveAttemptReason =
  | 'receiveAttemptPopulationMismatch'
  | 'receiveAttemptCanonicalMismatch'
  | 'receiveAttemptIdentityMismatch'
  | 'receiveAttemptMissing'
  | 'receiveAttemptAppendMismatch'
  | 'receiveAttemptConsumptionMismatch'
  | 'receiveAttemptNativeMismatch'
  | 'receiveAttemptRetainedMismatch'
  | 'receiveAttemptReducerMismatch'
  | 'receiveAttemptTransportMismatch'
  | 'receiveAttemptDownstreamGenerated'
  | 'receiveAttemptBoundaryMismatch';
export type ReceiveAttemptSource = ReceiveSource;
export interface ReceiveAttemptProgram {
  selection: ReceiveSelection;
  expectation: ReceiveAttemptExpectation;
}

function value(v: unknown): CanonicalAuditValue {
  if (v === undefined) return { type: 'undefined' };
  if (v instanceof Set) return { type: 'set', values: [...v].map(value) };
  if (v instanceof Map)
    return { type: 'map', values: [...v].map(([k, x]) => [value(k), value(x)]) };
  if (Array.isArray(v)) return { type: 'array', values: v.map(value) };
  if (v !== null && typeof v === 'object')
    return {
      type: 'object',
      fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])),
    };
  return { type: typeof v, value: v as CanonicalAuditValue };
}

function canonicalObservation(prepared: ReceiveRequest['prepared']) {
  try {
    return receiveCanonical(prepared);
  } catch (error) {
    return { invalidCanonicalObservation: error instanceof Error ? error.message : String(error) };
  }
}

/** Full scoped values; references are bound separately, without traversing execution-state DAGs. */
export function receiveAttemptDiagnostic(
  s: ReceiveAttemptSource,
): Record<
  | 'canonical'
  | 'append'
  | 'consumption'
  | 'retained'
  | 'native'
  | 'reducer'
  | 'selected'
  | 'downstream',
  unknown
> {
  const d = receiveDiagnostic(s),
    servant = s.master.servants.find((x) => x.id === s.canonical.servantId);
  return {
    canonical: {
      identity: s.identity,
      canonical: d.canonical,
      master: { data: d.master, traits: servant?.traits },
      scenario: d.scenario,
    },
    append: s.transitions?.map((t) => t.hpActions?.map((n) => n.receiveWrites)),
    consumption: s.transitions?.map((t) =>
      t.hpActions?.map((n) => ({ reads: n.receiveConsumptions, gains: n.writes })),
    ),
    retained: {
      transitions: d.transitions,
      ordered: d.ordered,
      candidate: d.candidate,
      actorEnvironment: s.transitions?.map((t) => ({
        before: t.before.stateTraits,
        after: t.result.state.stateTraits,
        hp: t.hpActions?.map((n) => ({
          start: n.start.stateTraits,
          attempted: n.attempted?.stateTraits,
          returned: n.returned?.stateTraits,
        })),
      })),
    },
    reducer: s.transitions?.map((t) => ({
      result: {
        status: t.result.status,
        ...(t.result.status === 'rejected'
          ? {
              code: t.result.code,
              requiredInput: t.result.requiredInput,
              occurrenceId: t.result.requiredInputEffectOccurrenceId,
            }
          : {}),
      },
    })),
    native: s.transitions?.map((t) => ({
      attempts: t.attempts?.map((a) => ({
        actionId: a.actionId,
        native: a.native,
        reached: a.reached,
        stepOrigins: a.stepOrigins.map((o) => ({
          index: o.index,
          operationIndex: o.operationIndex,
          source: o.source,
        })),
        start: a.start.ocState,
        attempted: a.attempted,
        returned: a.returned?.ocState,
      })),
      hp: t.hpActions?.map((n) => ({
        native: n.native,
        rejectionInput: n.rejectionInput,
        sourceEnds: n.sourceEnds.map((e) => ({
          source: e.source,
          step: e.step,
          before: e.before.hp,
          after: e.after.hp,
          sourceStart: e.sourceStart?.hp,
          stochasticFailureSteps: e.stochasticFailureSteps,
        })),
      })),
    })),
    selected: {
      facade: d.facade,
      directResult: s.directResult,
      result: s.result,
      preparedStatus: s.selection.prepared.status,
      preparedResolved:
        s.selection.prepared.resolved.status === 'executable'
          ? { input: s.selection.prepared.resolved.input }
          : s.selection.prepared.resolved,
      canonicalInputs: s.selection.prepared.canonicalInputs,
      orderedScenario: s.selection.prepared.orderedScenario,
      transport: s.transport && {
        rejection: s.transport.rejection,
        orderedScenarioPresent: s.transport.orderedScenario !== undefined,
        orderedExecutionPresent: s.transport.orderedExecution !== undefined,
        damageInputGenerated: s.transport.damageInputGenerated,
      },
      observation: s.observation,
      input: s.input,
      effects: s.effects,
      contributions: s.contributions,
    },
    downstream: {
      orderedScenario: d.ordered,
      orderedScenarioPresent: s.transport?.orderedScenario !== undefined,
      orderedExecutionPresent: s.transport?.orderedExecution !== undefined,
      damageInput: s.transport?.damageInputGenerated,
      applicationInput: s.input,
      preparedInput:
        s.selection.prepared.resolved.status === 'executable'
          ? s.selection.prepared.resolved.input
          : undefined,
      canonicalInputs: s.selection.prepared.canonicalInputs,
      candidate: d.candidate,
      observation: s.observation,
    },
  };
}

function anchors(s: ReceiveAttemptSource) {
  const refs: Record<string, unknown> = {};
  const add = (p: string, v: unknown) => {
    refs[p] = v;
  };
  for (const k of [
    'selection',
    'master',
    'scenario',
    'transport',
    'calculation',
    'directResult',
    'result',
    'candidate',
    'observation',
    'input',
  ] as const)
    add(k, s[k]);
  add('prepared', s.selection.prepared);
  add('prepared.resolved', s.selection.prepared.resolved);
  add('transport.transitions', s.transport?.transitions);
  add('transport.rejection', s.transport?.rejection);
  add('calculation.capture', battlePointPreparationRejectionObservationFor(s.calculation));
  add('result.capture', battlePointPreparationRejectionObservationFor(s.result));
  add('direct.capture', battlePointPreparationRejectionObservationFor(s.directResult));
  const hp = (p: string, h: unknown) => {
    add(p, h);
    if (!h || typeof h !== 'object') return;
    for (const k of ['actors', 'modifiers', 'receipts', 'executedEffects']) {
      const x: unknown = Reflect.get(h, k);
      add(`${p}.${k}`, x);
      if (Array.isArray(x)) x.forEach((v: unknown, i: number) => add(`${p}.${k}.${i}`, v));
      else if (x && typeof x === 'object' && k === 'actors')
        for (const [k2, v] of Object.entries(x)) add(`${p}.actors.${k2}`, v);
    }
  };
  s.transport?.transitions.forEach((t, i) => {
    add(`reducer.${i}`, t);
    add(`reducer.${i}.before`, t.before);
    add(`reducer.${i}.result`, t.result);
    add(`reducer.${i}.state`, t.result.state);
  });
  s.transitions?.forEach((t, i) => {
    const p = `transition.${i}`;
    add(`${p}.command`, t.command);
    hp(`${p}.before`, t.before.hp);
    hp(`${p}.after`, t.result.state.hp);
    add(`${p}.prefix`, t.result.state.appliedActions);
    t.result.state.appliedActions.forEach((a, j) => {
      add(`${p}.prefix.${j}`, a);
      add(`${p}.prefix.${j}.command`, a.command);
      hp(`${p}.prefix.${j}.before`, a.hpBefore);
      hp(`${p}.prefix.${j}.after`, a.hpAfter);
    });
    t.attempts?.forEach((a, j) => {
      const q = `${p}.attempt.${j}`;
      add(q, a);
      add(`${q}.native`, a.native);
      add(`${q}.origins`, a.stepOrigins);
      add(`${q}.reached`, a.reached);
      a.stepOrigins.forEach((o, k) => {
        add(`${q}.origin.${k}`, o);
        add(`${q}.origin.${k}.source`, o.source);
      });
      a.reached.forEach((r, k) => add(`${q}.reached.${k}`, r));
    });
    t.hpActions?.forEach((n, j) => {
      const q = `${p}.hp.${j}`;
      add(q, n);
      for (const k of [
        'start',
        'attempted',
        'returned',
        'native',
        'rejectionInput',
        'sources',
        'receiveWrites',
        'receiveConsumptions',
        'writes',
        'sourceEnds',
      ] as const)
        add(`${q}.${k}`, n[k]);
      hp(`${q}.start.hp`, n.start.hp);
      hp(`${q}.attempted.hp`, n.attempted?.hp);
      hp(`${q}.returned.hp`, n.returned?.hp);
      n.sources.forEach((src, k) => {
        add(`${q}.source.${k}`, src);
        add(`${q}.source.${k}.effect`, src.effect);
        src.effect.execution.forEach((op, l) => add(`${q}.source.${k}.operation.${l}`, op));
      });
      for (const kind of ['receiveWrites', 'writes'] as const)
        n[kind]?.forEach((w, k) => {
          const z = `${q}.${kind}.${k}`;
          add(z, w);
          add(`${z}.source`, w.source);
          hp(`${z}.before`, w.before);
          hp(`${z}.after`, w.after);
          add(`${z}.receipts`, w.receipts);
          w.receipts.forEach((r, l) => add(`${z}.receipt.${l}`, r));
          if ('modifiers' in w) {
            add(`${z}.operation`, Reflect.get(w, 'operation'));
            add(`${z}.modifiers`, w.modifiers);
            if (Array.isArray(w.modifiers))
              w.modifiers.forEach((m: unknown, l: number) => add(`${z}.modifier.${l}`, m));
          }
        });
      n.receiveConsumptions?.forEach((r, k) => {
        const z = `${q}.read.${k}`;
        add(z, r);
        add(`${z}.source`, r.source);
        add(`${z}.consumption`, r.consumption);
        const h = r.consumption;
        for (const key of ['before', 'receive', 'mutation', 'result'] as const)
          add(`${z}.${key}`, h[key]);
        hp(`${z}.modifierState`, h.modifierState);
        add(`${z}.instances`, h.receive.instances);
        h.receive.instances.forEach((m, l) => add(`${z}.instance.${l}`, m));
        if (h.result.status === 'applied') add(`${z}.result.actor`, h.result.actor);
      });
      n.sourceEnds.forEach((e, k) => {
        const z = `${q}.end.${k}`;
        add(z, e);
        add(`${z}.source`, e.source);
        hp(`${z}.before`, e.before.hp);
        hp(`${z}.after`, e.after.hp);
        hp(`${z}.sourceStart`, e.sourceStart?.hp);
      });
    });
  });
  return refs;
}

const authorities = new WeakMap<
  ReceiveAttemptProgram,
  {
    proof: ReturnType<typeof receiveAttemptDiagnostic>;
    references: ReturnType<typeof anchors>;
    expectation: ReceiveAttemptExpectation;
    canonical: unknown;
  }
>();
export function receiveAttemptProgram(
  selection: ReceiveSelection,
  expectation: ReceiveAttemptExpectation,
  directResult: CalculationApplicationResult,
): ReceiveAttemptProgram {
  const p = { selection, expectation },
    s = receiveSource(selection, directResult);
  authorities.set(p, {
    proof: structuredClone(receiveAttemptDiagnostic(s)),
    references: anchors(s),
    expectation: structuredClone(expectation),
    canonical: structuredClone(selection.canonical),
  });
  return p;
}

type Check = {
  identity: string;
  reason: ReceiveAttemptReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
};
type Failure = Check & {
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
};
type Checker = (
  reason: ReceiveAttemptReason,
  path: string,
  expected: unknown,
  actual: unknown,
) => void;
function inspectConsumption(s: ReceiveAttemptSource, actionIndex: number, c: Checker) {
  const ai = actionIndex,
    action = s.canonical.actions[ai],
    t = s.transitions?.[ai],
    n = t?.hpActions?.find((n) => n.actionId === action?.actionId),
    attempt = t?.attempts?.find((a) => a.actionId === action?.actionId);
  const writers = s.canonical.writers.filter((w) => w.actionIndex === ai);
  const reject = [...(attempt?.reached ?? [])].reverse().find((r) => r.step.kind === 'reject');
  const inputReached = n?.rejectionInput
    ? [...(attempt?.reached ?? [])]
        .reverse()
        .find(
          (r) =>
            r.step.kind === 'grant' &&
            attempt?.stepOrigins.find((o) => o.index === r.index)?.source.effect.occurrenceId ===
              n.rejectionInput?.occurrenceId,
        )
    : undefined;
  const rejectIndex = reject?.index ?? inputReached?.index;
  const origin = (source: unknown, index: number) =>
    attempt?.stepOrigins.find((o) => o.source === source && o.operationIndex === index);
  let localAppended = 0,
    localConsumed = 0,
    localChanged = 0;
  if (n && t) {
    const captured = (effect: unknown, operationIndex: number) => {
      const source = n.sources.find((src) => src.effect === effect);
      const step = origin(source, operationIndex);
      return (
        source?.sourceEnabled === true &&
        source.preparationStochasticOutcome !== 'failure' &&
        step !== undefined &&
        attempt?.reached.some((r) => r.index === step.index) === true &&
        (rejectIndex === undefined || step.index < rejectIndex)
      );
    };
    c(
      'receiveAttemptAppendMismatch',
      'target.writeOrder',
      writers
        .filter((w) => captured(w.effect, w.operationIndex))
        .map((w) => [w.effect.occurrenceId, w.operationIndex]),
      (n.receiveWrites ?? []).map((w) => [w.source.effect.occurrenceId, w.operationIndex]),
    );
    const consumerKeys = [
      ...new Map(
        s.canonical.consumers
          .filter((x) => x.actionIndex === ai && captured(x.effect, x.operationIndex))
          .map((x) => [
            `${x.effect.occurrenceId}:${x.operationIndex}`,
            [x.effect.occurrenceId, x.operationIndex],
          ]),
      ).values(),
    ];
    c(
      'receiveAttemptConsumptionMismatch',
      'target.gainOrder',
      consumerKeys,
      n.writes.map((w) => [w.source.effect.occurrenceId, w.operationIndex]),
    );
    c(
      'receiveAttemptRetainedMismatch',
      'target.start',
      [true, true],
      [n.start.appliedActions === t.before.appliedActions, n.start.hp === t.before.hp],
    );
    for (const [i, w] of writers.entries()) {
      const path = `target.writer.${i}`,
        src = n.sources.find((src) => src.origin === 'attacker' && src.effect === w.effect),
        write = n.receiveWrites?.find(
          (x) => x.source === src && x.operationIndex === w.operationIndex,
        );
      if (!write) continue;
      c(
        'receiveAttemptCanonicalMismatch',
        `${path}.source`,
        [w.origin, w.sourceId, w.sourceInstanceId, w.skillId, w.valueSetIndex, w.valueIndex],
        [
          src?.origin,
          src?.sourceId,
          src?.sourceInstanceId,
          src?.skillId,
          src?.valueSetIndex,
          src?.valueIndex,
        ],
      );
      c(
        'receiveAttemptAppendMismatch',
        `${path}.population`,
        write.modifiers.length ? [1, 1] : [0, 0],
        [write.modifiers.length, write.receipts.length],
      );
      const m = write.modifiers[0],
        r = write.receipts[0];
      if (!m || !r) continue;
      c(
        'receiveAttemptIdentityMismatch',
        `${path}.operation`,
        [true, true],
        [write.operation === w.operation, m.operation === w.operation],
      );
      c(
        'receiveAttemptCanonicalMismatch',
        `${path}.cell`,
        [w.valueSetIndex, w.valueIndex, w.operation.values[w.valueSetIndex]?.[w.valueIndex]],
        [write.valueSetIndex, write.valueIndex, m.value],
      );
      c(
        'receiveAttemptAppendMismatch',
        `${path}.instance`,
        [
          `${w.actionId}:${src?.sourceInstanceId}:${w.effect.occurrenceId}`,
          w.actor,
          src?.constantFormKey ?? null,
        ],
        [m.id, m.actor, m.formKey],
      );
      c(
        'receiveAttemptAppendMismatch',
        `${path}.append`,
        [write.before.modifiers ?? [], write.before.receipts, write.before.actors],
        [
          write.after.modifiers?.slice(0, -1),
          write.after.receipts.slice(0, -1),
          write.after.actors,
        ],
      );
      c(
        'receiveAttemptAppendMismatch',
        `${path}.receipt`,
        [w.actionId, w.effect.occurrenceId, w.actor, 0, 0, true, true, true],
        [
          r.actionId,
          r.occurrenceId,
          r.actor,
          r.attempted,
          r.actual,
          r.before === write.before.actors.attacker,
          r.after === write.after.actors.attacker,
          write.after.receipts.at(-1) === r,
        ],
      );
      localAppended++;
      for (const [j, consumer] of s.canonical.consumers.filter((x) => x.writer === w).entries()) {
        const z = `${path}.consumer.${j}`,
          gain = n.writes.find(
            (x) =>
              x.source.effect === consumer.effect && x.operationIndex === consumer.operationIndex,
          );
        if (!gain || !gain.receipts.length) continue;
        const reads =
          n.receiveConsumptions?.filter(
            (x) => x.source === gain.source && x.operationIndex === consumer.operationIndex,
          ) ?? [];
        c('receiveAttemptConsumptionMismatch', `${z}.population`, 1, reads.length);
        const read = reads[0],
          receipt = gain.receipts[0];
        if (!read || !receipt) continue;
        const h = read.consumption,
          gs = origin(gain.source, consumer.operationIndex),
          ws = origin(src, w.operationIndex);
        c(
          'receiveAttemptNativeMismatch',
          `${z}.beforeReject`,
          true,
          !!gs &&
            !!ws &&
            (rejectIndex === undefined || gs.index < rejectIndex) &&
            ws.index < gs.index,
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.instance`,
          true,
          h.receive.instances.includes(m),
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.instances`,
          gain.before.modifiers?.filter(
            (m) => m.actor === w.actor && m.operation.action === 'receive',
          ),
          h.receive.instances,
        );
        c(
          'receiveAttemptCanonicalMismatch',
          `${z}.source`,
          [
            w.sourceId,
            w.sourceInstanceId,
            w.skillId,
            consumer.valueSetIndex,
            consumer.valueIndex,
            true,
          ],
          [
            read.source.sourceId,
            read.source.sourceInstanceId,
            read.source.skillId,
            read.valueSetIndex,
            read.valueIndex,
            read.source.effect.execution[read.operationIndex] === consumer.operation,
          ],
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.input`,
          [
            w.actor,
            true,
            'gain',
            'fixed',
            consumer.operation.kind === 'resourceMutation' &&
            consumer.operation.amount.kind === 'fixed'
              ? consumer.operation.amount.values[consumer.valueSetIndex]?.[consumer.valueIndex]
              : undefined,
          ],
          [
            h.actor,
            h.before === gain.before.actors.attacker,
            h.mutation.direction,
            h.mutation.unit,
            h.mutation.amount,
          ],
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.modifierState`,
          [true, true],
          [
            h.modifierState.actors === gain.before.actors,
            h.modifierState.receipts === gain.before.receipts,
          ],
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.resolvedValue`,
          h.receive.value,
          h.mutation.receive,
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.environment`,
          [1000, false],
          [h.mutation.give, h.mutation.noHealing],
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.receipt`,
          [w.actionId, consumer.effect.occurrenceId, w.actor, true, true, true],
          [
            receipt.actionId,
            receipt.occurrenceId,
            receipt.actor,
            receipt.before === h.before,
            receipt.after === gain.after.actors.attacker,
            gain.after.receipts.at(-1) === receipt,
          ],
        );
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.transition`,
          h.result.status === 'applied'
            ? [h.result.actor, h.result.attempted, h.result.actual]
            : h.result,
          [receipt.after, receipt.attempted, receipt.actual],
        );
        c(
          'receiveAttemptIdentityMismatch',
          `${z}.transitionReference`,
          true,
          h.result.status === 'applied' && h.result.actor === receipt.after,
        );
        localConsumed++;
        const hpChanged =
          receipt.before.kind === 'absolute' &&
          receipt.after.kind === 'absolute' &&
          receipt.before.current !== receipt.after.current;
        c(
          'receiveAttemptConsumptionMismatch',
          `${z}.changed`,
          receipt.actual !== null && receipt.actual > 0,
          hpChanged,
        );
        if (receipt.actual !== null && receipt.actual > 0 && hpChanged) localChanged++;
      }
    }
    const timeline = [
      ...(n.receiveWrites ?? []),
      ...n.writes,
      ...n.sourceEnds.map((e) => ({
        source: e.source,
        operationIndex: Number.MAX_SAFE_INTEGER,
        before: e.before.hp,
        after: e.after.hp,
      })),
    ].sort(
      (a, b) =>
        n.sources.indexOf(a.source) - n.sources.indexOf(b.source) ||
        a.operationIndex - b.operationIndex,
    );
    let previous = n.start.hp;
    for (const [i, e] of timeline.entries()) {
      c('receiveAttemptRetainedMismatch', `target.timeline.${i}`, previous, e.before);
      previous = e.after;
    }
    c(
      'receiveAttemptRetainedMismatch',
      'target.timeline.attempted',
      previous,
      n.commitStartHp ?? n.attempted?.hp,
    );
  }
  return { localAppended, localConsumed, localChanged };
}
function inspectRefusal(s: ReceiveAttemptSource, actionIndex: number, c: Checker) {
  const ai = actionIndex,
    action = s.canonical.actions[ai],
    t = s.transitions?.[ai],
    n = t?.hpActions?.find((n) => n.actionId === action?.actionId),
    attempt = t?.attempts?.find((a) => a.actionId === action?.actionId);
  const native = n?.native;
  const reject = [...(attempt?.reached ?? [])].reverse().find((r) => r.step.kind === 'reject');
  const inputReached = n?.rejectionInput
    ? [...(attempt?.reached ?? [])]
        .reverse()
        .find(
          (r) =>
            r.step.kind === 'grant' &&
            attempt?.stepOrigins.find((o) => o.index === r.index)?.source.effect.occurrenceId ===
              n.rejectionInput?.occurrenceId,
        )
    : undefined;
  const rejectIndex = reject?.index ?? inputReached?.index;
  if (native && native.status !== 'committed' && t) {
    c('receiveAttemptNativeMismatch', 'target.attempt', true, !!attempt);
    c('receiveAttemptNativeMismatch', 'target.rejectStep', true, rejectIndex !== undefined);
    c('receiveAttemptNativeMismatch', 'target.nativeOwner', true, attempt?.native === native);
    c(
      'receiveAttemptNativeMismatch',
      'target.rejectOutcome',
      [native.status, native.reason],
      reject?.step.kind === 'reject'
        ? [reject.step.status, reject.step.reason]
        : attempt?.native?.status === 'inputRequired'
          ? [attempt.native.status, attempt.native.reason]
          : null,
    );
    c(
      'receiveAttemptNativeMismatch',
      'target.rejectOrigin',
      true,
      !!attempt?.stepOrigins.find((o) => o.index === rejectIndex),
    );
    c('receiveAttemptNativeMismatch', 'target.nativeRollback', n.start.ocState, native.state);
    c(
      'receiveAttemptRetainedMismatch',
      'target.returned',
      [true, true, true],
      [
        n.returned === n.start,
        n.returned?.hp === t.before.hp,
        n.returned?.appliedActions === t.before.appliedActions,
      ],
    );
    c(
      'receiveAttemptRetainedMismatch',
      'target.reducer',
      [true, true, true],
      [
        t.result.state === t.before,
        t.result.state.hp === t.before.hp,
        t.result.state.appliedActions === t.before.appliedActions,
      ],
    );
    c('receiveAttemptReducerMismatch', 'target.status', 'rejected', t.result.status);
    const refusal = s.transport?.rejection;
    c(
      'receiveAttemptReducerMismatch',
      'target.operationId',
      `preparation:${s.canonical.servantId}:${action?.command.kind}`,
      refusal?.rejection.operationId,
    );
    c(
      'receiveAttemptReducerMismatch',
      'target.code',
      t.result.status === 'rejected' ? t.result.code : null,
      refusal?.rejection.code,
    );
    c(
      'receiveAttemptReducerMismatch',
      'target.requiredInput',
      n.rejectionInput?.requiredInput ?? null,
      t.result.status === 'rejected' ? t.result.requiredInput : null,
    );
    c(
      'receiveAttemptReducerMismatch',
      'target.occurrence',
      n.rejectionInput?.occurrenceId ?? null,
      t.result.status === 'rejected' ? t.result.requiredInputEffectOccurrenceId : null,
    );
    if (native.status === 'inputRequired')
      c(
        'receiveAttemptNativeMismatch',
        'target.inputOrigin',
        n.rejectionInput?.occurrenceId,
        attempt?.stepOrigins.find((o) => o.index === inputReached?.index)?.source.effect
          .occurrenceId,
      );
    c(
      'receiveAttemptReducerMismatch',
      'target.preparedRefusal',
      refusal ? [refusal.rejection.code, refusal.rejection.operationId] : null,
      s.selection.prepared.status === 'rejected'
        ? [
            s.selection.prepared.resolved.preparationRejection.code,
            s.selection.prepared.resolved.preparationRejection.operationId,
          ]
        : null,
    );
    c('receiveAttemptTransportMismatch', 'selected.results', s.calculation.result, s.directResult);
    c(
      'receiveAttemptTransportMismatch',
      'selected.owners',
      [true, true, true, true],
      [
        s.transport === battlePointPreparationRejectionObservationFor(s.selection.prepared),
        s.transport === battlePointPreparationRejectionObservationFor(s.calculation),
        s.transport === battlePointPreparationRejectionObservationFor(s.calculation.result),
        s.transport === battlePointPreparationRejectionObservationFor(s.directResult),
      ],
    );
    c(
      'receiveAttemptDownstreamGenerated',
      'downstream.status',
      ['rejected', 'rejected', native.status === 'inputRequired' ? 'inputRequired' : 'unsupported'],
      [s.selection.prepared.status, s.calculation.status, s.directResult.status],
    );
    c(
      'receiveAttemptDownstreamGenerated',
      'downstream.absent',
      [null, null, undefined, undefined, undefined, undefined, undefined, undefined],
      [
        s.selection.prepared.orderedScenario,
        s.selection.prepared.canonicalInputs,
        s.transport?.orderedScenario,
        s.transport?.orderedExecution,
        s.transport?.damageInputGenerated,
        s.candidate,
        s.input,
        s.observation,
      ],
    );
  }
}
export function auditReceiveAttemptIsolation(input: {
  requests: readonly ReceiveRequest[];
  expected: readonly ReceiveAttemptProgram[];
  observations: readonly ReceiveAttemptSource[];
}) {
  const checks: Check[] = [],
    failures: Failure[] = [],
    boundaries: { identity: string; reason: ReceiveAttemptBoundary }[] = [];
  let appended = 0,
    consumed = 0,
    changed = 0,
    isolated = 0;
  const check = (
    identity: string,
    reason: ReceiveAttemptReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const item = { identity, reason, checkPath, expected: value(expected), actual: value(actual) };
    checks.push(item);
    const diff = firstCanonicalAuditDifference(
      [{ identity, value: item.expected }],
      [{ identity, value: item.actual }],
    );
    if (diff)
      failures.push({
        ...item,
        firstDifference: { ...diff, path: diff.path ? `${checkPath}.${diff.path}` : checkPath },
      });
  };
  const pop = (p: string, e: unknown, a: unknown) =>
    check('hpReceiveAttempt:population', 'receiveAttemptPopulationMismatch', p, e, a);
  pop(
    'population.requests',
    input.requests.filter((r) => canonicalObservation(r.prepared) !== null).length,
    input.expected.length,
  );
  pop(
    'population.observations',
    input.expected.map((p) => p.selection.identity),
    input.observations.map((s) => s.identity),
  );
  pop(
    'population.unique',
    input.expected.length,
    new Set(input.expected.map((p) => p.selection.identity)).size,
  );
  pop(
    'population.requestUnique',
    input.requests.length,
    new Set(input.requests.map((r) => r.prepared)).size,
  );
  for (const p of input.expected) {
    const id = p.selection.identity,
      c = (r: ReceiveAttemptReason, k: string, e: unknown, a: unknown) => check(id, r, k, e, a);
    const authority = authorities.get(p),
      s = input.observations.find((s) => s.identity === id),
      request = input.requests.find((r) => r.prepared === p.selection.prepared);
    c('receiveAttemptMissing', 'source', true, !!s);
    c('receiveAttemptMissing', 'authority', true, !!authority);
    c('receiveAttemptMissing', 'request', true, !!request);
    if (!s || !authority || !request) continue;
    c(
      'receiveAttemptIdentityMismatch',
      'request.references',
      [true, true],
      [request.calculation === p.selection.calculation, s.selection === p.selection],
    );
    c(
      'receiveAttemptCanonicalMismatch',
      'canonical.owner',
      authority.canonical,
      canonicalObservation(request.prepared),
    );
    c('receiveAttemptCanonicalMismatch', 'canonical.selection', authority.canonical, s.canonical);
    c('receiveAttemptIdentityMismatch', 'expectation', authority.expectation, p.expectation);
    const proof = receiveAttemptDiagnostic(s),
      reasons = {
        canonical: 'receiveAttemptCanonicalMismatch',
        append: 'receiveAttemptAppendMismatch',
        consumption: 'receiveAttemptConsumptionMismatch',
        retained: 'receiveAttemptRetainedMismatch',
        native: 'receiveAttemptNativeMismatch',
        reducer: 'receiveAttemptReducerMismatch',
        selected: 'receiveAttemptTransportMismatch',
        downstream: 'receiveAttemptDownstreamGenerated',
      } as const;
    for (const key of Object.keys(reasons) as (keyof typeof reasons)[])
      c(reasons[key], `proof.${key}`, authority.proof[key], proof[key]);
    const refs = anchors(s);
    c(
      'receiveAttemptIdentityMismatch',
      'reference.population',
      Object.keys(authority.references),
      Object.keys(refs),
    );
    for (const [key, ref] of Object.entries(authority.references))
      c('receiveAttemptIdentityMismatch', `reference.${key}`, true, refs[key] === ref);
    if (failures.some((f) => f.identity === id)) continue;
    if (s.canonical.scopeBoundaries.length) {
      c(
        'receiveAttemptBoundaryMismatch',
        'target.classification',
        p.expectation.kind === 'boundary' ? p.expectation.boundary : null,
        'outsideScope',
      );
      boundaries.push({ identity: id, reason: 'outsideScope' });
      continue;
    }
    const ai = p.expectation.actionIndex,
      action = s.canonical.actions[ai],
      t = s.transitions?.[ai],
      n = t?.hpActions?.find((n) => n.actionId === action?.actionId),
      attempt = t?.attempts?.find((a) => a.actionId === action?.actionId);
    const writers = s.canonical.writers.filter((w) => w.actionIndex === ai);
    c('receiveAttemptCanonicalMismatch', 'target.action', true, !!action);
    if (!action) continue;
    if (t) c('receiveAttemptIdentityMismatch', 'target.command', action.command, t.command);
    if (t) c('receiveAttemptCanonicalMismatch', 'target.form', action.form, t.before.currentFormId);
    if (ai && t)
      c(
        'receiveAttemptRetainedMismatch',
        'target.prefix',
        true,
        t.before === s.transitions?.[ai - 1]?.result.state,
      );
    const native = n?.native;
    const reject = [...(attempt?.reached ?? [])].reverse().find((r) => r.step.kind === 'reject');
    const inputReached = n?.rejectionInput
      ? [...(attempt?.reached ?? [])]
          .reverse()
          .find(
            (r) =>
              r.step.kind === 'grant' &&
              attempt?.stepOrigins.find((o) => o.index === r.index)?.source.effect.occurrenceId ===
                n.rejectionInput?.occurrenceId,
          )
      : undefined;
    const rejectIndex = reject?.index ?? inputReached?.index;
    const { localAppended, localConsumed, localChanged } = inspectConsumption(s, ai, c);
    let boundary: ReceiveAttemptBoundary | null = null;
    if (s.canonical.scopeBoundaries.length) boundary = 'outsideScope';
    else if (!t || !native) boundary = 'attemptBeforeNative';
    else if (native.status === 'committed') boundary = 'nativeCommitted';
    else if (!localAppended)
      boundary = attempt?.stepOrigins.some(
        (o) =>
          writers.some(
            (w) => o.source.effect === w.effect && o.operationIndex === w.operationIndex,
          ) &&
          (rejectIndex === undefined || o.index < rejectIndex),
      )
        ? 'writerNotApplied'
        : 'writerUnreached';
    else if (!localConsumed) boundary = 'consumerUnreached';
    else if (!localChanged) boundary = 'consumerActualZero';
    c(
      'receiveAttemptBoundaryMismatch',
      'target.classification',
      p.expectation.kind === 'changedNoncommit' ? null : p.expectation.boundary,
      boundary,
    );
    inspectRefusal(s, ai, c);
    if (boundary) boundaries.push({ identity: id, reason: boundary });
    else if (!failures.some((f) => f.identity === id)) isolated++;
    appended += localAppended;
    consumed += localConsumed;
    changed += localChanged;
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    expected: input.expected.map((p) => p.selection.identity),
    appended,
    consumed,
    changed,
    isolated,
    boundaries,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
