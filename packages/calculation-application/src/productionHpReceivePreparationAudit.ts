import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import {
  getSkillsForActorForm,
  type MasterEffect,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import { npProgramEffects } from '@fgo-lab/battle-execution';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  hpPreparationCanonicalFor,
  hpPreparationSource,
  type HpPreparationSelection,
} from './productionHpPreparationAudit';
import { maximumFixedDiagnostic } from './productionHpMaximumFixedPreparationAudit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type {
  PreparedCalculationScenario,
  CalculationExecution,
  CalculationApplicationResult,
} from './scenario';

export type Receive = Extract<MasterEffect['execution'][number], { kind: 'hpModifier' }>;
export function isReceiveSelf(operation: MasterEffect['execution'][number]): operation is Receive {
  return (
    operation.kind === 'hpModifier' &&
    operation.action === 'receive' &&
    operation.sign === 1 &&
    operation.lifetime === 'active' &&
    operation.route.target === 'sourceSelf' &&
    (operation.selection === undefined || operation.selection === 'direct') &&
    operation.bounds.minimum === 0 &&
    operation.bounds.maximum === 50000 &&
    (operation.useCondition === undefined || operation.useCondition.kind === 'always')
  );
}
function isConsumer(operation: MasterEffect['execution'][number]) {
  return (
    operation.kind === 'resourceMutation' &&
    operation.resource === 'hp' &&
    operation.direction === 'gain' &&
    operation.unit === 'fixed' &&
    operation.amount.kind === 'fixed' &&
    operation.recipient === 'sourceSelf' &&
    (operation.selection === undefined || operation.selection === 'direct')
  );
}
export function receiveCanonical(prepared: PreparedCalculationScenario) {
  const canonical = hpPreparationCanonicalFor(
    prepared,
    isReceiveSelf,
    (operation) =>
      operation.kind === 'removeHpModifiers' ||
      (operation.kind === 'hpModifier' && !isReceiveSelf(operation)),
  );
  if (!canonical) return null;
  const consumers = canonical.writers.flatMap((writer) => {
    const action = canonical.actions[writer.actionIndex]!;
    const writerIndex = action.effects.indexOf(writer.effect);
    return action.effects.flatMap((effect, effectIndex) =>
      effectIndex > writerIndex
        ? effect.execution.flatMap((operation, operationIndex) =>
            isConsumer(operation)
              ? [
                  {
                    writer,
                    effect,
                    operation,
                    operationIndex,
                    actionIndex: writer.actionIndex,
                    valueSetIndex: writer.valueSetIndex,
                    valueIndex: writer.valueIndex,
                  },
                ]
              : [],
          )
        : [],
    );
  });
  if (
    canonical.actions.some((action) =>
      action.effects.some((effect) =>
        effect.execution.some(
          (operation, operationIndex) =>
            operation.kind === 'resourceMutation' &&
            operation.resource === 'hp' &&
            !consumers.some(
              (consumer) =>
                consumer.actionIndex === action.index &&
                consumer.effect === effect &&
                consumer.operationIndex === operationIndex,
            ),
        ),
      ),
    )
  )
    canonical.scopeBoundaries.push('otherHpWriterOutsideConsumer');
  return { ...canonical, consumers };
}
export type ReceiveSelection = HpPreparationSelection<Receive> & {
  canonical: NonNullable<ReturnType<typeof receiveCanonical>>;
};
export function receiveSelection(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  index = 0,
): ReceiveSelection | null {
  const canonical = receiveCanonical(prepared);
  return canonical
    ? {
        index,
        identity: `hpReceive:${index}:${JSON.stringify(
          canonical.writers.map((w) => [
            w.sourceId,
            w.form,
            w.actionId,
            w.skillId,
            w.effect.occurrenceId,
            w.operationIndex,
          ]),
        )}`,
        prepared,
        calculation,
        canonical,
      }
    : null;
}
export function receiveSource(
  selection: ReceiveSelection,
  directResult: CalculationApplicationResult,
) {
  return { ...hpPreparationSource(selection), canonical: selection.canonical, directResult };
}
export type ReceiveSource = ReturnType<typeof receiveSource>;
export interface ReceiveRequest {
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
}

