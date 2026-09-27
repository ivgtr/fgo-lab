import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  giveCanonical,
  giveDiagnostic,
  giveSource,
  type GiveRequest,
  type GiveSource,
} from './productionHpGivePreparationAudit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type { CalculationApplicationResult } from './scenario';
import type { giveSelection } from './productionHpGivePreparationAudit';

type Selection = NonNullable<ReturnType<typeof giveSelection>>;
export type GiveAttemptBoundary =
  | 'outsideScope'
  | 'attemptBeforeNative'
  | 'nativeCommitted'
  | 'writerUnreached'
  | 'writerNotApplied'
  | 'consumerUnreached'
  | 'consumerActualZero'
  | 'giveReadExcluded';
export type GiveAttemptExpectation = { actionIndex: number } & (
  { kind: 'changedNoncommit' } | { kind: 'boundary'; boundary: GiveAttemptBoundary }
);
export type GiveAttemptReason =
  | 'giveAttemptPopulationMismatch'
  | 'giveAttemptMissing'
  | 'giveAttemptIdentityMismatch'
  | 'giveAttemptProofMismatch'
  | 'giveAttemptAppendMismatch'
  | 'giveAttemptConsumptionMismatch'
  | 'giveAttemptNativeMismatch'
  | 'giveAttemptRetainedMismatch'
  | 'giveAttemptTransportMismatch'
  | 'giveAttemptDownstreamGenerated'
  | 'giveAttemptBoundaryMismatch';
export type GiveAttemptSource = GiveSource & { directResult: CalculationApplicationResult };
export interface GiveAttemptProgram {
  selection: Selection;
  expectation: GiveAttemptExpectation;
}
export function giveAttemptSource(
  selection: Selection,
  directResult: CalculationApplicationResult,
): GiveAttemptSource {
  return { ...giveSource(selection), directResult };
}
function value(v: unknown): CanonicalAuditValue {
  if (v === undefined) return { type: 'undefined' };
  if (v instanceof Map)
    return { type: 'map', entries: [...v].map(([k, x]) => [value(k), value(x)]) };
  if (v instanceof Set) return { type: 'set', values: [...v].map(value) };
  if (Array.isArray(v)) return { type: 'array', values: v.map(value) };
  if (v !== null && typeof v === 'object')
    return {
      type: 'object',
      fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])),
    };
  return { type: typeof v, value: v as CanonicalAuditValue };
}
/** Full original values, including rejection steps omitted by the committed-forward contract. */
export function giveAttemptDiagnostic(s: GiveAttemptSource) {
  return {
    forward: giveDiagnostic(s),
    attempts: s.transitions?.map((t) => t.attempts),
    reducers: s.transitions?.map((t) => ({ before: t.before, result: t.result })),
    excludedReads: s.transitions?.map((t) => t.hpActions?.map((a) => a.giveExcludedConsumptions)),
    directResult: s.directResult,
  };
}
/** Borrow original owner references; no state traversal or replay, and no product allocation. */
function references(s: GiveAttemptSource): unknown[] {
  return [
    s.selection,
    s.selection.prepared,
    s.calculation,
    s.directResult,
    s.master,
    s.scenario,
    s.transport,
    s.ordered,
    s.candidate,
    s.input,
    s.observation,
    s.result,
    s.effects,
    s.contributions,
    ...s.canonical.writers.flatMap((w) => [w.effect, w.operation]),
    ...s.canonical.consumers.flatMap((g) => [g.effect, g.operation]),
    ...(s.transitions?.flatMap((t) => [
      t.before,
      t.result,
      t.result.state,
      t.result.state.hp,
      ...(t.attempts?.flatMap((a) => [
        a.start,
        a.native,
        a.returned,
        ...a.sources,
        ...a.stepOrigins.flatMap((o) => [o.source]),
        ...a.reached.map((r) => r.step),
      ]) ?? []),
      ...(t.hpActions?.flatMap((a) => [
        a.start,
        a.start.hp,
        a.attempted,
        a.attempted?.hp,
        a.returned,
        a.returned?.hp,
        a.native,
        a.commitStartHp,
        ...a.sources,
        ...a.sourceEnds.flatMap((e) => [e.source, e.before, e.after, e.sourceStart]),
        ...(a.giveWrites?.flatMap((w) => [
          w.source,
          w.operation,
          w.before,
          w.after,
          ...w.modifiers,
          ...w.receipts,
          ...w.receipts.flatMap((r) => [r.before, r.after]),
        ]) ?? []),
        ...(a.giveGains?.flatMap((g) => [
          g.source,
          g.before,
          g.after,
          ...g.receipts,
          ...g.receipts.flatMap((r) => [r.before, r.after]),
        ]) ?? []),
        ...[...(a.giveConsumptions ?? []), ...(a.giveExcludedConsumptions ?? [])].flatMap((r) => [
          r.source,
          r.consumption.before,
          r.consumption.modifierState,
          r.consumption.result,
          ...r.consumption.give.instances,
          ...r.consumption.receive.instances,
        ]),
      ]) ?? []),
    ]) ?? []),
  ];
}
const authorities = new WeakMap<
  GiveAttemptProgram,
  {
    expectation: GiveAttemptExpectation;
    proof: ReturnType<typeof giveAttemptDiagnostic>;
    references: unknown[];
  }
