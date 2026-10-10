import { projectBattleTraitPresence, type PreNoblePhantasmState } from '@fgo-lab/battle-execution';
function nativePresence(state: PreNoblePhantasmState | undefined) {
  return state === undefined
    ? undefined
    : {
        attackerState: new Set(
          [...projectBattleTraitPresence(state, 'attackerState')].flatMap(([trait, present]) =>
            present ? [trait] : [],
          ),
        ),
        targetState: new Set(
          [...projectBattleTraitPresence(state, 'targetState')].flatMap(([trait, present]) =>
            present ? [trait] : [],
          ),
        ),
      };
}
import { preparationHpActionsFor } from '@fgo-lab/battle-execution/preparation-audit';
import {
  firstCanonicalAuditDifference,
  createCanonicalAuditValueComparison,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import {
  hpPreparationCanonical,
  hpPreparationSelection,
  hpPreparationSource,
  hpCanonicalInventory,
  hpDiagnosticSource,
  type HpPreparationSelection,
} from './productionHpPreparationAudit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import {
  createScalarQuantitySnapshotter,
  scalarQuantitySnapshot as snapshot,
} from './productionScalarQuantityAudit';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';

type Selection = HpPreparationSelection;
export function hpPreparationAttemptSelection(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  index = 0,
) {
  const selection = hpPreparationSelection(prepared, calculation, index);
  return selection ? { ...selection, identity: `attempt:${selection.identity}` } : null;
}
export function hpPreparationAttemptSource(selection: Selection) {
  const source = hpPreparationSource(selection);
  return {
    ...source,
    prepared: selection.prepared,
    attempts: source.transport?.transitions.map((t) => t.attempts),
    hpActions: source.transport?.transitions.map((t) => preparationHpActionsFor(t.result)),
  };
}
export type HpPreparationAttemptSource = ReturnType<typeof hpPreparationAttemptSource>;
function contractDiagnostic(source: Partial<HpPreparationAttemptSource>) {
  return source.prepared?.status === 'executable'
    ? hpDiagnosticSource(source as HpPreparationAttemptSource).canonical
    : source.canonical;
}
export function hpPreparationAttemptDiagnostic(source: Partial<HpPreparationAttemptSource>) {
  // Committed executions are population boundaries here; their forward proof remains
  // owned by the existing HP consumer. Do not duplicate the full damage/master graph.
  if (source.prepared?.status === 'executable') {
    const forward = hpDiagnosticSource(source as HpPreparationAttemptSource);
    return {
      identity: source.identity,
      scenario: source.scenario,
      canonical: forward.canonical,
      transitions: forward.transitions,
      prepared: { status: source.prepared.status, scenario: source.prepared.scenario },
      masterEvidence: { version: source.master?.version },
    };
  }
  const view = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => key !== 'master' && key !== 'selection')
      .map(([key, value]) => [
        key,
        key === 'prepared' && value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).filter(([field]) => field !== 'master'))
          : value,
      ]),
  );
  const master: Partial<MasterDataSnapshot> | undefined = source.master;
  return {
    ...view,
    masterEvidence: {
      version: master?.version,
      servants: master?.servants?.filter((servant) => servant.id === source.canonical?.servantId),
    },
  };
}
function anchors(source: HpPreparationAttemptSource): Record<string, unknown> {
  const result: Record<string, unknown> = {
    selection: source.selection,
    master: source.master,
    scenario: source.scenario,
    prepared: source.prepared,
    calculation: source.calculation,
    result: source.result,
    transport: source.transport,
    refusal: source.transport?.rejection,
    preparedResolved: source.prepared.resolved,
    applicationResult: source.calculation.result,
    applicationInput: Reflect.get(source.calculation, 'input'),
    applicationObservation: Reflect.get(source.calculation, 'executionObservation'),
    observation: source.observation,
    input: source.input,
    candidate: source.candidate,
    effects: source.effects,
    contributions: source.contributions,
  };
  source.transitions?.forEach((t, i) => {
    result[`transition.${i}.before`] = t.before;
    result[`transition.${i}.result`] = t.result;
    (t as Partial<typeof t>).hpActions?.forEach((a, j) => {
      const path = `action.${i}.${j}`;
      result[path] = a;
      result[`${path}.writes`] = a.writes;
      result[`${path}.sourceEnds`] = a.sourceEnds;
      for (const key of ['start', 'sources', 'native', 'attempted', 'returned'] as const)
        result[`${path}.${key}`] = a[key];
      a.sourceEnds.forEach((end, k) => {
        for (const field of ['source', 'before', 'after'] as const)
          result[`${path}.sourceEnd.${k}.${field}`] = end[field];
      });
      a.writes.forEach((w, k) => {
        result[`${path}.write.${k}.receiptList`] = w.receipts;
        result[`${path}.write.${k}.effect`] = w.source.effect;
        result[`${path}.write.${k}.execution`] = w.source.effect.execution;
        result[`${path}.write.${k}.operation`] = w.source.effect.execution[w.operationIndex];
        for (const key of ['source', 'before', 'after'] as const)
          result[`${path}.write.${k}.${key}`] = w[key];
        w.receipts.forEach((r, n) => {
          result[`${path}.write.${k}.receipt.${n}`] = r;
        });
      });
    });
  });
  return result;
}
export interface HpPreparationAttemptProgram {
  selection: Selection;
  contract: CanonicalAuditValue;
  owner: CanonicalAuditValue;
}
const authorities = new WeakMap<
  HpPreparationAttemptProgram,
  { contract: CanonicalAuditValue; owner: CanonicalAuditValue; anchors: Record<string, unknown> }