/** Reuses only the scoped HP diagnostic formatter; maximumFixed selection/gates are not used. */
export function receiveDiagnostic(source: ReceiveSource) {
  return {
    ...maximumFixedDiagnostic(source),
    directResult: source.directResult,
    facade: {
      preparedStatus: source.selection.prepared.status,
      calculationStatus: source.calculation.status,
      calculation: {
        input: source.calculation.status === 'executable' ? source.calculation.input : undefined,
        effects: source.calculation.effects,
        contributions: source.calculation.effectiveContributions,
        result: source.calculation.result,
        observation:
          'executionObservation' in source.calculation
            ? source.calculation.executionObservation
            : undefined,
      },
      resolved: {
        input:
          source.selection.prepared.resolved.status === 'executable'
            ? source.selection.prepared.resolved.input
            : undefined,
        effects: source.selection.prepared.resolved.effects,
      },
      directTransport:
        battlePointPreparationRejectionObservationFor(source.directResult) === source.transport,
      calculationTransport:
        battlePointPreparationRejectionObservationFor(source.calculation) === source.transport,
    },
    receiveActions: source.transitions?.map((t) =>
      t.hpActions?.map((a) => ({
        actionId: a.actionId,
        commitStartHp: a.commitStartHp,
        writes: a.receiveWrites,
        consumptions: a.receiveConsumptions,
      })),
    ),
  };
}
// Tag containers and absence explicitly so malformed evidence cannot impersonate undefined.
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
function refs(s: ReceiveSource) {
  const references: Record<string, unknown> = {};
  // Full master and application wrappers are anchors, not recursively copied master inventories.
  for (const key of [
    'master',
    'scenario',
    'selection',
    'transport',
    'ordered',
    'calculation',
    'observation',
    'candidate',
    'input',
    'result',
    'effects',
    'contributions',
    'directResult',
  ] as const)
    references[key] = s[key];
  references['prepared'] = s.selection.prepared;
  references['prepared.ordered'] = s.selection.prepared.orderedScenario;
  references['prepared.resolved'] = s.selection.prepared.resolved;
  references['prepared.input'] =
    s.selection.prepared.resolved.status === 'executable'
      ? s.selection.prepared.resolved.input
      : undefined;
  references['calculation.result'] = s.calculation.result;
  references['calculation.input'] =
    s.calculation.status === 'executable' ? s.calculation.input : undefined;
  for (const key of [
    'effects',
    'effectiveContributions',
    'result',
    'executionObservation',
  ] as const)
    references[`facade.calculation.${key}`] =
      key in s.calculation ? Reflect.get(s.calculation, key) : undefined;
  for (const key of [
    'scenario',
    'master',
    'scenarioInput',
    'canonicalInputs',
    'executionObservation',
  ] as const)
    references[`facade.prepared.${key}`] =
      key in s.selection.prepared ? Reflect.get(s.selection.prepared, key) : undefined;
  references['transport.transitions'] = s.transport?.transitions;
  s.transport?.transitions.forEach((t, i) => {
    references[`transport.${i}.before`] = t.before;
    references[`transport.${i}.result`] = t.result;
    references[`transport.${i}.command`] = t.command;
  });
  references['transport.execution'] = s.transport?.orderedExecution;
  references['selected.target'] = s.observation?.targetExecution;
  const visit = (v: unknown, path: string, ancestors: Set<object>) => {
    if (!v || typeof v !== 'object') return;
    references[path] = v;
    if (ancestors.has(v)) return;
    ancestors.add(v);
    for (const [k, x] of Object.entries(v))
      if (k !== 'atlasEvidence' && k !== 'label') visit(x, `${path}.${k}`, ancestors);
    ancestors.delete(v);
  };
  for (const [i, t] of (s.transitions ?? []).entries()) {
    const path = `transition.${i}`;
    references[`${path}.command`] = t.command;
    references[`${path}.result`] = t.result;
    references[`${path}.before`] = t.before;
    references[`${path}.state`] = t.result.state;
    for (const [key, hp] of Object.entries({ beforeHp: t.before.hp, afterHp: t.result.state.hp }))
      visit(hp, `${path}.${key}`, new Set());
    references[`${path}.appliedActions`] = t.result.state.appliedActions;
    t.result.state.appliedActions.forEach((action, j) => {
      references[`${path}.applied.${j}`] = action;
      for (const key of [
        'command',
        'actorFormId',
        'hpBefore',
        'hpAfter',
        'selectedEffects',
      ] as const)
        references[`${path}.applied.${j}.${key}`] = action[key];
    });
    references[`${path}.hpActions`] = t.hpActions;
    t.hpActions?.forEach((n, j) => {
      const q = `${path}.native.${j}`;
      references[q] = n;
      for (const key of [
        'start',
        'sources',
        'native',
        'attempted',
        'returned',
        'receiveWrites',
        'receiveConsumptions',
        'writes',
        'sourceEnds',
        'commitStartHp',
      ] as const)
        references[`${q}.${key}`] = n[key];
      for (const [key, state] of Object.entries({
        start: n.start,
        attempted: n.attempted,
        returned: n.returned,
      }))
        visit(state?.hp, `${q}.${key}.hp`, new Set());
      n.sources.forEach((source, k) => {
        references[`${q}.source.${k}`] = source;
        references[`${q}.source.${k}.effect`] = source.effect;
        references[`${q}.source.${k}.execution`] = source.effect.execution;
      });
      for (const kind of ['receiveWrites', 'writes'] as const)
        n[kind]?.forEach((w, k) => {
          const z = `${q}.${kind}.${k}`;
          references[z] = w;
          references[`${z}.source`] = w.source;
          for (const key of ['before', 'after', 'receipts'] as const)
            visit(w[key], `${z}.${key}`, new Set());
          if ('modifiers' in w) visit(w.modifiers, `${z}.modifiers`, new Set());
          if ('operation' in w) references[`${z}.operation`] = w.operation;
        });
      n.receiveConsumptions?.forEach((read, k) => {
        const z = `${q}.consumptions.${k}`;
        references[z] = read;
        references[`${z}.source`] = read.source;
        visit(read.consumption, `${z}.owner`, new Set());
      });
      n.sourceEnds.forEach((end, k) => {
        const z = `${q}.sourceEnd.${k}`;
        references[z] = end;
        for (const key of ['source', 'before', 'after'] as const)
          references[`${z}.${key}`] = end[key];
        visit(end.before.hp, `${z}.before.hp`, new Set());
        visit(end.after.hp, `${z}.after.hp`, new Set());
      });
    });
  }
  references['candidate.seed'] = s.candidate?.seed;
  visit(s.candidate?.seed.hp, 'candidate.hp', new Set());
  for (const kind of ['reads', 'nps'] as const) {
    references[`candidate.${kind}`] = s.candidate?.[kind];
    s.candidate?.[kind].forEach((entry, i) => {
      references[`candidate.${kind}.${i}`] = entry;
      const observedState: unknown = Reflect.get(entry, 'state');
      references[`candidate.${kind}.${i}.state`] = observedState;
      const observedHp: unknown =
        observedState !== null && typeof observedState === 'object'
          ? Reflect.get(observedState, 'hp')
          : undefined;
      visit(observedHp, `candidate.${kind}.${i}.hp`, new Set());
      for (const key of ['context', 'evaluation', 'input'])
        if (key in entry) references[`candidate.${kind}.${i}.${key}`] = Reflect.get(entry, key);
    });
  }
  return references;
}
export interface ReceiveProgram {
  selection: ReceiveSelection;
}
const authorities = new WeakMap<
  ReceiveProgram,
  {
    contract: unknown;
    proof: ReturnType<typeof receiveDiagnostic>;
    references: Record<string, unknown>;
  }