>();
export function giveAttemptProgram(
  selection: Selection,
  expectation: GiveAttemptExpectation,
  directResult: CalculationApplicationResult,
): GiveAttemptProgram {
  const program = { selection, expectation },
    source = giveAttemptSource(selection, directResult);
  authorities.set(program, {
    expectation: structuredClone(expectation),
    proof: structuredClone(giveAttemptDiagnostic(source)),
    references: references(source),
  });
  return program;
}
export function auditGiveAttemptIsolation(input: {
  requests: readonly GiveRequest[];
  expected: readonly GiveAttemptProgram[];
  observations: readonly GiveAttemptSource[];
}) {
  const checks: {
    identity: string;
    reason: GiveAttemptReason;
    path: string;
    expected: CanonicalAuditValue;
    actual: CanonicalAuditValue;
  }[] = [];
  const failures: ((typeof checks)[number] & {
    firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
  })[] = [];
  const boundaries: { identity: string; reason: GiveAttemptBoundary }[] = [];
  const check = (
    identity: string,
    reason: GiveAttemptReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const item = { identity, reason, path, expected: value(expected), actual: value(actual) };
    checks.push(item);
    const diff = firstCanonicalAuditDifference(
      [{ identity, value: item.expected }],
      [{ identity, value: item.actual }],
    );
    if (diff)
      failures.push({
        ...item,
        firstDifference: { ...diff, path: diff.path ? `${path}.${diff.path}` : path },
      });
  };
  const pop = (path: string, e: unknown, a: unknown) =>
    check('hpGiveAttempt:population', 'giveAttemptPopulationMismatch', path, e, a);
  const selected = input.requests.filter((r) => giveCanonical(r.prepared) !== null);
  pop('requests', selected.length, input.expected.length);
  pop(
    'observations',
    input.expected.map((p) => p.selection.identity),
    input.observations.map((s) => s.identity),
  );
  pop('requestUnique', input.requests.length, new Set(input.requests.map((r) => r.prepared)).size);
  pop(
    'expectedUnique',
    input.expected.length,
    new Set(input.expected.map((p) => p.selection.identity)).size,
  );
  pop(
    'observationUnique',
    input.observations.length,
    new Set(input.observations.map((s) => s.identity)).size,
  );
  let appended = 0,
    excludedReads = 0,
    consumed = 0,
    changed = 0,
    isolated = 0;
  for (const program of input.expected) {
    const id = program.selection.identity,
      authority = authorities.get(program),
      s = input.observations.find((s) => s.identity === id),
      request = selected.find((r) => r.prepared === program.selection.prepared);
    const c = (reason: GiveAttemptReason, path: string, e: unknown, a: unknown) =>
      check(id, reason, path, e, a);
    c('giveAttemptMissing', 'owners', [true, true, true], [!!authority, !!s, !!request]);
    if (!authority || !s || !request) continue;
    c(
      'giveAttemptIdentityMismatch',
      'request',
      [true, true, true],
      [
        s.selection === program.selection,
        request.calculation === s.calculation,
        s.calculation === program.selection.calculation,
      ],
    );
    c('giveAttemptProofMismatch', 'expectation', authority.expectation, program.expectation);
    c(
      'giveAttemptProofMismatch',
      'canonical',
      authority.proof.forward.canonical,
      giveCanonical(request.prepared),
    );
    const proof = giveAttemptDiagnostic(s);
    for (const key of Object.keys(proof) as (keyof typeof proof)[])
      c('giveAttemptProofMismatch', `proof.${key}`, authority.proof[key], proof[key]);
    const refs = references(s);
    c(
      'giveAttemptIdentityMismatch',
      'references',
      authority.references.map(() => true),
      refs.map((r, i) => r === authority.references[i]),
    );
    if (failures.some((f) => f.identity === id)) continue;
    const ai = program.expectation.actionIndex,
      action = s.canonical.actions[ai],
      t = s.transitions?.[ai],
      n = t?.hpActions?.find((a) => a.actionId === action?.actionId),
      attempt = t?.attempts?.find((a) => a.actionId === action?.actionId);
    c('giveAttemptIdentityMismatch', 'action', true, !!action);
    if (!action) continue;
    if (s.canonical.scopeBoundaries.length) {
      c(
        'giveAttemptBoundaryMismatch',
        'classification',
        program.expectation.kind === 'boundary' ? program.expectation.boundary : null,
        'outsideScope',
      );
      boundaries.push({ identity: id, reason: 'outsideScope' });
      continue;
    }
    if (t) {
      c('giveAttemptIdentityMismatch', 'action.command', action.command, t.command);
      c('giveAttemptIdentityMismatch', 'action.form', action.form, t.before.currentFormId);
    }
    const allActions = s.transitions?.flatMap((t) => t.hpActions ?? []) ?? [];
    const writes = allActions.flatMap((a) =>
      (a.giveWrites ?? []).map((w) => ({ action: a, write: w })),
    );
    // Every captured append must match a canonical writer, including uncommitted same-action writers.
    for (const [i, { action: a, write: w }] of writes.entries()) {
      const p = `append.${i}`,
        writer = s.canonical.writers.find(
          (x) =>
            x.actionId === a.actionId &&
            x.effect === w.source.effect &&
            x.operationIndex === w.operationIndex,
        );
      c('giveAttemptAppendMismatch', `${p}.writer`, true, !!writer);
      if (!writer) continue;
      c(
        'giveAttemptAppendMismatch',
        `${p}.unique`,
        1,
        writes.filter(
          (x) =>
            x.action.actionId === a.actionId &&
            x.write.source.effect === writer.effect &&
            x.write.operationIndex === writer.operationIndex,
        ).length,
      );
      c(
        'giveAttemptIdentityMismatch',
        `${p}.source`,
        [writer.sourceInstanceId, writer.sourceId, writer.skillId, true, true],
        [
          w.source.sourceInstanceId,
          w.source.sourceId,
          w.source.skillId,
          w.operation === writer.operation,
          w.source.effect.execution[w.operationIndex] === writer.operation,
        ],
      );
      if (!w.modifiers.length && !w.receipts.length) {
        c('giveAttemptAppendMismatch', `${p}.nonapplication`, true, w.before === w.after);
        continue;
      }
      c(
        'giveAttemptAppendMismatch',
        `${p}.cardinality`,
        [1, 1],
        [w.modifiers.length, w.receipts.length],
      );
      const m = w.modifiers[0],
        r = w.receipts[0];
      if (!m || !r) continue;
      c(
        'giveAttemptAppendMismatch',
        `${p}.cell`,
        [
          writer.valueSetIndex,
          writer.valueIndex,
          writer.operation.values[writer.valueSetIndex]?.[writer.valueIndex],
        ],
        [w.valueSetIndex, w.valueIndex, m.value],
      );
      c(
        'giveAttemptIdentityMismatch',
        `${p}.instance`,
        [
          `${writer.actionId}:${writer.sourceInstanceId}:${writer.effect.occurrenceId}`,
          'attacker',
          true,
        ],
        [m.id, m.actor, m.operation === writer.operation],
      );
      c(
        'giveAttemptAppendMismatch',
        `${p}.prefix`,
        [w.before.modifiers ?? [], w.before.receipts, w.before.actors],
        [w.after.modifiers?.slice(0, -1), w.after.receipts.slice(0, -1), w.after.actors],
      );
      c(
        'giveAttemptIdentityMismatch',
        `${p}.receipt`,
        [writer.actionId, writer.effect.occurrenceId, 'attacker', 0, 0, true, true, true],
        [
          r.actionId,
          r.occurrenceId,
          r.actor,
          r.attempted,
          r.actual,
          r.before === w.before.actors.attacker,
          r.after === w.after.actors.attacker,
          w.after.receipts.at(-1) === r,
        ],
      );
      const writerAttempt = s.transitions?.[writer.actionIndex]?.attempts?.find(
        (x) => x.actionId === writer.actionId,
      );
      const writerOrigin = writerAttempt?.stepOrigins.find(
        (o) => o.source === w.source && o.operationIndex === w.operationIndex,
      );
      c(
        'giveAttemptNativeMismatch',
        `${p}.reached`,
        true,
        !!writerOrigin &&
          writerAttempt?.reached.some((r) => r.index === writerOrigin.index) === true,
      );
      appended++;
    }
    const initialModifiers = allActions[0]?.start.hp?.modifiers ?? [];
    const observedModifiers = new Set(
      allActions.flatMap((a) => [
        ...(a.attempted?.hp?.modifiers ?? []),
        ...a.sourceEnds.flatMap((e) => e.after.hp?.modifiers ?? []),
        ...(a.giveGains?.flatMap((g) => g.before.modifiers ?? []) ?? []),
      ]),
    );
    for (const [i, m] of [...observedModifiers].entries()) {
      if (
        !initialModifiers.includes(m) &&
        s.canonical.writers.some((w) => w.operation === m.operation)
      )
        c(
          'giveAttemptAppendMismatch',
          `append.observedInstance.${i}`,
          1,
          writes.filter(({ write: w }) => w.modifiers.includes(m)).length,
        );
    }
    for (const [i, a] of allActions.entries()) {
      if (i)
        c(
          'giveAttemptRetainedMismatch',
          `chain.${i}.hp`,
          true,
          a.start.hp === allActions[i - 1]?.returned?.hp,
        );
      const newReceipts =
        a.attempted?.hp?.receipts.filter((r) => !a.start.hp?.receipts.includes(r)) ?? [];
      const capturedReceipts = [...(a.giveWrites ?? []), ...(a.giveGains ?? [])].flatMap(
        (w) => w.receipts,
      );
      c(
        'giveAttemptRetainedMismatch',
        `chain.${i}.receiptPopulation`,
        newReceipts.map(() => 1),
        newReceipts.map((r) => capturedReceipts.filter((x) => x === r).length),
      );
      const ownerAttempt = s.transitions
        ?.flatMap((t) => t.attempts ?? [])
        .find((x) => x.actionId === a.actionId);
      const progress = [
        ...a.sourceEnds.map((e) => ({ step: e.step, hp: e.after.hp })),
        ...[...(a.giveWrites ?? []), ...(a.giveGains ?? [])].flatMap((w) => {
          const origin = ownerAttempt?.stepOrigins.find(
            (o) => o.source === w.source && o.operationIndex === w.operationIndex,
          );
          return origin ? [{ step: origin.index, hp: w.after }] : [];
        }),
      ].sort((x, y) => x.step - y.step);
      // A refusal can interrupt a source before its sourceEnd; use the last original reached write.
      const last = progress.length ? progress.at(-1)!.hp : a.start.hp;
      if (a.native?.status !== 'committed')
        c('giveAttemptRetainedMismatch', `chain.${i}.attempted`, true, a.attempted?.hp === last);
      if (a.native?.status === 'committed') {
        c('giveAttemptRetainedMismatch', `chain.${i}.committed`, true, a.returned === a.attempted);
        if (a.commitStartHp) {
          c(
            'giveAttemptRetainedMismatch',
            `chain.${i}.markersOnly`,
            [true, true, true],
            [
              a.returned?.hp?.actors === a.commitStartHp.actors,
              a.returned?.hp?.modifiers === a.commitStartHp.modifiers,
              a.returned?.hp?.receipts === a.commitStartHp.receipts,
            ],
          );
        }
      }
    }
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
    let localConsumed = 0,
      localExcluded = 0,
      localChanged = 0;
    const consumers = s.canonical.consumers.filter((g) => g.actionIndex === ai);
    c(
      'giveAttemptConsumptionMismatch',
      'gain.capturePopulation',
      n?.giveGains?.map(() => 1) ?? [],
      n?.giveGains?.map(
        (gain) =>
          consumers.filter(
            (g) => g.effect === gain.source.effect && g.operationIndex === gain.operationIndex,
          ).length,
      ) ?? [],
    );
    c(
      'giveAttemptConsumptionMismatch',
      'read.capturePopulation',
      [...(n?.giveConsumptions ?? []), ...(n?.giveExcludedConsumptions ?? [])].map(() => 1),
      [...(n?.giveConsumptions ?? []), ...(n?.giveExcludedConsumptions ?? [])].map(
        (read) =>
          consumers.filter(
            (g) =>
              g.effect === read.source.effect &&
              g.operationIndex === read.operationIndex &&
              n?.giveGains?.some(
                (gain) =>
                  gain.source === read.source && gain.operationIndex === read.operationIndex,
              ),
          ).length,
      ),
    );
    for (const [i, g] of consumers.entries()) {
      const gains =
          n?.giveGains?.filter(
            (w) => w.source.effect === g.effect && w.operationIndex === g.operationIndex,
          ) ?? [],
        p = `gain.${i}`;
      c('giveAttemptConsumptionMismatch', `${p}.unique`, true, gains.length <= 1);
      const gain = gains[0];
      if (!gain) continue;
      const receipts = gain.receipts.filter((r) => r.actor !== 'excluded');
      const reads = [...(n?.giveConsumptions ?? []), ...(n?.giveExcludedConsumptions ?? [])]
        .filter((r) => r.source === gain.source && r.operationIndex === g.operationIndex)
        .sort(
          (a, b) =>
            receipts.findIndex((r) => r.actor === a.consumption.actor) -
            receipts.findIndex((r) => r.actor === b.consumption.actor),
        );
      const instances =
        gain.before.modifiers?.filter(
          (m) => m.actor === 'attacker' && m.operation.action === 'give',
        ) ?? [];
      if (!instances.length) {
        c('giveAttemptConsumptionMismatch', `${p}.noPriorRead`, 0, reads.length);
        continue;
      }
      c(
        'giveAttemptConsumptionMismatch',
        `${p}.population`,
        receipts.map((r) => r.actor),
        reads.map((r) => r.consumption.actor),
      );
      const origin = attempt?.stepOrigins.find(
        (o) => o.source === gain.source && o.operationIndex === g.operationIndex,
      );
      c(
        'giveAttemptNativeMismatch',
        `${p}.reachedBeforeRefusal`,
        true,
        !!origin &&
          attempt?.reached.some((r) => r.index === origin.index) === true &&
          (rejectIndex === undefined || origin.index < rejectIndex),
      );
      for (const [j, read] of reads.entries()) {
        const h = read.consumption,
          r = receipts[j],
          q = `${p}.read.${j}`;
        if (!r) continue;
        c(
          'giveAttemptIdentityMismatch',
          `${q}.source`,
          [g.skillId, g.valueSetIndex, g.valueIndex, true],
          [
            read.source.skillId,
            read.valueSetIndex,
            read.valueIndex,
            read.source.effect.execution[read.operationIndex] === g.operation,
          ],
        );
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.actors`,
          ['attacker', r.actor],
          [h.give.actor, h.actor],
        );
        c(
          'giveAttemptIdentityMismatch',
          `${q}.readInstances`,
          (
            h.modifierState.modifiers?.filter(
              (m) => m.actor === h.give.actor && m.operation.action === 'give',
            ) ?? []
          ).map(() => true),
          h.give.instances.map(
            (m, k) =>
              m ===
                h.modifierState.modifiers?.filter(
                  (x) => x.actor === h.give.actor && x.operation.action === 'give',
                )[k] && instances.includes(m),
          ),
        );
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.priorWriters`,
          true,
          h.give.instances.every((m) =>
            writes.some(
              ({ action: a, write: w }) =>
                w.modifiers.includes(m) &&
                g.writers.some(
                  (x) =>
                    x.actionId === a.actionId &&
                    x.effect === w.source.effect &&
                    x.operationIndex === w.operationIndex,
                ) &&
                (a === n ||
                  (a.native?.status === 'committed' && a.returned?.hp?.modifiers?.includes(m))),
            ),
          ),
        );
        const priorReceipts = [...gain.before.receipts, ...receipts.slice(0, j)];
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.modifierState`,
          [true, true],
          [
            h.modifierState.actors[h.actor] === r.before,
            h.modifierState.receipts.length === gain.before.receipts.length + j &&
              h.modifierState.receipts.every((receipt, k) => receipt === priorReceipts[k]),
          ],
        );
        c(
          'giveAttemptIdentityMismatch',
          `${q}.sourceActor`,
          [s.canonical.writers[0]?.sourceInstanceId, s.canonical.servantId],
          [read.source.sourceInstanceId, read.source.sourceId],
        );
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.input`,
          [
            'gain',
            'fixed',
            g.operation.kind === 'resourceMutation' && g.operation.amount.kind === 'fixed'
              ? g.operation.amount.values[g.valueSetIndex]?.[g.valueIndex]
              : undefined,
            h.give.value,
            h.receive.value,
          ],
          [
            h.mutation.direction,
            h.mutation.unit,
            h.mutation.amount,
            h.mutation.give,
            h.mutation.receive,
          ],
        );
        c(
          'giveAttemptIdentityMismatch',
          `${q}.receipt`,
          [g.actionId, g.effect.occurrenceId, true, true, true, true],
          [
            r.actionId,
            r.occurrenceId,
            h.before === r.before,
            r.before === gain.before.actors[r.actor],
            r.after === gain.after.actors[r.actor],
            h.result.status === 'applied' && h.result.actor === r.after,
          ],
        );
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.result`,
          h.result.status === 'applied' ? [h.result.attempted, h.result.actual] : h.result,
          [r.attempted, r.actual],
        );
        c(
          'giveAttemptIdentityMismatch',
          `${q}.receiptAppend`,
          true,
          gain.after.receipts.includes(r),
        );
        c(
          'giveAttemptRetainedMismatch',
          `${q}.attempted`,
          true,
          n?.attempted?.hp?.receipts.includes(r),
        );
        const excluded = n?.giveExcludedConsumptions?.includes(read) === true;
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.readDisposition`,
          excluded,
          h.give.instances.length === 0,
        );
        if (excluded) localExcluded++;
        else localConsumed++;
        const hpChanged =
          r.before.kind === 'absolute' &&
          r.after.kind === 'absolute' &&
          r.before.current !== r.after.current;
        c(
          'giveAttemptConsumptionMismatch',
          `${q}.changed`,
          r.actual !== null && r.actual > 0,
          hpChanged,
        );
        if (hpChanged) localChanged++;
      }
    }
    let boundary: GiveAttemptBoundary | null = null;
    const targetWriters = s.canonical.writers.filter((w) => w.actionIndex <= ai);
    const priorAppends = writes.filter(
      ({ action: a, write: w }) =>
        w.modifiers.length > 0 &&
        targetWriters.some(
          (x) =>
            x.actionId === a.actionId &&
            x.effect === w.source.effect &&
            x.operationIndex === w.operationIndex,
        ),
    );
    if (s.canonical.scopeBoundaries.length) boundary = 'outsideScope';
    else if (!t || !n?.native) boundary = 'attemptBeforeNative';
    else if (n.native.status === 'committed') boundary = 'nativeCommitted';
    else if (!priorAppends.length)
      boundary = attempt?.stepOrigins.some(
        (o) =>
          targetWriters.some(
            (w) => w.effect === o.source.effect && w.operationIndex === o.operationIndex,
          ) && attempt.reached.some((r) => r.index === o.index),
      )
        ? 'writerNotApplied'
        : 'writerUnreached';
    else if (!localConsumed) boundary = localExcluded ? 'giveReadExcluded' : 'consumerUnreached';
    else if (!localChanged) boundary = 'consumerActualZero';
    c(
      'giveAttemptBoundaryMismatch',
      'classification',
      program.expectation.kind === 'boundary' ? program.expectation.boundary : null,
      boundary,
    );
    if (t && n?.native && n.native.status !== 'committed') {
      c(
        'giveAttemptNativeMismatch',
        'native.owner',
        [true, true, true],
        [!!attempt, attempt?.native === n.native, rejectIndex !== undefined],
      );
      c(
        'giveAttemptNativeMismatch',
        'native.refusal',
        [n.native.status, n.native.reason],
        reject?.step.kind === 'reject'
          ? [reject.step.status, reject.step.reason]
          : inputReached
            ? [
                attempt?.native?.status,
                attempt?.native && attempt.native.status !== 'committed'
                  ? attempt.native.reason
                  : null,
              ]
            : null,
      );
      c(
        'giveAttemptNativeMismatch',
        'native.origin',
        true,
        !!attempt?.stepOrigins.find((o) => o.index === rejectIndex),
      );
      const rejectOrigin = attempt?.stepOrigins.find((o) => o.index === rejectIndex);
      c(
        'giveAttemptNativeMismatch',
        'native.source',
        [action.skillId, s.canonical.servantId, true, true],
        [
          rejectOrigin?.source.skillId,
          rejectOrigin?.source.sourceId,
          !!rejectOrigin && action.effects.includes(rejectOrigin.source.effect),
          !!rejectOrigin && n.sources.includes(rejectOrigin.source),
        ],
      );
      c(
        'giveAttemptNativeMismatch',
        'native.reachedOrigins',
        attempt?.reached.map(() => 1),
        attempt?.reached.map((r) => attempt.stepOrigins.filter((o) => o.index === r.index).length),
      );
      c(
        'giveAttemptNativeMismatch',
        'native.start',
        [true, true],
        [attempt?.start === n.start, attempt?.returned === n.returned],
      );
      c('giveAttemptNativeMismatch', 'native.ocRollback', n.start.ocState, n.native.state);
      c(
        'giveAttemptRetainedMismatch',
        'returned',
        [true, true, true, true, true],
        [
          n.returned === n.start,
          n.start.hp === t.before.hp,
          t.result.state === t.before,
          t.result.state.hp === n.start.hp,
          n.returned?.appliedActions === t.before.appliedActions,
        ],
      );
      c(
        'giveAttemptRetainedMismatch',
        'prefix',
        true,
        ai === 0 || t.before === s.transitions?.[ai - 1]?.result.state,
      );
      c(
        'giveAttemptRetainedMismatch',
        'failedReceiptsAbsent',
        true,
        (n.giveGains ?? []).every((g) =>
          g.receipts.every((r) => !n.returned?.hp?.receipts.includes(r)),
        ),
      );
      c(
        'giveAttemptRetainedMismatch',
        'modifierIsolation',
        true,
        writes.every(({ action: a, write: w }) =>
          w.modifiers.every((m) =>
            a === n
              ? !n.returned?.hp?.modifiers?.includes(m)
              : a.native?.status !== 'committed' || n.returned?.hp?.modifiers?.includes(m),
          ),
        ),
      );
      c('giveAttemptTransportMismatch', 'reducer.status', 'rejected', t.result.status);
      const refusal = s.transport?.rejection;
      c(
        'giveAttemptTransportMismatch',
        'reducer.refusal',
        t.result.status === 'rejected' ? t.result.code : null,
        refusal ? refusal.rejection.code : null,
      );
      c(
        'giveAttemptTransportMismatch',
        'reducer.requiredInput',
        [n.rejectionInput?.requiredInput ?? null, n.rejectionInput?.occurrenceId ?? null],
        t.result.status === 'rejected'
          ? [t.result.requiredInput, t.result.requiredInputEffectOccurrenceId]
          : null,
      );
      c(
        'giveAttemptTransportMismatch',
        'operationId',
        `preparation:${s.canonical.servantId}:${action.command.kind}`,
        refusal?.rejection.operationId,
      );
      c(
        'giveAttemptTransportMismatch',
        'prepared.refusal',
        refusal?.rejection,
        s.selection.prepared.status === 'rejected'
          ? s.selection.prepared.resolved.preparationRejection
          : null,
      );
      c(
        'giveAttemptTransportMismatch',
        'owners',
        [true, true, true, true],
        [
          s.transport === battlePointPreparationRejectionObservationFor(s.selection.prepared),
          s.transport === battlePointPreparationRejectionObservationFor(s.calculation),
          s.transport === battlePointPreparationRejectionObservationFor(s.result),
          s.transport === battlePointPreparationRejectionObservationFor(s.directResult),
        ],
      );
      c('giveAttemptTransportMismatch', 'direct.result', s.result, s.directResult);
      c(
        'giveAttemptDownstreamGenerated',
        'status',
        [
          'rejected',
          'rejected',
          n.native.status === 'inputRequired' ? 'inputRequired' : 'unsupported',
        ],
        [s.selection.prepared.status, s.calculation.status, s.directResult.status],
      );
      c(
        'giveAttemptDownstreamGenerated',
        'absent',
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
      c(
        'giveAttemptDownstreamGenerated',
        'effects',
        [[], []],
        [s.effects, s.contributions.contributions],
      );
      c(
        'giveAttemptDownstreamGenerated',
        'uses',
        s.uses.map(() => [[], [], []]),
        s.uses.map((u) => [u.events, u.projections, u.contributions]),
      );
    }
    if (boundary) boundaries.push({ identity: id, reason: boundary });
    else if (!failures.some((f) => f.identity === id)) isolated++;
    consumed += localConsumed;
    excludedReads += localExcluded;
    changed += localChanged;
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    selected: input.expected.length,
    appended,
    excludedReads,
    consumed,
    changed,
    isolated,
    boundaries,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