>();
export function hpPreparationAttemptProgram(selection: Selection): HpPreparationAttemptProgram {
  const source = hpPreparationAttemptSource(selection);
  const contract = snapshot(contractDiagnostic(source));
  const owner = snapshot(hpPreparationAttemptDiagnostic(source));
  const program = { selection, contract, owner };
  authorities.set(program, {
    contract: snapshot(contract),
    owner: snapshot(owner),
    anchors: anchors(source),
  });
  return program;
}
export type HpAttemptReason =
  | 'hpAttemptPopulationMismatch'
  | 'hpAttemptCanonicalMismatch'
  | 'hpAttemptTransportMissing'
  | 'hpAttemptIdentityMismatch'
  | 'hpAttemptStateMismatch'
  | 'hpAttemptNativeMismatch'
  | 'hpAttemptCommitLeak'
  | 'hpAttemptRejectionMismatch'
  | 'hpAttemptDownstreamLeak';
type Check = {
  identity: string;
  reason: HpAttemptReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
};
type Failure = Check & {
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
};
type Checker = (reason: HpAttemptReason, path: string, expected: unknown, actual: unknown) => void;
const equal = (a: unknown, b: unknown) =>
  firstCanonicalAuditDifference(
    [{ identity: 'hp', value: snapshot(a) }],
    [{ identity: 'hp', value: snapshot(b) }],
  ) === null;

