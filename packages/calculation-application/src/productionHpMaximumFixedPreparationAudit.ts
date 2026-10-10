import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import { taggedAuditValue } from './taggedAuditValue';
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
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';

export type MaximumFixed = Extract<MasterEffect['execution'][number], { kind: 'hpModifier' }>;
export function isMaximumFixedSelf(
  operation: MasterEffect['execution'][number],
): operation is MaximumFixed {
  const raw: unknown = operation;
  if (!record(raw)) return false;
  return (
    raw['kind'] === 'hpModifier' &&
    raw['action'] === 'maximumFixed' &&
    raw['lifetime'] === 'active' &&
    property(raw['route'], 'target') === 'sourceSelf' &&
    (raw['selection'] === undefined || raw['selection'] === 'direct') &&
    property(raw['bounds'], 'minimum') === null &&
    property(raw['bounds'], 'maximum') === null &&
    (raw['useCondition'] === undefined || property(raw['useCondition'], 'kind') === 'always')
  );
}
export function maximumFixedCanonical(prepared: PreparedCalculationScenario) {
  return hpPreparationCanonicalFor(
    prepared,
    isMaximumFixedSelf,
    (operation) =>
      operation.kind === 'removeHpModifiers' ||
      (operation.kind === 'hpModifier' && !isMaximumFixedSelf(operation)),
  );
}
export type MaximumFixedSelection = HpPreparationSelection<MaximumFixed>;
export function maximumFixedSelection(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  index = 0,
): MaximumFixedSelection | null {
  const canonical = maximumFixedCanonical(prepared);
  return canonical
    ? {
        index,
        identity: `hpMaximumFixed:${index}:${JSON.stringify(canonical.writers.map((w) => [w.sourceId, w.form, w.actionId, w.skillId, w.effect.occurrenceId, w.operationIndex]))}`,
        prepared,
        calculation,
        canonical,
      }
    : null;
}
export function maximumFixedSource(selection: MaximumFixedSelection) {
  return hpPreparationSource(selection);
}
export type MaximumFixedSource = ReturnType<typeof maximumFixedSource>;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const rows = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
function property(v: unknown, key: string): unknown {
  return record(v) ? v[key] : undefined;
}
function mapped(v: unknown, fn: (item: unknown) => unknown): unknown {
  return Array.isArray(v) ? v.map(fn) : v;
}
function effectView(v: unknown): unknown {
  if (!record(v)) return v;
  return Object.fromEntries(
    Object.entries(v).filter(([k]) => k !== 'atlasEvidence' && k !== 'label'),
  );
}
function sourceView(v: unknown): unknown {
  if (!record(v)) return v;
  return { ...v, effect: effectView(v['effect']) };
}
function actionView(v: unknown): unknown {
  if (!record(v)) return v;
  return {
    command: v['command'],
    actorFormId: v['actorFormId'],
    sourceKind: v['sourceKind'],
    sourceId: v['sourceId'],
    hpBefore: v['hpBefore'],
    hpAfter: v['hpAfter'],
    selectedEffects: mapped(v['selectedEffects'], (e) => {
      if (!record(e)) return e;
      return { ...e, effect: effectView(e['effect']) };
    }),
  };
}
function stateView(v: unknown): unknown {
  if (!record(v)) return v;
  return {
    hp: v['hp'],
    currentFormId: v['currentFormId'],
    appliedActions: mapped(v['appliedActions'], actionView),
  };
}
function writeView(v: unknown): unknown {
  return record(v) ? { ...v, source: sourceView(v['source']) } : v;
}
function hpActionView(v: unknown): unknown {
  if (!record(v)) return v;
  return {
    actionId: v['actionId'],
    start: stateView(v['start']),
    sources: mapped(v['sources'], sourceView),
    writes: mapped(v['writes'], writeView),
    modifierWrites: mapped(v['modifierWrites'], writeView),
    sourceEnds: mapped(v['sourceEnds'], (e) =>
      record(e)
        ? {
            source: sourceView(e['source']),
            step: e['step'],
            before: stateView(e['before']),
            after: stateView(e['after']),
          }
        : e,
    ),
    native: v['native'],
    attempted: stateView(v['attempted']),
    returned: stateView(v['returned']),
  };
}
function battleView(v: unknown): unknown {
  return record(v)
    ? {
        hp: v['hp'],
        actorFormId: v['actorFormId'],
        quantities: v['quantities'],
        noblePhantasmVariant: property(v['noblePhantasmVariant'], 'ref'),
      }
    : v;
}
function canonicalView(v: unknown): unknown {
  if (!record(v)) return v;
  return {
    ...v,
    actions: mapped(v['actions'], (a) =>
      record(a) ? { ...a, effects: mapped(a['effects'], effectView) } : a,
    ),
    writers: mapped(v['writers'], (w) =>
      record(w) ? { ...w, effect: effectView(w['effect']) } : w,
    ),
  };
}
/** Complete scoped proof, without unrelated master/raw metadata or alternate damage graphs. */
export function maximumFixedDiagnostic(source: Partial<MaximumFixedSource>) {
  const master: Partial<MasterDataSnapshot> | undefined = source.master;
  const servant = master?.servants?.find((s) => s.id === source.canonical?.servantId);
  return {
    identity: source.identity,
    canonical: canonicalView(source.canonical),
    scenario: source.scenario,
    master: source.master
      ? {
          version: source.master.version,
          servant: servant
            ? {
                id: servant.id,
                hpByLevel: servant.hpByLevel,
                actorFormGraph: servant.actorFormGraph,
                skills: servant.skills.map((s) => ({ ...s, effects: s.effects.map(effectView) })),
              }
            : undefined,
        }
      : undefined,
    transport: source.transport
      ? {
          commands: source.transport.transitions.map((t) => t.command),
          ordered: source.transport.orderedScenario === source.ordered,
          execution: source.transport.orderedExecution !== undefined,
          rejection: source.transport.rejection,
        }
      : undefined,
    transitions: mapped(source.transitions, (t) =>
      record(t)
        ? {
            command: t['command'],
            before: stateView(t['before']),
            result: {
              status: property(t['result'], 'status'),
              state: stateView(property(t['result'], 'state')),
            },
            hpActions: mapped(t['hpActions'], hpActionView),
          }
        : t,
    ),
    ordered: source.ordered
      ? {
          hp: preparationExecutionStateFor(source.ordered)?.hp,
          operations: source.ordered.operations,
          appliedActions: source.ordered.appliedPreparationActions.map(actionView),
        }
      : source.ordered,
    observation: source.observation?.targetExecution
      ? {
          selection: source.observation.targetExecution.selection,
          events:
            source.observation.targetExecution.selection === 'selected'
              ? source.observation.targetExecution.operationEvents
              : undefined,
        }
      : source.observation,
    candidate: source.candidate
      ? {
          seed: source.candidate.seed,
          reads: mapped(source.candidate.reads, (r) =>
            record(r) ? { ...r, state: battleView(r['state']) } : r,
          ),
          nps: mapped(source.candidate.nps, (n) =>
            record(n) ? { ...n, state: battleView(n['state']) } : n,
          ),
        }
      : source.candidate,
    input: source.input,
    effects: source.effects,
    contributions: source.contributions,
    result: source.result,
    uses: source.uses,
  };
}
function anchors(s: Partial<MaximumFixedSource>) {
  const a: Record<string, unknown> = {};
  for (const key of [
    'selection',
    'master',
    'scenario',
    'transport',
    'ordered',
    'calculation',
    'observation',
    'candidate',
    'input',
    'effects',
    'contributions',
    'result',
  ] as const)
    a[key] = s[key];
  a['prepared'] = s.selection?.prepared;
  const prepared = s.selection?.prepared;
  for (const field of [
    'input',
    'result',
    'effects',
    'effectiveContributions',
    'executionObservation',
  ])
    a[`facade.calculation.${field}`] = property(s.calculation, field);
  for (const field of [
    'master',
    'scenario',
    'resolved',
    'orderedScenario',
    'executionObservation',
    'canonicalInputs',
  ])
    a[`facade.prepared.${field}`] = property(prepared, field);
  for (const field of [
    'input',
    'effects',
    'effectiveContributions',
    'requiredInputs',
    'noblePhantasmVariant',
  ])
    a[`facade.resolved.${field}`] = property(property(prepared, 'resolved'), field);
  a['facade.prepared.scenarioInput'] = property(prepared, 'scenarioInput');
  a['transport.transitions'] = s.transport?.transitions;
  a['selected.target'] = s.observation?.targetExecution;
  a['selected.events'] =
    s.observation?.targetExecution?.selection === 'selected'
      ? s.observation.targetExecution.operationEvents
      : undefined;

  a['prepared.transportExecution'] = s.transport?.orderedExecution;
  a['selected.candidate'] =
    s.observation?.targetExecution?.selection === 'selected'
      ? s.observation.targetExecution.candidateState
      : undefined;
  for (const [i, t] of rows(s.transitions).entries()) {
    const p = `action.${i}`;
    for (const k of ['before', 'result', 'command', 'hpActions']) a[`${p}.${k}`] = property(t, k);
    for (const section of ['before', 'result'] as const) {
      const state =
        section === 'result' ? property(property(t, section), 'state') : property(t, section);
      for (const key of ['hp', 'appliedActions'])
        a[`${p}.${section}.${key}`] = property(state, key);
    }
    for (const [j, n] of rows(property(t, 'hpActions')).entries()) {
      const q = `${p}.native.${j}`;
      for (const k of [
        'start',
        'sources',
        'native',
        'attempted',
        'returned',
        'writes',
        'modifierWrites',
        'sourceEnds',
      ])
        a[`${q}.${k}`] = property(n, k);
      for (const kind of ['writes', 'modifierWrites'] as const)
        for (const [k, w] of rows(property(n, kind)).entries()) {
          const path = `${q}.${kind}.${k}`;
          a[path] = w;
          for (const field of ['source', 'operation', 'before', 'after', 'receipts', 'modifiers'])
            a[`${path}.${field}`] = property(w, field);
          const src = property(w, 'source'),
            effect = property(src, 'effect');
          a[`${path}.effect`] = effect;
          a[`${path}.execution`] = property(effect, 'execution');
          for (const field of ['receipts', 'modifiers'])
            rows(property(w, field)).forEach((v, r) => {
              a[`${path}.${field}.${r}`] = v;
            });
        }
      rows(property(n, 'sourceEnds')).forEach((e, k) => {
        for (const f of ['source', 'before', 'after'])
          a[`${q}.sourceEnd.${k}.${f}`] = property(e, f);
      });
    }
  }
  rows(s.uses).forEach((u, i) => {
    for (const field of ['events', 'projections', 'contributions'])
      rows(property(u, field)).forEach((v, j) => {
        a[`use.${i}.${field}.${j}`] = v;
      });
  });
  a['seed.hp'] = property(property(s.candidate, 'seed'), 'hp');
  rows(s.candidate?.reads).forEach((r, i) => {
    a[`reader.${i}.state`] = property(r, 'state');
  });
  rows(s.candidate?.nps).forEach((n, i) => {
    for (const k of ['state', 'context', 'evaluation', 'input']) a[`np.${i}.${k}`] = property(n, k);
  });
  return a;
}
export interface MaximumFixedProgram {
  selection: MaximumFixedSelection;
}
const authorities = new WeakMap<
  MaximumFixedProgram,
  {
    contract: unknown;
    proof: ReturnType<typeof maximumFixedDiagnostic>;
    anchors: Record<string, unknown>;
  }