>();
export function receiveProgram(
  selection: ReceiveSelection,
  directResult: CalculationApplicationResult,
): ReceiveProgram {
  const source = receiveSource(selection, directResult),
    program = { selection };
  authorities.set(program, {
    contract: structuredClone(selection.canonical),
    proof: structuredClone(receiveDiagnostic(source)),
    references: refs(source),
  });
  return program;
}
export type ReceiveReason =
  | 'receivePopulationMismatch'
  | 'receiveCanonicalMismatch'
  | 'receiveIdentityMismatch'
  | 'receiveWriteMismatch'
  | 'receiveConsumptionMismatch'
  | 'receiveCommitMismatch'
  | 'receiveRetainedMismatch'
  | 'receiveResultMismatch'
  | 'receiveTraceMissing';
type Check = {
  identity: string;
  reason: ReceiveReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
};
type Failure = Check & {
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
};
type Checker = (reason: ReceiveReason, path: string, expected: unknown, actual: unknown) => void;
function reason(path: string): ReceiveReason {
  if (path.startsWith('canonical') || path.startsWith('master') || path.startsWith('scenario'))
    return 'receiveCanonicalMismatch';
  if (path.includes('consumptions')) return 'receiveConsumptionMismatch';
  if (path.startsWith('receiveActions') && path.includes('writes')) return 'receiveWriteMismatch';
  if (path.includes('.native.status')) return 'receiveCommitMismatch';
  if (
    [
      'facade',
      'input',
      'result',
      'directResult',
      'effects',
      'contributions',
      'observation',
      'uses',
    ].some((k) => path.startsWith(k))
  )
    return 'receiveResultMismatch';
  return 'receiveRetainedMismatch';
}
function inspect(expected: unknown, actual: unknown, path: string, c: Checker) {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    c(reason(path), `${path}.length`, expected.length, actual.length);
    expected.forEach((x, i) => inspect(x, actual[i], `${path}.${i}`, c));
  } else if (
    expected !== null &&
    actual !== null &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    !(expected instanceof Set) &&
    !(expected instanceof Map) &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const e = expected as Record<string, unknown>,
      a = actual as Record<string, unknown>;
    c(reason(path), `${path}.keys`, Object.keys(e), Object.keys(a));
    for (const k of new Set([...Object.keys(e), ...Object.keys(a)]))
      inspect(e[k], a[k], `${path}.${k}`, c);
  } else c(reason(path), path, expected, actual);
}
function canonicalOwner(prepared: PreparedCalculationScenario): unknown {
  try {
    return receiveCanonical(prepared);
  } catch (error) {
    return {
      kind: 'canonicalReadFailure',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
export function auditReceive(input: {
  requests: readonly ReceiveRequest[];
  expected: readonly ReceiveProgram[];
  observations: readonly ReceiveSource[];
}) {
  const checks: Check[] = [],
    failures: Failure[] = [],
    boundaries: { identity: string; reason: string }[] = [];
  const check = (
    identity: string,
    reason: ReceiveReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const e = value(expected),
      a = value(actual),
      item = { identity, reason, checkPath, expected: e, actual: a };
    checks.push(item);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: e }],
      [{ identity, value: a }],
    );
    if (difference)
      failures.push({
        ...item,
        firstDifference: {
          ...difference,
          path: difference.path ? `${checkPath}.${difference.path}` : checkPath,
        },
      });
  };
  const p: Checker = (r, k, e, a) => check('hpReceive:population', r, k, e, a);
  // Requests, not receipt/native/executable-success observations, own the selected population.
  const requests = input.requests.filter((r) => canonicalOwner(r.prepared) !== null);
  p('receivePopulationMismatch', 'population.requests', requests.length, input.expected.length);
  p(
    'receivePopulationMismatch',
    'population.observations',
    input.expected.map((x) => x.selection.identity),
    input.observations.map((x) => x.identity),
  );
  p(
    'receivePopulationMismatch',
    'population.unique',
    input.expected.length,
    new Set(input.expected.map((x) => x.selection.identity)).size,
  );
  p(
    'receivePopulationMismatch',
    'population.requestUnique',
    requests.length,
    new Set(requests.map((x) => x.prepared)).size,
  );
  let appended = 0,
    consumed = 0,
    changed = 0,
    connected = 0;
  for (const program of input.expected) {
    const identity = program.selection.identity,
      c: Checker = (r, k, e, a) => check(identity, r, k, e, a);
    const authority = authorities.get(program),
      s = input.observations.find((x) => x.identity === identity);
    c('receiveTraceMissing', 'authority', true, !!authority);
    c('receiveTraceMissing', 'source', true, !!s);
    if (!authority || !s) continue;
    const request = requests.find((x) => x.prepared === program.selection.prepared);
    c(
      'receiveIdentityMismatch',
      'request.references',
      [true, true, true],
      [
        !!request,
        request?.calculation === program.selection.calculation,
        s.selection === program.selection,
      ],
    );
    c(
      'receiveCanonicalMismatch',
      'canonical.owner',
      authority.contract,
      canonicalOwner(program.selection.prepared),
    );
    c('receiveCanonicalMismatch', 'canonical.source', authority.contract, s.canonical);
    const proof = receiveDiagnostic(s);
    for (const k of Object.keys(authority.proof)) {
      const e: unknown = Reflect.get(authority.proof, k),
        a: unknown = Reflect.get(proof, k);
      if (
        firstCanonicalAuditDifference(
          [{ identity, value: value(e) }],
          [{ identity, value: value(a) }],
        )
      )
        inspect(e, a, k, c);
      else c(reason(k), `${k}.owner`, e, a);
    }
    const references = refs(s);
    c(
      'receiveIdentityMismatch',
      'reference.population',
      Object.keys(authority.references),
      Object.keys(references),
    );
    for (const [k, r] of Object.entries(authority.references))
      c('receiveIdentityMismatch', `reference.${k}`, true, references[k] === r);
    if (failures.some((f) => f.identity === identity)) continue;
    const boundary = (reason: string) => boundaries.push({ identity, reason });
    if (s.canonical.scopeBoundaries.length) {
      boundary(`outsideScope:${s.canonical.scopeBoundaries.join(',')}`);
      continue;
    }
    if (
      s.transitions?.some(
        (t) =>
          JSON.stringify(t.before.currentFormId) !== JSON.stringify(s.canonical.form) ||
          JSON.stringify(t.result.state.currentFormId) !== JSON.stringify(s.canonical.form),
      )
    ) {
      boundary('outsideFixedActorForm');
      continue;
    }
    let selectionConsumed = 0,
      selectionChanged = 0;
    for (const action of s.canonical.actions) {
      const writers = s.canonical.writers.filter((w) => w.actionIndex === action.index);
      const t = s.transitions?.[action.index],
        path = `action.${action.index}`;
      if (!t) {
        boundary('writerUnreached');
        break;
      }
      c('receiveCanonicalMismatch', `${path}.command`, action.command, t.command);
      if (action.index)
        c(
          'receiveRetainedMismatch',
          `${path}.prefix`,
          true,
          t.before === s.transitions?.[action.index - 1]?.result.state,
        );
      if (!writers.length) continue;
      const n = t.hpActions?.find((n) => n.actionId === action.actionId);
      if (!n || n.native?.status !== 'committed' || t.result.status !== 'applied') {
        boundary('outsideCommittedReceive');
        continue;
      }
      c(
        'receiveCommitMismatch',
        `${path}.commit`,
        ['committed', 'applied'],
        [n.native.status, t.result.status],
      );
      c(
        'receiveRetainedMismatch',
        `${path}.retained`,
        [true, true, true, true],
        [
          n.start.hp === t.before.hp,
          n.returned === n.attempted,
          n.returned?.hp === t.result.state.hp,
          n.attempted?.hp === t.result.state.hp,
        ],
      );
      const applied = t.result.state.appliedActions.at(-1);
      c(
        'receiveRetainedMismatch',
        `${path}.applied`,
        [true, true],
        [applied?.hpBefore === t.before.hp, applied?.hpAfter === t.result.state.hp],
      );
      c(
        'receiveRetainedMismatch',
        `${path}.appliedPrefix`,
        t.before.appliedActions,
        t.result.state.appliedActions.slice(0, -1),
      );
      const writes = n.receiveWrites ?? [];
      c(
        'receiveWriteMismatch',
        `${path}.writeOrder`,
        writers
          .filter((w) =>
            writes.some(
              (v) => v.source.effect === w.effect && v.operationIndex === w.operationIndex,
            ),
          )
          .map((w) => [w.effect.occurrenceId, w.operationIndex]),
        writes.map((w) => [w.source.effect.occurrenceId, w.operationIndex]),
      );
      for (const [i, w] of writers.entries()) {
        const q = `${path}.writer.${i}`,
          src = n.sources.find((x) => x.origin === 'attacker' && x.effect === w.effect);
        c('receiveTraceMissing', `${q}.source`, true, !!src);
        if (!src) continue;
        c(
          'receiveCanonicalMismatch',
          `${q}.identity`,
          [
            w.origin,
            w.sourceId,
            w.sourceInstanceId,
            w.skillId,
            w.valueSetIndex,
            w.valueIndex,
            w.operation,
          ],
          [
            src.origin,
            src.sourceId,
            src.sourceInstanceId,
            src.skillId,
            src.valueSetIndex,
            src.valueIndex,
            src.effect.execution[w.operationIndex],
          ],
        );
        const write = writes.find((x) => x.source === src && x.operationIndex === w.operationIndex);
        const installed =
          n.returned?.hp?.modifiers?.some(
            (x) => x.operation === w.operation && !n.start.hp?.modifiers?.includes(x),
          ) === true;
        if (installed) c('receiveTraceMissing', `${q}.capture`, true, !!write);
        if (!write || !write.modifiers.length) {
          boundary('notApplied');
          continue;
        }
        c(
          'receiveWriteMismatch',
          `${q}.population`,
          [1, 1],
          [write.modifiers.length, write.receipts.length],
        );
        const modifier = write.modifiers[0]!,
          receipt = write.receipts[0];
        if (!receipt) continue;
        c(
          'receiveIdentityMismatch',
          `${q}.references`,
          [true, true, true],
          [
            write.operation === w.operation,
            modifier.operation === w.operation,
            write.after.modifiers?.at(-1) === modifier,
          ],
        );
        c(
          'receiveCanonicalMismatch',
          `${q}.cells`,
          [w.valueSetIndex, w.valueIndex, w.operation.values[w.valueSetIndex]?.[w.valueIndex]],
          [write.valueSetIndex, write.valueIndex, modifier.value],
        );
        c(
          'receiveIdentityMismatch',
          `${q}.instance`,
          [
            `${w.actionId}:${src.sourceInstanceId}:${w.effect.occurrenceId}`,
            w.actor,
            src.constantFormKey ?? null,
          ],
          [modifier.id, modifier.actor, modifier.formKey],
        );
        c(
          'receiveWriteMismatch',
          `${q}.append`,
          [write.before.modifiers ?? [], write.before.receipts, write.before.actors],
          [
            write.after.modifiers?.slice(0, -1),
            write.after.receipts.slice(0, -1),
            write.after.actors,
          ],
        );
        c(
          'receiveWriteMismatch',
          `${q}.receipt`,
          [w.actionId, w.effect.occurrenceId, w.actor, 0, 0, true, true, true],
          [
            receipt.actionId,
            receipt.occurrenceId,
            receipt.actor,
            receipt.attempted,
            receipt.actual,
            receipt.before === write.before.actors.attacker,
            receipt.after === write.after.actors.attacker,
            write.after.receipts.at(-1) === receipt,
          ],
        );
        c(
          'receiveRetainedMismatch',
          `${q}.retainedInstance`,
          true,
          n.returned?.hp?.modifiers?.includes(modifier),
        );
        appended++;
        const consumers = s.canonical.consumers.filter((x) => x.writer === w);
        if (!consumers.length) boundary('noLaterFixedGain');
        for (const [j, consumer] of consumers.entries()) {
          const z = `${q}.consumer.${j}`,
            gain = n.writes.find(
              (x) =>
                x.source.effect === consumer.effect && x.operationIndex === consumer.operationIndex,
            );
          if (!gain || !gain.receipts.length) {
            boundary('consumerNotApplied');
            continue;
          }
          const reads =
            n.receiveConsumptions?.filter(
              (x) => x.source === gain.source && x.operationIndex === consumer.operationIndex,
            ) ?? [];
          c('receiveConsumptionMismatch', `${z}.population`, 1, reads.length);
          const read = reads[0];
          if (!read) continue;
          c(
            'receiveCanonicalMismatch',
            `${z}.source`,
            [
              w.sourceInstanceId,
              w.sourceId,
              w.skillId,
              w.valueSetIndex,
              w.valueIndex,
              consumer.operation,
            ],
            [
              read.source.sourceInstanceId,
              read.source.sourceId,
              read.source.skillId,
              read.valueSetIndex,
              read.valueIndex,
              read.source.effect.execution[read.operationIndex],
            ],
          );
          const h = read.consumption,
            r = gain.receipts[0]!;
          c(
            'receiveConsumptionMismatch',
            `${z}.order`,
            true,
            n.sources.indexOf(src) < n.sources.indexOf(gain.source),
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.instance`,
            true,
            h.receive.instances.includes(modifier),
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.instances`,
            gain.before.modifiers?.filter(
              (x) => x.actor === w.actor && x.operation.action === 'receive',
            ),
            h.receive.instances,
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.input`,
            [
              w.actor,
              true,
              consumer.operation.kind === 'resourceMutation' &&
              consumer.operation.amount.kind === 'fixed'
                ? consumer.operation.amount.values[consumer.valueSetIndex]?.[consumer.valueIndex]
                : undefined,
              'gain',
              'fixed',
            ],
            [
              h.actor,
              h.before === gain.before.actors.attacker,
              h.mutation.amount,
              h.mutation.direction,
              h.mutation.unit,
            ],
          );
          // Read result is observed at the original owner, not recomputed by this audit.
          c(
            'receiveConsumptionMismatch',
            `${z}.receiveArgument`,
            h.receive.value,
            h.mutation.receive,
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.environment`,
            [1000, false],
            [h.mutation.give, h.mutation.noHealing],
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.receipt`,
            [w.actionId, consumer.effect.occurrenceId, w.actor, true, true, true],
            [
              r.actionId,
              r.occurrenceId,
              r.actor,
              r.before === h.before,
              r.after === gain.after.actors.attacker,
              gain.after.receipts.at(-1) === r,
            ],
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.transition`,
            h.result.status === 'applied'
              ? [h.result.actor, h.result.attempted, h.result.actual]
              : h.result,
            [r.after, r.attempted, r.actual],
          );
          c(
            'receiveConsumptionMismatch',
            `${z}.transitionReferences`,
            true,
            h.result.status === 'applied' && h.result.actor === r.after,
          );
          consumed++;
          selectionConsumed++;
          if (r.actual !== null && r.actual > 0) {
            changed++;
            selectionChanged++;
          } else boundary('consumerActualZero');
        }
      }
      const timeline = [
        ...writes,
        ...n.writes,
        ...n.sourceEnds.map((end) => ({
          source: end.source,
          operationIndex: Number.MAX_SAFE_INTEGER,
          before: end.before.hp,
          after: end.after.hp,
        })),
      ].sort(
        (a, b) =>
          n.sources.indexOf(a.source) - n.sources.indexOf(b.source) ||
          a.operationIndex - b.operationIndex,
      );
      let previous = n.start.hp;
      for (const [i, event] of timeline.entries()) {
        c('receiveRetainedMismatch', `${path}.timeline.${i}.before`, previous, event.before);
        previous = event.after;
      }
      c(
        'receiveRetainedMismatch',
        `${path}.timeline.final`,
        previous,
        n.commitStartHp ?? n.sourceEnds.at(-1)?.after.hp,
      );
      const facts = (hp: typeof n.commitStartHp) =>
        hp && Object.fromEntries(Object.entries(hp).filter(([key]) => key !== 'executedEffects'));
      const beforeCommit = facts(n.commitStartHp ?? n.sourceEnds.at(-1)?.after.hp);
      const afterCommit = facts(n.returned?.hp);
      c('receiveRetainedMismatch', `${path}.commitHp`, beforeCommit, afterCommit);
    }
    c('receiveResultMismatch', 'selected.direct', s.calculation.result, s.directResult);
    c(
      'receiveIdentityMismatch',
      'selected.transport',
      [true, true, true],
      [
        s.transport === battlePointPreparationRejectionObservationFor(s.directResult),
        s.transport?.orderedScenario === s.ordered,
        s.transport?.orderedExecution !== undefined || s.selection.prepared.status !== 'executable',
      ],
    );
    c(
      'receiveIdentityMismatch',
      'selected.facade',
      [true, true, true, true],
      [
        s.master === s.selection.prepared.master,
        s.scenario === s.selection.prepared.scenario,
        s.calculation === s.selection.calculation,
        s.calculation.result === s.result,
      ],
    );
    if (s.ordered && s.observation?.targetExecution?.selection === 'selected') {
      c(
        'receiveRetainedMismatch',
        'selected.finalHp',
        s.transitions?.at(-1)?.result.state.hp,
        preparationExecutionStateFor(s.ordered)?.hp,
      );
      c('receiveRetainedMismatch', 'selected.seed', preparationExecutionStateFor(s.ordered)?.hp, s.candidate?.seed.hp);
      c(
        'receiveIdentityMismatch',
        'selected.candidate',
        'selected',
        s.observation.targetExecution.selection,
      );
    } else boundary('noSelectedExecution');
    if (
      selectionConsumed &&
      selectionChanged &&
      s.observation?.targetExecution?.selection === 'selected' &&
      !failures.some((f) => f.identity === identity)
    )
      connected++;
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    expected: input.expected.map((x) => x.selection.identity),
    appended,
    consumed,
    changed,
    connected,
    boundaries,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
export function receiveInventory(master: MasterDataSnapshot) {
  return master.servants.flatMap((servant) =>
    servant.actorFormGraph.forms.flatMap((form) =>
      getSkillsForActorForm(servant, form.id).flatMap((skill) =>
        npProgramEffects(skill.effects).flatMap((effect) =>
          effect.execution.flatMap((operation, operationIndex) =>
            isReceiveSelf(operation)
              ? [
                  {
                    sourceId: servant.id,
                    form: form.id,
                    skillId: skill.id,
                    occurrenceId: effect.occurrenceId,
                    operationIndex,
                    operation,
                  },
                ]
              : [],
          ),
        ),
      ),
    ),
  );
}

/** Published controls retain requests before native/activation filtering. Counts are observations. */
export function auditPublishedReceive(
  master: MasterDataSnapshot,
  requests: readonly ReceiveRequest[],
  programs: readonly ReceiveProgram[],
  observations: readonly ReceiveSource[],
) {
  const gate = auditReceive({ requests, expected: programs, observations }),
    inventory = receiveInventory(master);
  const declarations = programs.flatMap((p) =>
    p.selection.canonical.writers.filter(
      (w) =>
        !inventory.some(
          (d) =>
            d.sourceId === w.sourceId &&
            JSON.stringify(d.form) === JSON.stringify(w.form) &&
            d.skillId === w.skillId &&
            d.occurrenceId === w.effect.occurrenceId &&
            d.operationIndex === w.operationIndex &&
            JSON.stringify(d.operation) === JSON.stringify(w.operation),
        ),
    ),
  );
  const identity = 'hpReceive:published',
    expected = value([]),
    actual = value(declarations),
    check: Check = {
      identity,
      reason: 'receivePopulationMismatch',
      checkPath: 'published.declarations',
      expected,
      actual,
    };
  const difference = firstCanonicalAuditDifference(
    [{ identity, value: expected }],
    [{ identity, value: actual }],
  );
  const failure: Failure | undefined = difference
    ? {
        ...check,
        firstDifference: { ...difference, path: `${check.checkPath}.${difference.path}` },
      }
    : undefined;
  return {
    ...gate,
    inventory,
    checks: [...gate.checks, check],
    failures: [...gate.failures, ...(failure ? [failure] : [])],
    status: gate.status === 'failed' || failure ? ('failed' as const) : ('passed' as const),
    firstDifference: gate.firstDifference ?? failure?.firstDifference ?? null,
  };
}