function inspectAction(source: HpPreparationAttemptSource, index: number, c: Checker) {
  const transition = source.transitions![index]!;
  const canonical = source.canonical.actions[index];
  const path = `action.${index}`;
  c('hpAttemptCanonicalMismatch', `${path}.command`, canonical?.command, transition.command);
  if (index > 0)
    c(
      'hpAttemptStateMismatch',
      `${path}.prefixState`,
      true,
      source.transitions![index - 1]!.result.state === transition.before,
    );
  const hp = (transition as Partial<typeof transition>).hpActions?.[0];
  const attempt = source.attempts?.[index]?.[0];
  if (!hp) return { changed: 0, nativeNonCommit: false };
  c(
    'hpAttemptTransportMissing',
    `${path}.attempt`,
    true,
    !!attempt && !!hp.attempted && !!hp.native && !!hp.returned,
  );
  if (!attempt || !hp.attempted || !hp.native || !hp.returned)
    return { changed: 0, nativeNonCommit: false };
  c('hpAttemptIdentityMismatch', `${path}.native`, true, hp.native === attempt.native);
  c('hpAttemptIdentityMismatch', `${path}.start`, true, hp.start === attempt.start);
  c('hpAttemptIdentityMismatch', `${path}.returned`, true, hp.returned === attempt.returned);
  c('hpAttemptStateMismatch', `${path}.actionStartHp`, true, hp.start.hp === transition.before.hp);
  c(
    'hpAttemptStateMismatch',
    `${path}.actionStartPrefix`,
    transition.before.appliedActions,
    hp.start.appliedActions,
  );
  c(
    'hpAttemptCanonicalMismatch',
    `${path}.sources`,
    canonical?.effects,
    hp.sources.map((s) => s.effect),
  );
  c('hpAttemptIdentityMismatch', `${path}.actionId`, canonical?.actionId, hp.actionId);
  c(
    'hpAttemptIdentityMismatch',
    `${path}.sourceIdentity`,
    canonical?.effects.map((effect) => ({
      origin: 'attacker',
      sourceId: source.canonical.servantId,
      sourceInstanceId: `attacker:${source.canonical.servantId}`,
      skillId: canonical.skillId,
      occurrenceId: effect.occurrenceId,
      valueSetIndex: 0,
      valueIndex:
        transition.command.kind === 'useSkillSlot' ? transition.command.skillLevel - 1 : null,
    })),
    hp.sources.map((s) => ({
      origin: s.origin,
      sourceId: s.sourceId,
      sourceInstanceId: s.sourceInstanceId,
      skillId: s.skillId,
      occurrenceId: s.effect.occurrenceId,
      valueSetIndex: s.valueSetIndex,
      valueIndex: s.valueIndex,
    })),
  );
  c(
    'hpAttemptIdentityMismatch',
    `${path}.reachedOrder`,
    attempt.reached.map((_, i) => i),
    attempt.reached.map((r) => r.index),
  );
  let changed = 0;
  for (const [i, write] of hp.writes.entries()) {
    const wp = `${path}.write.${i}`;
    const writer = source.canonical.writers.find(
      (w) =>
        w.actionIndex === index &&
        w.effect === write.source.effect &&
        w.operationIndex === write.operationIndex,
    );
    c('hpAttemptCanonicalMismatch', `${wp}.writer`, true, !!writer);
    c(
      'hpAttemptIdentityMismatch',
      `${wp}.reached`,
      true,
      attempt.reached.some((r) =>
        attempt.stepOrigins.some(
          (o) =>
            o.index === r.index &&
            o.source === write.source &&
            o.operationIndex === write.operationIndex,
        ),
      ),
    );
    c(
      'hpAttemptStateMismatch',
      `${wp}.receiptAppend`,
      [...write.before.receipts, ...write.receipts],
      write.after.receipts,
    );
    c(
      'hpAttemptCommitLeak',
      `${wp}.executedEffects`,
      write.before.executedEffects,
      write.after.executedEffects,
    );
    for (const [n, receipt] of write.receipts.entries()) {
      c(
        'hpAttemptIdentityMismatch',
        `${wp}.receipt.${n}.identity`,
        { actionId: hp.actionId, occurrenceId: writer?.effect.occurrenceId, actor: writer?.actor },
        { actionId: receipt.actionId, occurrenceId: receipt.occurrenceId, actor: receipt.actor },
      );
      c(
        'hpAttemptStateMismatch',
        `${wp}.receipt.${n}.before`,
        write.before.actors[receipt.actor],
        receipt.before,
      );
      c(
        'hpAttemptStateMismatch',
        `${wp}.receipt.${n}.after`,
        write.after.actors[receipt.actor],
        receipt.after,
      );
      c(
        'hpAttemptStateMismatch',
        `${wp}.receipt.${n}.changedEvidence`,
        !equal(receipt.before, receipt.after),
        receipt.actual !== null && receipt.actual > 0,
      );
      if (!equal(receipt.before, receipt.after) && receipt.actual !== null && receipt.actual > 0)
        changed++;
    }
  }
  const timeline = [
    ...hp.writes.map((write) => ({
      kind: 'write' as const,
      index: attempt.stepOrigins.find(
        (o) => o.source === write.source && o.operationIndex === write.operationIndex,
      )?.index,
      before: write.before,
      after: write.after,
    })),
    ...hp.sourceEnds.map((end) => ({
      kind: 'sourceEnd' as const,
      index: end.step,
      before: end.before.hp!,
      after: end.after.hp!,
    })),
  ].sort((a, b) => a.index! - b.index!);
  let current = hp.start.hp;
  for (const [i, event] of timeline.entries()) {
    c(
      'hpAttemptIdentityMismatch',
      `${path}.timeline.${i}.reached`,
      true,
      attempt.reached.some((r) => r.index === event.index),
    );
    c('hpAttemptStateMismatch', `${path}.timeline.${i}.before`, current, event.before);
    current = event.after;
  }
  const nativeNonCommit = hp.native.status !== 'committed';
  if (nativeNonCommit) {
    c('hpAttemptStateMismatch', `${path}.attemptEndHp`, current, hp.attempted.hp);
    c('hpAttemptNativeMismatch', `${path}.reducerRejected`, 'rejected', transition.result.status);
    c('hpAttemptCommitLeak', `${path}.nativeState`, true, hp.native.state === hp.start.ocState);
    c('hpAttemptCommitLeak', `${path}.nativeOutcomes`, [], hp.native.outcomes);
    c(
      'hpAttemptCommitLeak',
      `${path}.nativeCommit`,
      false,
      hp.native.state.committedActions.has(hp.actionId),
    );
    c('hpAttemptStateMismatch', `${path}.returnedStart`, true, hp.returned === hp.start);
    c(
      'hpAttemptStateMismatch',
      `${path}.reducerRetained`,
      true,
      transition.result.state === transition.before,
    );
    c('hpAttemptStateMismatch', `${path}.retainedHp`, hp.start.hp, transition.result.state.hp);
    c(
      'hpAttemptCommitLeak',
      `${path}.committedPrefix`,
      hp.start.appliedActions,
      transition.result.state.appliedActions,
    );
  }
  return { changed, nativeNonCommit };
}
function inspectRefusal(source: HpPreparationAttemptSource, index: number, c: Checker) {
  const t = source.transitions![index]!;
  const rejection = source.transport?.rejection;
  c('hpAttemptTransportMissing', 'rejection.outcome', true, !!rejection);
  if (t.result.status !== 'rejected') return;
  c('hpAttemptRejectionMismatch', 'rejection.code', t.result.code, rejection?.rejection.code);
  c(
    'hpAttemptRejectionMismatch',
    'rejection.requiredInputs',
    t.result.requiredInput && t.result.requiredInputEffectOccurrenceId
      ? [
          {
            ...t.result.requiredInput,
            effectOccurrenceIds: [t.result.requiredInputEffectOccurrenceId],
          },
        ]
      : [],
    rejection?.requiredInputs,
  );
  c(
    'hpAttemptCommitLeak',
    'rejection.committedPrefix',
    t.before.appliedActions,
    rejection?.appliedPreparationActions,
  );
  c(
    'hpAttemptRejectionMismatch',
    'rejection.resolved',
    rejection?.rejection,
    source.prepared.resolved.preparationRejection,
  );
  c(
    'hpAttemptRejectionMismatch',
    'rejection.status',
    ['rejected', 'rejected'],
    [source.prepared.status, source.calculation.status],
  );
  c('hpAttemptRejectionMismatch', 'rejection.result', false, source.result.status === 'calculated');
  c(
    'hpAttemptCommitLeak',
    'rejection.applicationPrefix',
    t.before.appliedActions,
    source.calculation.appliedPreparationActions,
  );
  for (const owner of [source.prepared, source.calculation, source.result])
    c(
      'hpAttemptIdentityMismatch',
      `rejection.transport.${owner === source.prepared ? 'prepared' : owner === source.calculation ? 'calculation' : 'result'}`,
      true,
      battlePointPreparationRejectionObservationFor(owner) === source.transport,
    );
  c('hpAttemptDownstreamLeak', 'downstream.ordered', null, source.prepared.orderedScenario);
  c('hpAttemptDownstreamLeak', 'downstream.canonicalInputs', null, source.prepared.canonicalInputs);
  for (const key of [
    'damageInputGenerated',
    'orderedScenario',
    'orderedExecution',
    'seed',
    'read',
    'np',
    'event',
    'projection',
    'contribution',
    'damageInput',
    'calculatedResult',
  ])
    c(
      'hpAttemptDownstreamLeak',
      `downstream.transport.${key}`,
      undefined,
      Reflect.get(source.transport!, key),
    );
  for (const key of [
    'damageInputGenerated',
    'orderedScenario',
    'orderedExecution',
    'seed',
    'read',
    'np',
    'event',
    'projection',
    'contribution',
    'damageInput',
    'calculatedResult',
  ])
    c(
      'hpAttemptDownstreamLeak',
      `downstream.transport.${key}.absent`,
      true,
      Reflect.get(source.transport!, key) === undefined,
    );
  for (const [label, owner] of [
    ['prepared', source.prepared],
    ['calculation', source.calculation],
  ] as const) {
    for (const key of [
      'input',
      'scenarioInput',
      'executionObservation',
      'seed',
      'read',
      'np',
      'event',
      'projection',
      'contribution',
      'damageInput',
      'calculatedResult',
    ])
      c(
        'hpAttemptDownstreamLeak',
        `downstream.${label}.${key}`,
        undefined,
        Reflect.get(owner, key),
      );
    for (const key of [
      'input',
      'scenarioInput',
      'executionObservation',
      'seed',
      'read',
      'np',
      'event',
      'projection',
      'contribution',
      'damageInput',
      'calculatedResult',
    ])
      c(
        'hpAttemptDownstreamLeak',
        `downstream.${label}.${key}.absent`,
        true,
        Reflect.get(owner, key) === undefined,
      );
  }
  c('hpAttemptDownstreamLeak', 'downstream.effects', [], source.calculation.effects);
  c(
    'hpAttemptDownstreamLeak',
    'downstream.contributions',
    [],
    source.calculation.effectiveContributions.contributions,
  );
  c('hpAttemptDownstreamLeak', 'downstream.candidate', undefined, source.candidate);
  for (const key of ['observation', 'input', 'candidate'])
    c(
      'hpAttemptDownstreamLeak',
      `downstream.source.${key}.absent`,
      true,
      Reflect.get(source, key) === undefined,
    );
}
function sealedReason(path: string): HpAttemptReason {
  return path.includes('canonical')
    ? 'hpAttemptCanonicalMismatch'
    : [
          'seed',
          'read',
          'np',
          'event',
          'projection',
          'contribution',
          'damageInput',
          'calculatedResult',
          'executionObservation',
          'input',
          'scenarioInput',
          'candidate',
        ].some((key) => path.split('.').includes(key))
      ? 'hpAttemptDownstreamLeak'
      : path.includes('native')
        ? 'hpAttemptNativeMismatch'
        : path.includes('rejection') || path.includes('result')
          ? 'hpAttemptRejectionMismatch'
          : [
                'operationIndex',
                'actionId',
                'occurrenceId',
                'actor',
                'source',
                'sourceId',
                'sourceInstanceId',
                'skillId',
                'valueIndex',
                'valueSetIndex',
              ].some((key) => path.split('.').includes(key))
            ? 'hpAttemptIdentityMismatch'
            : path.includes('attempts') || path.includes('hpActions')
              ? 'hpAttemptStateMismatch'
              : 'hpAttemptIdentityMismatch';
}
type AuditDifference = ReturnType<typeof firstCanonicalAuditDifference>;
type AuditComparison = (
  expected: CanonicalAuditValue,
  actual: CanonicalAuditValue,
) => AuditDifference;
function createAuditComparison(): AuditComparison {
  const compare = createCanonicalAuditValueComparison();
  const pairs = new WeakMap<object, WeakMap<object, AuditDifference>>();
  return (expected, actual) => {
    const objects =
      expected !== null &&
      actual !== null &&
      typeof expected === 'object' &&
      typeof actual === 'object';
    if (objects && pairs.get(expected)?.has(actual)) return pairs.get(expected)!.get(actual)!;
    const relative = compare(expected, actual);
    const difference = relative ? { identity: 'hp', ...relative } : null;
    if (objects) {
      let actuals = pairs.get(expected);
      if (!actuals) {
        actuals = new WeakMap();
        pairs.set(expected, actuals);
      }
      actuals.set(actual, difference);
    }
    return difference;
  };
}