>();
export function maximumFixedProgram(selection: MaximumFixedSelection): MaximumFixedProgram {
  const source = maximumFixedSource(selection),
    program = { selection };
  authorities.set(program, {
    contract: structuredClone(canonicalView(selection.canonical)),
    proof: structuredClone(maximumFixedDiagnostic(source)),
    anchors: anchors(source),
  });
  return program;
}
function canonicalOwner(prepared: PreparedCalculationScenario): unknown {
  try {
    return canonicalView(maximumFixedCanonical(prepared));
  } catch (error) {
    return {
      kind: 'canonicalReadFailure',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
export type MaximumFixedReason =
  | 'maximumFixedPopulationMismatch'
  | 'maximumFixedCanonicalMismatch'
  | 'maximumFixedIdentityMismatch'
  | 'maximumFixedWriteMismatch'
  | 'maximumFixedCommitMismatch'
  | 'maximumFixedRetainedMismatch'
  | 'maximumFixedReaderMismatch'
  | 'maximumFixedNpMismatch'
  | 'maximumFixedUseMismatch'
  | 'maximumFixedTraceMissing';
type Check = {
  identity: string;
  reason: MaximumFixedReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
};
type Failure = Check & {
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
};
type Checker = (
  reason: MaximumFixedReason,
  path: string,
  expected: unknown,
  actual: unknown,
) => boolean;
function reasonFor(path: string): MaximumFixedReason {
  if (path.startsWith('canonical') || path.startsWith('master') || path.startsWith('scenario'))
    return 'maximumFixedCanonicalMismatch';
  if (path.includes('modifierWrites') || path.includes('.writes'))
    return 'maximumFixedWriteMismatch';
  if (path.includes('.native') && path.includes('status')) return 'maximumFixedCommitMismatch';
  if (path.includes('.reads')) return 'maximumFixedReaderMismatch';
  if (path.includes('.nps')) return 'maximumFixedNpMismatch';
  if (
    ['input', 'effects', 'contributions', 'result', 'uses', 'observation'].some(
      (k) => path === k || path.startsWith(`${k}.`),
    )
  )
    return 'maximumFixedUseMismatch';
  if (path.startsWith('transitions') || path.startsWith('ordered') || path.startsWith('candidate'))
    return 'maximumFixedRetainedMismatch';
  return 'maximumFixedIdentityMismatch';
}
/** Equal pairs can be reused; differences must still report every logical owner path. */
function inspectProof(
  expected: unknown,
  actual: unknown,
  path: string,
  c: Checker,
  inspectedPairs: WeakMap<object, WeakMap<object, boolean>>,
): boolean {
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const previous = inspectedPairs.get(expected)?.get(actual);
    if (previous === true) return true;
  }
  let equal: boolean;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    equal = c(reasonFor(path), `${path}.length`, expected.length, actual.length);
    expected.forEach((v, i) => {
      if (!inspectProof(v, actual[i], `${path}.${i}`, c, inspectedPairs)) equal = false;
    });
  } else if (record(expected) && record(actual)) {
    equal = c(reasonFor(path), `${path}.keys`, Object.keys(expected), Object.keys(actual));
    for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)]))
      if (!inspectProof(expected[k], actual[k], path ? `${path}.${k}` : k, c, inspectedPairs))
        equal = false;
  } else equal = c(reasonFor(path), path, expected, actual);
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const peers = inspectedPairs.get(expected) ?? new WeakMap<object, boolean>();
    peers.set(actual, equal);
    inspectedPairs.set(expected, peers);
  }
  return equal;
}
export function auditMaximumFixed(input: {
  expected: readonly MaximumFixedProgram[];
  observations: readonly MaximumFixedSource[];
}) {
  const copies = new WeakMap<object, CanonicalAuditValue>();
  const canonicalValue = (value: unknown) => taggedAuditValue(value, copies);
  const checks: Check[] = [],
    failures: Failure[] = [];
  const check = (
    identity: string,
    reason: MaximumFixedReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const e = canonicalValue(expected),
      a = canonicalValue(actual),
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
    return difference === null;
  };
  check(
    'hpMaximumFixed:population',
    'maximumFixedPopulationMismatch',
    'population',
    input.expected.map((p) => p.selection.identity),
    input.observations.map((s) => s.identity),
  );
  check(
    'hpMaximumFixed:population',
    'maximumFixedPopulationMismatch',
    'population.unique',
    input.expected.length,
    new Set(input.expected.map((p) => p.selection.identity)).size,
  );
  let changed = 0,
    connected = 0,
    readers = 0,
    nps = 0;
  const boundaries: { identity: string; reason: string }[] = [];
  for (const program of input.expected) {
    // Reuse equal owner pairs only. A rejection under transport cannot suppress the
    // same field's transitions/ordered path or its path-dependent failure category.
    const inspectedPairs = new WeakMap<object, WeakMap<object, boolean>>();
    const identity = program.selection.identity,
      c: Checker = (reason, path, e, a) => check(identity, reason, path, e, a);
    const authority = authorities.get(program),
      source = input.observations.find((s) => s.identity === identity);
    c('maximumFixedTraceMissing', 'authority', true, !!authority);
    c('maximumFixedTraceMissing', 'source', true, !!source);
    if (!authority || !source) continue;
    c(
      'maximumFixedCanonicalMismatch',
      'canonical.owner',
      authority.contract,
      canonicalOwner(program.selection.prepared),
    );
    c(
      'maximumFixedCanonicalMismatch',
      'canonical.source',
      authority.contract,
      canonicalView(source.canonical),
    );
    const actualProof = maximumFixedDiagnostic(source);
    for (const key of Object.keys(authority.proof)) {
      const e = Reflect.get(authority.proof, key) as unknown,
        a = Reflect.get(actualProof, key) as unknown;
      if (
        firstCanonicalAuditDifference(
          [{ identity, value: canonicalValue(e) }],
          [{ identity, value: canonicalValue(a) }],
        )
      )
        inspectProof(e, a, key, c, inspectedPairs);
      else c(reasonFor(key), `${key}.owner`, e, a);
    }
    const refs = anchors(source);
    c(
      'maximumFixedIdentityMismatch',
      'reference.population',
      Object.keys(authority.anchors),
      Object.keys(refs),
    );
    for (const [path, ref] of Object.entries(authority.anchors))
      c('maximumFixedIdentityMismatch', `reference.${path}`, true, refs[path] === ref);
    // Malformed or altered owner evidence is rejected before any success accounting.
    if (failures.some((f) => f.identity === identity)) continue;
    const canonical = program.selection.canonical;
    if (
      source.transitions?.some(
        (t) =>
          JSON.stringify(t.before.currentFormId) !== JSON.stringify(canonical.form) ||
          JSON.stringify(t.result.state.currentFormId) !== JSON.stringify(canonical.form),
      )
    ) {
      boundaries.push({ identity, reason: 'outsideFixedActorForm' });
      continue;
    }
    if (canonical.scopeBoundaries.length) {
      boundaries.push({ identity, reason: `outsideScope:${canonical.scopeBoundaries.join(',')}` });
      continue;
    }
    const counts = inspectCommitted(source, c, (reason) => boundaries.push({ identity, reason }));
    changed += counts.changed;
    if (
      source.selection.prepared.status !== 'executable' ||
      source.calculation.status !== 'executable' ||
      !source.ordered
    ) {
      boundaries.push({ identity, reason: 'beforeOrderedExecution' });
      continue;
    }
    const uses = inspectSelected(source, c, (reason) => boundaries.push({ identity, reason }));
    readers += uses.readers;
    nps += uses.nps;
    if (
      counts.changed &&
      uses.readers &&
      uses.nps &&
      !failures.some((f) => f.identity === identity)
    )
      connected++;
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    expected: input.expected.map((p) => p.selection.identity),
    changed,
    connected,
    readers,
    nps,
    boundaries,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
function inspectCommitted(s: MaximumFixedSource, c: Checker, boundary: (reason: string) => void) {
  let changed = 0;
  for (const action of s.canonical.actions) {
    const path = `action.${action.index}`,
      t = s.transitions?.[action.index];
    c('maximumFixedTraceMissing', `${path}.transition`, true, !!t);
    if (!t) continue;
    c('maximumFixedCanonicalMismatch', `${path}.command`, action.command, t.command);
    c('maximumFixedCanonicalMismatch', `${path}.form`, action.form, t.before.currentFormId);
    if (action.index)
      c(
        'maximumFixedRetainedMismatch',
        `${path}.prefixStart`,
        true,
        t.before === s.transitions?.[action.index - 1]?.result.state,
      );
    const writers = s.canonical.writers.filter((w) => w.actionIndex === action.index);
    if (!writers.length) {
      if (t.result.status !== 'applied') {
        boundary('writerUnreached');
        return { changed };
      }
      continue;
    }
    const n = t.hpActions.find((n) => n.actionId === action.actionId);
    c('maximumFixedTraceMissing', `${path}.native`, true, !!n);
    if (!n) continue;
    c(
      'maximumFixedIdentityMismatch',
      `${path}.start`,
      [true, true],
      [n.start.hp === t.before.hp, n.start.appliedActions === t.before.appliedActions],
    );
    if (n.native?.status !== 'committed' || t.result.status !== 'applied') {
      boundary('outsideCommittedMaximumFixed');
      return { changed };
    }
    c(
      'maximumFixedCommitMismatch',
      `${path}.commit`,
      ['committed', 'applied'],
      [n.native.status, t.result.status],
    );
    c(
      'maximumFixedRetainedMismatch',
      `${path}.returned`,
      [true, true, true],
      [
        n.returned === n.attempted,
        n.returned?.hp === t.result.state.hp,
        n.attempted?.hp === t.result.state.hp,
      ],
    );
    const applied = t.result.state.appliedActions.at(-1);
    c(
      'maximumFixedRetainedMismatch',
      `${path}.applied`,
      [true, true],
      [applied?.hpBefore === t.before.hp, applied?.hpAfter === t.result.state.hp],
    );
    c(
      'maximumFixedRetainedMismatch',
      `${path}.prefix`,
      t.before.appliedActions.map(actionView),
      t.result.state.appliedActions.slice(0, -1).map(actionView),
    );
    const writes = n.modifierWrites ?? [];
    c(
      'maximumFixedWriteMismatch',
      `${path}.writeOrder`,
      writers
        .filter((w) =>
          writes.some((v) => v.source.effect === w.effect && v.operationIndex === w.operationIndex),
        )
        .map((w) => [w.effect.occurrenceId, w.operationIndex]),
      writes.map((w) => [w.source.effect.occurrenceId, w.operationIndex]),
    );
    for (const [i, writer] of writers.entries()) {
      const q = `${path}.modifier.${i}`,
        source = n.sources.find((src) => src.effect === writer.effect && src.origin === 'attacker');
      c('maximumFixedTraceMissing', `${q}.source`, true, !!source);
      if (!source) continue;
      c(
        'maximumFixedCanonicalMismatch',
        `${q}.sourceIdentity`,
        [
          writer.origin,
          writer.sourceInstanceId,
          writer.sourceId,
          writer.skillId,
          writer.valueSetIndex,
          writer.valueIndex,
          writer.operation,
        ],
        [
          source.origin,
          source.sourceInstanceId,
          source.sourceId,
          source.skillId,
          source.valueSetIndex,
          source.valueIndex,
          source.effect.execution[writer.operationIndex],
        ],
      );
      const w = writes.find(
        (w) => w.source === source && w.operationIndex === writer.operationIndex,
      );
      const installed =
        n.returned?.hp?.modifiers?.some(
          (m) => m.operation === writer.operation && !n.start.hp?.modifiers?.includes(m),
        ) === true;
      if (installed) c('maximumFixedTraceMissing', `${q}.capture`, true, !!w);
      if (!w) {
        boundary('notApplied');
        continue;
      }
      c(
        'maximumFixedIdentityMismatch',
        `${q}.operationReference`,
        true,
        w.operation === writer.operation,
      );
      c(
        'maximumFixedWriteMismatch',
        `${q}.cells`,
        [writer.valueSetIndex, writer.valueIndex],
        [w.valueSetIndex, w.valueIndex],
      );
      if (w.before === w.after && !w.modifiers.length && !w.receipts.length) {
        boundary('notApplied');
        continue;
      }
      c(
        'maximumFixedWriteMismatch',
        `${q}.population`,
        [1, 1],
        [w.modifiers.length, w.receipts.length],
      );
      const modifier = w.modifiers[0],
        receipt = w.receipts[0];
      if (!modifier || !receipt) continue;
      c(
        'maximumFixedIdentityMismatch',
        `${q}.identifier`,
        `${writer.actionId}:${source.sourceInstanceId}:${writer.effect.occurrenceId}`,
        modifier.id,
      );
      c(
        'maximumFixedIdentityMismatch',
        `${q}.instance`,
        ['attacker', source.constantFormKey ?? null, true],
        [modifier.actor, modifier.formKey, modifier.operation === w.operation],
      );
      c(
        'maximumFixedWriteMismatch',
        `${q}.value`,
        writer.operation.values[writer.valueSetIndex]?.[writer.valueIndex],
        modifier.value,
      );
      c(
        'maximumFixedWriteMismatch',
        `${q}.modifierPrefix`,
        w.before.modifiers ?? [],
        w.after.modifiers?.slice(0, -1),
      );
      c(
        'maximumFixedIdentityMismatch',
        `${q}.modifierReference`,
        true,
        w.after.modifiers?.at(-1) === modifier,
      );
      c(
        'maximumFixedIdentityMismatch',
        `${q}.receipt`,
        [writer.actionId, writer.effect.occurrenceId, 'attacker', 0, 0],
        [receipt.actionId, receipt.occurrenceId, receipt.actor, receipt.attempted, receipt.actual],
      );
      c(
        'maximumFixedIdentityMismatch',
        `${q}.receiptReferences`,
        [true, true, true],
        [
          receipt.before === w.before.actors.attacker,
          receipt.after === w.after.actors.attacker,
          w.after.receipts.at(-1) === receipt,
        ],
      );
      c(
        'maximumFixedRetainedMismatch',
        `${q}.receiptPrefix`,
        w.before.receipts,
        w.after.receipts.slice(0, -1),
      );
      const before = w.before.actors.attacker,
        after = w.after.actors.attacker;
      if (before?.kind === 'absolute' && after?.kind === 'absolute') {
        c(
          'maximumFixedRetainedMismatch',
          `${q}.baseMaximum`,
          before.baseMaximum,
          after.baseMaximum,
        );
        if (before.maximum !== after.maximum) {
          if (before.current > 0 && after.current > 0) changed++;
          else boundary('deadMaximumChange');
        } else boundary('noMaximumChange');
      } else boundary('noAbsoluteHp');
    }
    // Fixed mutations remain distinct observations, but their order proves consumption of changed maximum.
    c(
      'maximumFixedRetainedMismatch',
      `${path}.sourceEnd`,
      n.sourceEnds.at(-1)?.after.hp?.actors,
      n.attempted?.hp?.actors,
    );
    const orderedWrites = [...writes, ...n.writes].sort(
      (a, b) =>
        n.sources.indexOf(a.source) - n.sources.indexOf(b.source) ||
        a.operationIndex - b.operationIndex,
    );
    let previous = n.start.hp;
    for (const [i, w] of orderedWrites.entries()) {
      c(
        'maximumFixedRetainedMismatch',
        `${path}.orderedWrite.${i}.before`,
        previous?.actors,
        w.before.actors,
      );
      c(
        'maximumFixedRetainedMismatch',
        `${path}.orderedWrite.${i}.modifiers`,
        previous?.modifiers,
        w.before.modifiers,
      );
      previous = w.after;
    }
    c(
      'maximumFixedRetainedMismatch',
      `${path}.lastWrite`,
      previous?.actors,
      n.returned?.hp?.actors,
    );
    c(
      'maximumFixedRetainedMismatch',
      `${path}.lastModifiers`,
      previous?.modifiers,
      n.returned?.hp?.modifiers,
    );
    c(
      'maximumFixedRetainedMismatch',
      `${path}.lastReceipts`,
      previous?.receipts,
      n.returned?.hp?.receipts,
    );
  }
  return { changed };
}
function inspectSelected(s: MaximumFixedSource, c: Checker, boundary: (reason: string) => void) {
  const candidate = s.candidate,
    target = s.observation?.targetExecution;
  c('maximumFixedTraceMissing', 'selected.candidate', true, !!candidate);
  c(
    'maximumFixedIdentityMismatch',
    'selected.transport',
    [true, true, true],
    [
      s.observation ===
        (s.selection.prepared.status === 'executable'
          ? s.selection.prepared.executionObservation
          : undefined),
      target?.selection === 'selected',
      s.transport?.orderedScenario === s.ordered,
    ],
  );
  if (!candidate) return { readers: 0, nps: 0 };
  c(
    'maximumFixedRetainedMismatch',
    'seed.reference',
    [true, true],
    [
      preparationExecutionStateFor(s.ordered)?.hp === s.transitions?.at(-1)?.result.state.hp,
      candidate.seed.hp === preparationExecutionStateFor(s.ordered)?.hp,
    ],
  );
  c(
    'maximumFixedReaderMismatch',
    'reader.population',
    s.canonical.readers.map((r) => [r.operationId, r.sequence, r.leaf.comparison, r.leaf.value]),
    candidate.reads.map((r) => [r.operationId, r.operationSequence, r.comparison, r.expectedValue]),
  );
  if (!s.canonical.readers.length) boundary('noOrderedHpReader');
  let readers = 0,
    nps = 0;
  for (const [i, r] of candidate.reads.entries()) {
    c('maximumFixedReaderMismatch', `reader.${i}.hp`, candidate.seed.hp, r.state.hp);
    c(
      'maximumFixedReaderMismatch',
      `reader.${i}.permille`,
      [candidate.seed.permille, r.state.quantities.attackerHpPermille, 'attacker'],
      [r.permille, r.permille, r.actor],
    );
    const use = s.uses.find((u) => u.operationId === r.operationId);
    c('maximumFixedUseMismatch', `reader.${i}.eventPopulation`, 1, use?.events.length);
    for (const e of use?.events ?? [])
      c('maximumFixedReaderMismatch', `reader.${i}.condition`, r.conditionOutcome, e.condition);
    readers++;
  }
  c(
    'maximumFixedNpMismatch',
    'np.population',
    s.canonical.nps.map((n) => [n.operation.operationId, n.sequence]),
    candidate.nps.map((n) => [n.operationId, n.operationSequence]),
  );
  c(
    'maximumFixedNpMismatch',
    'np.canonical',
    s.canonical.naturalNps.length,
    s.canonical.nps.length,
  );
  if (!s.canonical.nps.length) boundary('noHpRatioLowNp');
  for (const [i, n] of candidate.nps.entries()) {
    c('maximumFixedNpMismatch', `np.${i}.hp`, candidate.seed.hp, n.state.hp);
    c('maximumFixedNpMismatch', `np.${i}.ratio`, n.context.attackerHpRatio, n.ratio);
    c(
      'maximumFixedNpMismatch',
      `np.${i}.input`,
      [s.input?.npMultipliers, s.input?.npSpecialMultipliers, s.input?.damageFunction],
      [n.input.npMultipliers, n.input.npSpecialMultipliers, n.input.damageFunction],
    );
    if (n.disposition === 'consumed') nps++;
    else boundary(`hpNp:${n.disposition}`);
  }
  for (const [i, u] of s.uses.entries()) {
    c('maximumFixedUseMismatch', `use.${i}.events`, 1, u.events.length);
    for (const e of u.events) {
      c(
        'maximumFixedUseMismatch',
        `use.${i}.projection`,
        [e.projectionKey, e.projectionOutcome, e.projectionValuePermille],
        u.projections.map((p) => [p.projectionKey, p.outcome, p.valuePermille])[0],
      );
      for (const contribution of u.contributions)
        c(
          'maximumFixedUseMismatch',
          `use.${i}.contribution.${contribution.component}`,
          e.operationOutcome,
          contribution.executionOutcome,
        );
    }
  }
  return { readers, nps };
}
export function maximumFixedInventory(master: MasterDataSnapshot) {
  return master.servants.flatMap((servant) =>
    servant.actorFormGraph.forms.flatMap((form) =>
      getSkillsForActorForm(servant, form.id).flatMap((skill) =>
        npProgramEffects(skill.effects).flatMap((effect) =>
          effect.execution.flatMap((operation, operationIndex) =>
            isMaximumFixedSelf(operation)
              ? [
                  {
                    servantId: servant.id,
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
export function auditPublishedMaximumFixed(
  master: MasterDataSnapshot,
  requests: readonly { prepared: PreparedCalculationScenario; calculation: CalculationExecution }[],
  selections: readonly MaximumFixedSelection[],
  programs: readonly MaximumFixedProgram[],
  observations: readonly MaximumFixedSource[],
) {
  const gate = auditMaximumFixed({ expected: programs, observations }),
    inventory = maximumFixedInventory(master);
  const expected = requests.flatMap((r) => {
    const selection = maximumFixedSelection(r.prepared, r.calculation);
    return selection ? [selection] : [];
  });
  // Reindex only after independent canonical collection; activation/receipt/native success never select population.
  expected.forEach((s, i) => {
    const indexed = maximumFixedSelection(s.prepared, s.calculation, i)!;
    s.index = i;
    s.identity = indexed.identity;
  });
  const checks: Check[] = [],
    failures: Failure[] = [];
  for (const [path, wanted, actual] of [
    [
      'published.selections',
      expected.map((s) => [s.identity, canonicalView(s.canonical)]),
      selections.map((s) => [s.identity, canonicalView(s.canonical)]),
    ],
    [
      'published.programs',
      selections.map((s) => s.identity),
      programs.map((p) => p.selection.identity),
    ],
    [
      'published.declarations',
      [],
      selections.flatMap((s) =>
        s.canonical.writers.filter(
          (w) =>
            !inventory.some(
              (d) =>
                d.servantId === w.sourceId &&
                JSON.stringify(d.form) === JSON.stringify(w.form) &&
                d.skillId === w.skillId &&
                d.occurrenceId === w.effect.occurrenceId &&
                d.operationIndex === w.operationIndex &&
                JSON.stringify(d.operation) === JSON.stringify(w.operation),
            ),
        ),
      ),
    ],
  ] as const) {
    const identity = 'hpMaximumFixed:published',
      e = taggedAuditValue(wanted),
      a = taggedAuditValue(actual);
    const check = {
      identity,
      reason: 'maximumFixedPopulationMismatch' as const,
      checkPath: path,
      expected: e,
      actual: a,
    };
    checks.push(check);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: e }],
      [{ identity, value: a }],
    );
    if (difference)
      failures.push({
        ...check,
        firstDifference: { ...difference, path: `${path}.${difference.path}` },
      });
  }
  return {
    ...gate,
    inventory,
    selected: selections.length,
    checks: [...gate.checks, ...checks],
    failures: [...gate.failures, ...failures],
    status: gate.failures.length || failures.length ? ('failed' as const) : ('passed' as const),
    firstDifference: gate.firstDifference ?? failures[0]?.firstDifference ?? null,
  };
}