type SealedCheck = { kind: 'check'; expected: CanonicalAuditValue; actual: CanonicalAuditValue };
type SealedEdge = {
  kind: 'edge';
  key: string;
  presence: SealedCheck | undefined;
  child: SealedNode;
};
type SealedNode = readonly (SealedCheck | SealedEdge)[];
/** Only the synchronous audit below supplies its private, owned projections.
 * Complete nodes contain local edges, never duplicated descendant path lists. Their
 * draft, edge records and arrays cannot escape before sealing. This invocation ends
 * before checks return to callers, so later input mutations get a fresh comparison/DAG.
 */
function createSealedInspector(compare: AuditComparison) {
  const completed = new WeakMap<object, WeakMap<object, SealedNode>>();
  const absentValue = Object.freeze({ kind: 'absent' });
  const empty = Object.freeze([]) as SealedNode;
  const absent = (v: CanonicalAuditValue) =>
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === 1 &&
    Reflect.get(v, 'kind') === 'absent';
  const compile = (expected: CanonicalAuditValue, actual: CanonicalAuditValue): SealedNode => {
    const objects =
      expected !== null &&
      actual !== null &&
      typeof expected === 'object' &&
      typeof actual === 'object';
    if (objects) {
      const prior = completed.get(expected)?.get(actual);
      if (prior) return prior;
    }
    if (compare(expected, actual) === null) return empty;
    const draft: (SealedCheck | SealedEdge)[] = [];
    if (
      !absent(expected) &&
      !absent(actual) &&
      objects &&
      Array.isArray(expected) === Array.isArray(actual)
    ) {
      for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
        const e = Object.hasOwn(expected, key),
          a = Object.hasOwn(actual, key);
        const child = compile(
          Reflect.get(expected, key) === undefined
            ? absentValue
            : (Reflect.get(expected, key) as CanonicalAuditValue),
          Reflect.get(actual, key) === undefined
            ? absentValue
            : (Reflect.get(actual, key) as CanonicalAuditValue),
        );
        const presence =
          e === a ? undefined : Object.freeze({ kind: 'check' as const, expected: e, actual: a });
        if (presence || child.length)
          draft.push(Object.freeze({ kind: 'edge', key, presence, child }));
      }
    } else draft.push(Object.freeze({ kind: 'check', expected, actual }));
    const sealed = Object.freeze(draft);
    if (objects) {
      let actuals = completed.get(expected);
      if (!actuals) {
        actuals = new WeakMap();
        completed.set(expected, actuals);
      }
      actuals.set(actual, sealed);
    }
    return sealed;
  };
  const emit = (node: SealedNode, path: string, c: Checker): void => {
    for (const entry of node) {
      if (entry.kind === 'check') c(sealedReason(path), path, entry.expected, entry.actual);
      else {
        const childPath = `${path}.${entry.key}`;
        if (entry.presence)
          c(
            sealedReason(childPath),
            `${childPath}.present`,
            entry.presence.expected,
            entry.presence.actual,
          );
        emit(entry.child, childPath, c);
      }
    }
  };
  return (expected: CanonicalAuditValue, actual: CanonicalAuditValue, path: string, c: Checker) =>
    emit(compile(expected, actual), path, c);
}

export function auditHpPreparationAttempts(input: {
  selections: readonly Selection[];
  expected: readonly HpPreparationAttemptProgram[];
  observations: readonly HpPreparationAttemptSource[];
}) {
  // One audit call owns its projection; caller mutations between calls cannot reuse it.
  const project = createScalarQuantitySnapshotter();
  const compare = createAuditComparison();
  const inspect = createSealedInspector(compare);
  const checks: Check[] = [],
    failures: Failure[] = [];
  const check = (
    identity: string,
    reason: HpAttemptReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const entry = {
      identity,
      reason,
      checkPath,
      expected: project(expected),
      actual: project(actual),
    };
    checks.push(entry);
    const difference = compare(entry.expected, entry.actual);
    if (difference)
      failures.push({
        ...entry,
        firstDifference: {
          ...difference,
          identity,
          path: difference.path ? `${checkPath}.${difference.path}` : checkPath,
        },
      });
  };
  check(
    'hp-attempt:population',
    'hpAttemptPopulationMismatch',
    'population.programs',
    input.selections.map((s) => s.identity),
    input.expected.map((p) => p.selection.identity),
  );
  check(
    'hp-attempt:population',
    'hpAttemptPopulationMismatch',
    'population.observations',
    input.selections.map((s) => s.identity),
    input.observations.map((s) => s.identity),
  );
  check(
    'hp-attempt:population',
    'hpAttemptPopulationMismatch',
    'population.unique',
    input.selections.length,
    new Set(input.selections.map((s) => s.identity)).size,
  );
  const boundaries: {
    identity: string;
    kind: string;
    changed: number;
    unchangedReason?: string;
  }[] = [];
  for (const program of input.expected) {
    const identity = program.selection.identity;
    const c: Checker = (reason, path, expected, actual) =>
      check(identity, reason, path, expected, actual);
    const source = input.observations.find((s) => s.identity === identity);
    const authority = authorities.get(program);
    c('hpAttemptTransportMissing', 'transport.source', true, !!source && !!authority);
    if (!source || !authority) continue;
    c('hpAttemptCanonicalMismatch', 'canonical.seal', authority.contract, program.contract);
    c(
      'hpAttemptCanonicalMismatch',
      'canonical.selection',
      authority.contract,
      contractDiagnostic(hpPreparationAttemptSource(program.selection)),
    );
    c(
      'hpAttemptIdentityMismatch',
      'transport.selection',
      true,
      source.selection === program.selection,
    );
    c('hpAttemptStateMismatch', 'owner.seal', authority.owner, program.owner);
    c(
      'hpAttemptCanonicalMismatch',
      'canonical.observed',
      authority.contract,
      contractDiagnostic(source),
    );
    const observed = project(hpPreparationAttemptDiagnostic(source));
    inspect(project(authority.owner), observed, 'owner', c);
    if (compare(project(authority.owner), observed) !== null) continue;
    c(
      'hpAttemptIdentityMismatch',
      'transport.master',
      true,
      source.prepared.master === source.master && source.master === authority.anchors.master,
    );
    if (source.prepared.master !== source.master || source.master !== authority.anchors.master)
      continue;
    c(
      'hpAttemptCanonicalMismatch',
      'canonical.masterCommand',
      authority.contract,
      contractDiagnostic({ ...source, canonical: hpPreparationCanonical(source.prepared)! }),
    );

    const actualAnchors = anchors(source);
    c(
      'hpAttemptIdentityMismatch',
      'reference.population',
      Object.keys(authority.anchors),
      Object.keys(actualAnchors),
    );
    for (const [path, reference] of Object.entries(authority.anchors))
      c('hpAttemptIdentityMismatch', `reference.${path}`, true, actualAnchors[path] === reference);
    c(
      'hpAttemptTransportMissing',
      'transport.transitions',
      true,
      !!source.transitions && !!source.transport,
    );
    if (!source.transitions || !source.transport) continue;
    if (source.prepared.status === 'executable') {
      for (const [i, transition] of source.transitions.entries()) {
        for (const [j, action] of (
          (transition as Partial<typeof transition>).hpActions ?? []
        ).entries())
          c(
            'hpAttemptNativeMismatch',
            `boundary.committed.${i}.${j}.native`,
            'committed',
            action.native?.status,
          );
      }
      boundaries.push({ identity, kind: 'committed', changed: 0 });
      continue;
    }
    if (
      source.canonical.scopeBoundaries.length ||
      source.transitions.some(
        (t) =>
          !equal(t.before.currentFormId, source.canonical.form) ||
          !equal(t.result.state.currentFormId, source.canonical.form),
      )
    ) {
      boundaries.push({ identity, kind: 'outsideScope', changed: 0 });
      continue;
    }
    const initial = source.transitions[0]?.before;
    if (
      source.transitions.some(
        (t) =>
          !equal(nativePresence(t.before), nativePresence(initial)) ||
          !equal(nativePresence(t.result.state), nativePresence(initial)),
      )
    ) {
      boundaries.push({ identity, kind: 'outsideActorTraits', changed: 0 });
      continue;
    }
    const capturedActions = source.transitions.flatMap(
      (t) => (t as Partial<typeof t>).hpActions ?? [],
    );
    if (
      capturedActions.some(
        (action) =>
          action.sourceEnds.some((end) =>
            end.source.effect.execution.some(
              (op) =>
                op.kind === 'hpModifier' ||
                op.kind === 'removeHpModifiers' ||
                (op.kind === 'resourceMutation' &&
                  op.resource === 'hp' &&
                  end.source.origin !== 'attacker'),
            ),
          ) ||
          (action.attempted &&
            (!equal(action.start.currentFormId, action.attempted.currentFormId) ||
              !equal(nativePresence(action.start), nativePresence(action.attempted)))),
      )
    ) {
      boundaries.push({ identity, kind: 'outsideAttemptEnvironment', changed: 0 });
      continue;
    }
    let rejected = false;
    for (const [i, t] of source.transitions.entries()) {
      const inspected = source.canonical.writers.some((w) => w.actionIndex === i)
        ? inspectAction(source, i, c)
        : { changed: 0, nativeNonCommit: false };
      if (t.result.status === 'rejected') {
        inspectRefusal(source, i, c);
        c('hpAttemptCommitLeak', 'rejection.transitionEnd', i + 1, source.transitions.length);
        boundaries.push({
          identity,
          kind: inspected.nativeNonCommit
            ? inspected.changed
              ? 'changedNonCommit'
              : 'unchangedNonCommit'
            : 'beforeAttempt',
          changed: inspected.changed,
          ...(inspected.changed === 0 && inspected.nativeNonCommit
            ? {
                unchangedReason: (t as Partial<typeof t>).hpActions?.[0]?.writes.some((w) =>
                  w.receipts.some((r) => r.before.kind === 'absolute' && r.before.current === 0),
                )
                  ? 'dead'
                  : (t as Partial<typeof t>).hpActions?.[0]?.writes.some(
                        (w) => w.receipts.length > 0,
                      )
                    ? 'noOp'
                    : (t as Partial<typeof t>).hpActions?.[0]?.writes.length
                      ? 'notApplicable'
                      : 'writerNotReached',
              }
            : {}),
        });
        rejected = true;
        break;
      }
    }
    if (!rejected) boundaries.push({ identity, kind: 'committed', changed: 0 });
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    boundaries,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
export function auditPublishedHpPreparationAttempts(
  master: MasterDataSnapshot,
  requests: readonly { prepared: PreparedCalculationScenario; calculation: CalculationExecution }[],
  selections: readonly Selection[],
  expected: readonly HpPreparationAttemptProgram[],
  observations: readonly HpPreparationAttemptSource[],
) {
  const gate = auditHpPreparationAttempts({ selections, expected, observations });
  const inventory = hpCanonicalInventory(master);
  const wanted = requests.flatMap((r) => {
    const s = hpPreparationAttemptSelection(r.prepared, r.calculation, selections.length);
    return s ? [contractDiagnostic(hpPreparationAttemptSource(s))] : [];
  });
  const missing = selections.flatMap((s) =>
    s.canonical.writers.filter(
      (w) =>
        !inventory.some(
          (d) =>
            d.servantId === w.sourceId &&
            equal(d.form, w.form) &&
            d.skillId === w.skillId &&
            d.occurrenceId === w.effect.occurrenceId &&
            d.operationIndex === w.operationIndex &&
            equal(d.operation, w.operation),
        ),
    ),
  );
  const publication = [
    {
      checkPath: 'published.requests',
      expected: wanted,
      actual: selections.map((s) => contractDiagnostic(hpPreparationAttemptSource(s))),
    },
    { checkPath: 'published.declarations', expected: [], actual: missing },
  ];
  for (const item of publication) {
    const identity = 'hp-attempt:published',
      reason = 'hpAttemptPopulationMismatch' as const;
    const entry = {
      identity,
      reason,
      checkPath: item.checkPath,
      expected: snapshot(item.expected),
      actual: snapshot(item.actual),
    };
    gate.checks.push(entry);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: entry.expected }],
      [{ identity, value: entry.actual }],
    );
    if (difference)
      gate.failures.push({
        ...entry,
        firstDifference: { ...difference, path: `${item.checkPath}.${difference.path}` },
      });
  }
  return {
    ...gate,
    status: gate.failures.length ? ('failed' as const) : ('passed' as const),
    firstDifference: gate.failures[0]?.firstDifference ?? null,
    inventory,
    selected: selections.map((s) => s.identity),
  };
}
