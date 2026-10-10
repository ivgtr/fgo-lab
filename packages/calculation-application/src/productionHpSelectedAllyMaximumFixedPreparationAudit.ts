import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import {
  actorFormKey,
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
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type {
  PreparedCalculationScenario,
  CalculationExecution,
  CalculationApplicationResult,
} from './scenario';

export type SelectedAllyMaximumFixed = Extract<
  MasterEffect['execution'][number],
  { kind: 'hpModifier' }
>;
export function isSelectedAllyMaximumFixed(
  operation: MasterEffect['execution'][number],
): operation is SelectedAllyMaximumFixed {
  const raw: unknown = operation;
  if (!record(raw)) return false;
  return (
    raw['kind'] === 'hpModifier' &&
    raw['action'] === 'maximumFixed' &&
    raw['lifetime'] === 'active' &&
    property(raw['route'], 'target') === 'partyMember' &&
    raw['selection'] === 'selectedAlly' &&
    property(raw['bounds'], 'minimum') === null &&
    property(raw['bounds'], 'maximum') === null &&
    (raw['useCondition'] === undefined || property(raw['useCondition'], 'kind') === 'always')
  );
}
export function selectedAllyMaximumFixedCanonical(prepared: PreparedCalculationScenario) {
  const canonical = hpPreparationCanonicalFor(
    prepared,
    isSelectedAllyMaximumFixed,
    (operation) =>
      operation.kind === 'removeHpModifiers' ||
      (operation.kind === 'hpModifier' && !isSelectedAllyMaximumFixed(operation)),
  );
  if (
    canonical &&
    canonical.actions.some((a) =>
      a.effects.some((e) =>
        e.execution.some((o) => o.kind === 'resourceMutation' && o.resource === 'hp'),
      ),
    )
  )
    canonical.scopeBoundaries.push('otherHpWriter');
  return canonical;
}
export type SelectedAllyMaximumFixedSelection = HpPreparationSelection<SelectedAllyMaximumFixed>;
function selectionIdentity(
  canonical: NonNullable<ReturnType<typeof selectedAllyMaximumFixedCanonical>>,
  index: number,
) {
  return `hpSelectedAllyMaximumFixed:${index}:${JSON.stringify(canonical.writers.map((w) => [w.sourceId, w.form, w.actionId, w.skillId, w.effect.occurrenceId, w.operationIndex]))}`;
}
export function selectedAllyMaximumFixedSelection(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  index = 0,
): SelectedAllyMaximumFixedSelection | null {
  const canonical = selectedAllyMaximumFixedCanonical(prepared);
  return canonical
    ? { index, identity: selectionIdentity(canonical, index), prepared, calculation, canonical }
    : null;
}
export function selectedAllyMaximumFixedSource(
  selection: SelectedAllyMaximumFixedSelection,
  directResult: CalculationApplicationResult,
) {
  return { ...hpPreparationSource(selection), directResult };
}
export type SelectedAllyMaximumFixedSource = ReturnType<typeof selectedAllyMaximumFixedSource>;
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
function selectedAllyMaximumFixedValueView(source: Partial<SelectedAllyMaximumFixedSource>) {
  const prepared = source.selection?.prepared;
  const master: Partial<MasterDataSnapshot> | undefined = source.master;
  const actor = master?.servants?.find((s) => s.id === source.canonical?.servantId);
  return {
    identity: source.identity,
    selection: source.selection
      ? {
          identity: source.selection.identity,
          index: source.selection.index,
          canonical: canonicalView(source.selection.canonical),
        }
      : undefined,
    canonical: canonicalView(source.canonical),
    scenario: source.scenario,
    master: source.master
      ? {
          version: source.master.version,
          servant: actor
            ? {
                id: actor.id,
                hpByLevel: actor.hpByLevel,
                actorFormGraph: actor.actorFormGraph,
                skills: actor.skills.map((s) => ({ ...s, effects: s.effects.map(effectView) })),
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
    masterActorEnvironment: actor
      ? {
          id: actor.id,
          classId: actor.classId,
          predicates: actor.predicates,
          actorFormGraph: actor.actorFormGraph,
          hpByLevel: actor.hpByLevel,
        }
      : undefined,
    directResult: source.directResult,
    facade: {
      preparedStatus: prepared?.status,
      calculationStatus: source.calculation?.status,
      preparedInput:
        prepared?.resolved.status === 'executable' ? prepared.resolved.input : undefined,
      preparedEffects: prepared?.resolved.effects,
      calculationInput:
        source.calculation?.status === 'executable' ? source.calculation.input : undefined,
      calculationResult: source.calculation?.result,
      calculationEffects: source.calculation?.effects,
      calculationContributions: source.calculation?.effectiveContributions,
      directTransport: source.directResult
        ? battlePointPreparationRejectionObservationFor(source.directResult) === source.transport
        : false,
      calculationTransport: source.calculation
        ? battlePointPreparationRejectionObservationFor(source.calculation) === source.transport
        : false,
    },
    selectedAllyActions: mapped(source.transitions, (t) =>
      record(t)
        ? mapped(t['hpActions'], (a) =>
            record(a)
              ? {
                  actionId: a['actionId'],
                  commitStartHp: a['commitStartHp'],
                  writes: a['selectedAllyMaximumFixedWrites'],
                }
              : a,
          )
        : t,
    ),
  };
}

type ValueSnapshot =
  | { readonly type: 'undefined' }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'object'; readonly value: null }
  | {
      readonly type: 'object' | 'nullObject';
      readonly fields: Readonly<Record<string, ValueSnapshot>>;
    }
  | { readonly type: 'array' | 'set'; readonly values: readonly ValueSnapshot[] }
  | { readonly type: 'map'; readonly values: readonly (readonly [ValueSnapshot, ValueSnapshot])[] };
/** A gate-local value graph. Project semantic views before snapshotting; never intern live owners. */
function valueSnapshotter() {
  const values = new WeakMap<object, ValueSnapshot>();
  const visiting = new WeakSet();
  const snapshot = (v: unknown): ValueSnapshot => {
    if (v === undefined) return Object.freeze({ type: 'undefined' });
    if (v === null) return Object.freeze({ type: 'object', value: null });
    if (typeof v === 'boolean') return Object.freeze({ type: 'boolean', value: v });
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0))
        throw new TypeError('invalid_selected_ally_proof_number');
      return Object.freeze({ type: 'number', value: v });
    }
    if (typeof v === 'string') return Object.freeze({ type: 'string', value: v });
    if (typeof v !== 'object')
      throw new TypeError(`unsupported_selected_ally_proof_value:${typeof v}`);
    const existing = values.get(v);
    if (existing) return existing;
    if (visiting.has(v)) throw new TypeError('cyclic_selected_ally_proof_value');
    if (
      Object.getPrototypeOf(v) !== Set.prototype &&
      Object.getPrototypeOf(v) !== Map.prototype &&
      !Array.isArray(v) &&
      Object.getPrototypeOf(v) !== Object.prototype &&
      Object.getPrototypeOf(v) !== null
    )
      throw new TypeError('unsupported_selected_ally_proof_object');
    visiting.add(v);
    let result: ValueSnapshot;
    if (Object.getPrototypeOf(v) === Set.prototype)
      result = { type: 'set', values: Object.freeze([...(v as Set<unknown>)].map(snapshot)) };
    else if (Object.getPrototypeOf(v) === Map.prototype)
      result = {
        type: 'map',
        values: Object.freeze(
          [...(v as Map<unknown, unknown>)].map(([k, item]) =>
            Object.freeze([snapshot(k), snapshot(item)] as const),
          ),
        ),
      };
    else if (Array.isArray(v)) {
      if (Reflect.ownKeys(v).length !== v.length + 1)
        throw new TypeError('invalid_selected_ally_proof_array');
      result = { type: 'array', values: Object.freeze(v.map(snapshot)) };
    } else
      result = {
        type: Object.getPrototypeOf(v) === null ? 'nullObject' : 'object',
        fields: Object.freeze(
          Object.fromEntries(
            Reflect.ownKeys(v).map((k) => {
              if (typeof k !== 'string') throw new TypeError('unsupported_selected_ally_proof_key');
              const descriptor = Object.getOwnPropertyDescriptor(v, k)!;
              if (!descriptor.enumerable || !('value' in descriptor))
                throw new TypeError('unsupported_selected_ally_proof_property');
              return [k, snapshot(descriptor.value)];
            }),
          ),
        ),
      };
    Object.freeze(result);
    values.set(v, result);
    visiting.delete(v);
    return result;
  };
  return snapshot;
}
function canonicalValue(v: unknown): ValueSnapshot {
  return valueSnapshotter()(v);
}
type ProofSection = keyof ReturnType<typeof selectedAllyMaximumFixedValueView>;
export type SelectedAllyMaximumFixedValueProof = Readonly<Record<ProofSection, ValueSnapshot>>;
function selectedAllyMaximumFixedValueProof(
  source: Partial<SelectedAllyMaximumFixedSource>,
): SelectedAllyMaximumFixedValueProof {
  const snapshot = valueSnapshotter();
  const view = selectedAllyMaximumFixedValueView(source);
  return Object.freeze(
    Object.fromEntries(Object.entries(view).map(([key, value]) => [key, snapshot(value)])),
  ) as SelectedAllyMaximumFixedValueProof;
}
/** Fixture inspection view only; gate diagnostics use the immutable typed proof captured in that call. */
export function selectedAllyMaximumFixedDiagnostic(
  source: Partial<SelectedAllyMaximumFixedSource>,
) {
  return structuredClone(selectedAllyMaximumFixedValueView(source));
}
function anchors(s: Partial<SelectedAllyMaximumFixedSource>) {
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
    'directResult',
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
        'selectedAllyMaximumFixedWrites',
        'sourceEnds',
        'commitStartHp',
      ])
        a[`${q}.${k}`] = property(n, k);
      for (const kind of ['writes', 'selectedAllyMaximumFixedWrites'] as const)
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
    a[`reader.${i}.hp`] = property(property(r, 'state'), 'hp');
  });
  rows(s.candidate?.nps).forEach((n, i) => {
    for (const k of ['state', 'context', 'evaluation', 'input']) a[`np.${i}.${k}`] = property(n, k);
    a[`np.${i}.hp`] = property(property(n, 'state'), 'hp');
  });
  return a;
}
export interface SelectedAllyMaximumFixedProgram {
  readonly canonicalExpectation: {
    readonly identity: string;
    readonly index: number;
    readonly value: ValueSnapshot;
  };
  readonly valueProof: SelectedAllyMaximumFixedValueProof;
  /** Live owners are deliberately separate from serializable value evidence. */
  readonly liveOwners: {
    readonly selection: SelectedAllyMaximumFixedSelection;
    readonly anchors: Readonly<Record<string, unknown>>;
  };
}
export function selectedAllyMaximumFixedProgram(
  selection: SelectedAllyMaximumFixedSelection,
  directResult: CalculationApplicationResult,
): SelectedAllyMaximumFixedProgram {
  const source = selectedAllyMaximumFixedSource(selection, directResult);
  return Object.freeze({
    canonicalExpectation: Object.freeze({
      identity: selection.identity,
      index: selection.index,
      value: canonicalValue(canonicalView(selection.canonical)),
    }),
    valueProof: selectedAllyMaximumFixedValueProof(source),
    liveOwners: Object.freeze({ selection, anchors: Object.freeze(anchors(source)) }),
  });
}
function canonicalOwner(prepared: PreparedCalculationScenario): unknown {
  try {
    return canonicalView(selectedAllyMaximumFixedCanonical(prepared));
  } catch (error) {
    return {
      kind: 'canonicalReadFailure',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
export type SelectedAllyMaximumFixedReason =
  | 'selectedAllyMaximumFixedPopulationMismatch'
  | 'selectedAllyMaximumFixedCanonicalMismatch'
  | 'selectedAllyMaximumFixedIdentityMismatch'
  | 'selectedAllyMaximumFixedWriteMismatch'
  | 'selectedAllyMaximumFixedCommitMismatch'
  | 'selectedAllyMaximumFixedRetainedMismatch'
  | 'selectedAllyMaximumFixedReaderMismatch'
  | 'selectedAllyMaximumFixedNpMismatch'
  | 'selectedAllyMaximumFixedUseMismatch'
  | 'selectedAllyMaximumFixedTraceMissing';
type Check = {
  identity: string;
  reason: SelectedAllyMaximumFixedReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
};
type Failure = Check & {
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
};
type Checker = (
  reason: SelectedAllyMaximumFixedReason,
  path: string,
  expected: unknown,
  actual: unknown,
) => void;
type ProofRule = {
  readonly reason: SelectedAllyMaximumFixedReason;
  readonly fields?: Readonly<Record<string, ProofRule>>;
  readonly item?: ProofRule;
};
const identityRule: ProofRule = { reason: 'selectedAllyMaximumFixedIdentityMismatch' };
const canonicalRule: ProofRule = { reason: 'selectedAllyMaximumFixedCanonicalMismatch' };
const writeRule: ProofRule = { reason: 'selectedAllyMaximumFixedWriteMismatch' };
const retainedRule: ProofRule = { reason: 'selectedAllyMaximumFixedRetainedMismatch' };
const useRule: ProofRule = { reason: 'selectedAllyMaximumFixedUseMismatch' };
const nativeRule: ProofRule = {
  ...retainedRule,
  fields: { status: { reason: 'selectedAllyMaximumFixedCommitMismatch' } },
};
const hpActionRule: ProofRule = {
  ...retainedRule,
  fields: {
    native: nativeRule,
    writes: writeRule,
    modifierWrites: writeRule,
    selectedAllyMaximumFixedWrites: writeRule,
  },
};
const proofRules: Readonly<Record<ProofSection, ProofRule>> = {
  identity: identityRule,
  selection: { ...identityRule, fields: { canonical: canonicalRule } },
  canonical: canonicalRule,
  scenario: canonicalRule,
  master: canonicalRule,
  masterActorEnvironment: canonicalRule,
  transport: identityRule,
  transitions: {
    ...retainedRule,
    item: { ...retainedRule, fields: { hpActions: { ...retainedRule, item: hpActionRule } } },
  },
  ordered: retainedRule,
  observation: useRule,
  candidate: {
    ...retainedRule,
    fields: {
      reads: { reason: 'selectedAllyMaximumFixedReaderMismatch' },
      nps: { reason: 'selectedAllyMaximumFixedNpMismatch' },
    },
  },
  input: useRule,
  effects: useRule,
  contributions: useRule,
  result: useRule,
  uses: useRule,
  directResult: useRule,
  facade: useRule,
  selectedAllyActions: {
    ...identityRule,
    item: { ...identityRule, item: { ...identityRule, fields: { writes: writeRule } } },
  },
};
type ValueChecker = (
  reason: SelectedAllyMaximumFixedReason,
  path: string,
  expected: ValueSnapshot,
  actual: ValueSnapshot,
) => void;
/** Structural roles decide reasons; diagnostic paths only identify a check. */
function inspectProof(
  expected: ValueSnapshot,
  actual: ValueSnapshot,
  path: string,
  rule: ProofRule,
  c: ValueChecker,
) {
  if (expected.type === 'array' && actual.type === 'array') {
    c(
      rule.reason,
      `${path}.length`,
      canonicalValue(expected.values.length),
      canonicalValue(actual.values.length),
    );
    expected.values.forEach((v, i) =>
      inspectProof(
        v,
        actual.values[i] ?? canonicalValue(undefined),
        `${path}.${i}`,
        rule.item ?? { reason: rule.reason },
        c,
      ),
    );
  } else if (
    (expected.type === 'object' || expected.type === 'nullObject') &&
    'fields' in expected &&
    actual.type === expected.type &&
    'fields' in actual
  ) {
    c(
      rule.reason,
      `${path}.keys`,
      canonicalValue(Object.keys(expected.fields)),
      canonicalValue(Object.keys(actual.fields)),
    );
    for (const k of new Set([...Object.keys(expected.fields), ...Object.keys(actual.fields)]))
      inspectProof(
        expected.fields[k] ?? canonicalValue(undefined),
        actual.fields[k] ?? canonicalValue(undefined),
        path ? `${path}.${k}` : k,
        rule.fields?.[k] ?? { reason: rule.reason },
        c,
      );
  } else c(rule.reason, path, expected, actual);
}
export function auditSelectedAllyMaximumFixed(input: {
  expected: readonly SelectedAllyMaximumFixedProgram[];
  observations: readonly SelectedAllyMaximumFixedSource[];
}) {
  const checks: Check[] = [],
    failures: Failure[] = [];
  const checkValue = (
    identity: string,
    reason: SelectedAllyMaximumFixedReason,
    checkPath: string,
    e: ValueSnapshot,
    a: ValueSnapshot,
  ) => {
    const item = { identity, reason, checkPath, expected: e, actual: a };
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
  const check = (
    identity: string,
    reason: SelectedAllyMaximumFixedReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => checkValue(identity, reason, path, canonicalValue(expected), canonicalValue(actual));
  // Capture every observation, including unmatched identities, before any fixture can restore it.
  const proofs = Object.freeze({
    expected: Object.freeze(
      input.expected.map((program) =>
        Object.freeze({
          identity: program.canonicalExpectation.identity,
          canonical: program.canonicalExpectation.value,
          values: program.valueProof,
        }),
      ),
    ),
    actual: Object.freeze(
      input.observations.map((source) =>
        Object.freeze({
          identity: source.identity,
          values: selectedAllyMaximumFixedValueProof(source),
        }),
      ),
    ),
  });
  check(
    'hpSelectedAllyMaximumFixed:population',
    'selectedAllyMaximumFixedPopulationMismatch',
    'population',
    input.expected.map((p) => p.canonicalExpectation.identity),
    input.observations.map((s) => s.identity),
  );
  check(
    'hpSelectedAllyMaximumFixed:population',
    'selectedAllyMaximumFixedPopulationMismatch',
    'population.unique',
    input.expected.length,
    new Set(input.expected.map((p) => p.canonicalExpectation.identity)).size,
  );
  let changed = 0,
    connected = 0,
    readers = 0,
    nps = 0;
  const boundaries: { identity: string; reason: string }[] = [];
  for (const program of input.expected) {
    const identity = program.canonicalExpectation.identity,
      c: Checker = (reason, path, e, a) => check(identity, reason, path, e, a);
    const source = input.observations.find((s) => s.identity === identity);
    c('selectedAllyMaximumFixedTraceMissing', 'source', true, !!source);
    if (!source) continue;
    checkValue(
      identity,
      'selectedAllyMaximumFixedCanonicalMismatch',
      'canonical.owner',
      program.canonicalExpectation.value,
      canonicalValue(canonicalOwner(program.liveOwners.selection.prepared)),
    );
    checkValue(
      identity,
      'selectedAllyMaximumFixedCanonicalMismatch',
      'canonical.source',
      program.canonicalExpectation.value,
      canonicalValue(canonicalView(source.canonical)),
    );
    const actualProof = proofs.actual[input.observations.indexOf(source)]!.values;
    const cv: ValueChecker = (reason, path, e, a) => checkValue(identity, reason, path, e, a);
    for (const key of Object.keys(proofRules) as ProofSection[]) {
      const e = program.valueProof[key],
        a = actualProof[key],
        rule = proofRules[key];
      if (firstCanonicalAuditDifference([{ identity, value: e }], [{ identity, value: a }]))
        inspectProof(e, a, key, rule, cv);
      else cv(rule.reason, `${key}.owner`, e, a);
    }
    const refs = anchors(source);
    c(
      'selectedAllyMaximumFixedIdentityMismatch',
      'reference.population',
      Object.keys(program.liveOwners.anchors),
      Object.keys(refs),
    );
    for (const [path, ref] of Object.entries(program.liveOwners.anchors))
      c('selectedAllyMaximumFixedIdentityMismatch', `reference.${path}`, true, refs[path] === ref);
    // Malformed or altered owner evidence is rejected before any success accounting.
    if (failures.some((f) => f.identity === identity)) continue;
    const canonical = source.canonical;
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
    c(
      'selectedAllyMaximumFixedUseMismatch',
      'facade.directResult',
      source.calculation.result,
      source.directResult,
    );
    if (source.transitions?.some((t) => t.result.status !== 'applied')) {
      boundaries.push({ identity, reason: 'nativeNoncommit' });
      c(
        'selectedAllyMaximumFixedUseMismatch',
        'boundary.downstream',
        [undefined, undefined, null],
        [
          source.candidate,
          source.input,
          source.result.status === 'calculated' ? source.result : null,
        ],
      );
      continue;
    }
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
    expected: input.expected.map((p) => p.canonicalExpectation.identity),
    changed,
    connected,
    readers,
    nps,
    boundaries,
    proofs,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
function inspectCommitted(
  s: SelectedAllyMaximumFixedSource,
  c: Checker,
  boundary: (reason: string) => void,
) {
  let changed = 0;
  for (const action of s.canonical.actions) {
    const path = `action.${action.index}`,
      t = s.transitions?.[action.index];
    c('selectedAllyMaximumFixedTraceMissing', `${path}.transition`, true, !!t);
    if (!t) continue;
    c('selectedAllyMaximumFixedCanonicalMismatch', `${path}.command`, action.command, t.command);
    c(
      'selectedAllyMaximumFixedCanonicalMismatch',
      `${path}.form`,
      action.form,
      t.before.currentFormId,
    );
    if (action.index)
      c(
        'selectedAllyMaximumFixedRetainedMismatch',
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
    const n = (t as Partial<typeof t>).hpActions?.find((n) => n.actionId === action.actionId);
    c('selectedAllyMaximumFixedTraceMissing', `${path}.native`, true, !!n);
    if (!n) continue;
    c(
      'selectedAllyMaximumFixedIdentityMismatch',
      `${path}.start`,
      [true, true],
      [n.start.hp === t.before.hp, n.start.appliedActions === t.before.appliedActions],
    );
    if (n.native?.status !== 'committed' || t.result.status !== 'applied') {
      boundary('outsideCommittedSelectedAllyMaximumFixed');
      return { changed };
    }
    c(
      'selectedAllyMaximumFixedCommitMismatch',
      `${path}.commit`,
      ['committed', 'applied'],
      [n.native.status, t.result.status],
    );
    c(
      'selectedAllyMaximumFixedRetainedMismatch',
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
      'selectedAllyMaximumFixedRetainedMismatch',
      `${path}.applied`,
      [true, true],
      [applied?.hpBefore === t.before.hp, applied?.hpAfter === t.result.state.hp],
    );
    c(
      'selectedAllyMaximumFixedRetainedMismatch',
      `${path}.prefix`,
      t.before.appliedActions.map(actionView),
      t.result.state.appliedActions.slice(0, -1).map(actionView),
    );
    const writes = n.selectedAllyMaximumFixedWrites ?? [];
    c(
      'selectedAllyMaximumFixedWriteMismatch',
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
      c('selectedAllyMaximumFixedTraceMissing', `${q}.source`, true, !!source);
      if (!source) continue;
      c(
        'selectedAllyMaximumFixedCanonicalMismatch',
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
      if (installed) c('selectedAllyMaximumFixedTraceMissing', `${q}.capture`, true, !!w);
      if (!w) {
        boundary('notApplied');
        continue;
      }
      c(
        'selectedAllyMaximumFixedIdentityMismatch',
        `${q}.operationReference`,
        true,
        w.operation === writer.operation,
      );
      c(
        'selectedAllyMaximumFixedWriteMismatch',
        `${q}.cells`,
        [writer.valueSetIndex, writer.valueIndex],
        [w.valueSetIndex, w.valueIndex],
      );
      if (w.before === w.after && !w.modifiers.length && !w.receipts.length) {
        boundary('notApplied');
        continue;
      }
      c(
        'selectedAllyMaximumFixedWriteMismatch',
        `${q}.population`,
        [1, 1],
        [w.modifiers.length, w.receipts.length],
      );
      const modifier = w.modifiers[0],
        receipt = w.receipts[0];
      if (!modifier || !receipt) continue;
      c(
        'selectedAllyMaximumFixedIdentityMismatch',
        `${q}.identifier`,
        `${writer.actionId}:${source.sourceInstanceId}:${writer.effect.occurrenceId}`,
        modifier.id,
      );
      c(
        'selectedAllyMaximumFixedIdentityMismatch',
        `${q}.instance`,
        ['attacker', source.constantFormKey ?? null, true],
        [modifier.actor, modifier.formKey, modifier.operation === w.operation],
      );
      c(
        'selectedAllyMaximumFixedWriteMismatch',
        `${q}.value`,
        writer.operation.values[writer.valueSetIndex]?.[writer.valueIndex],
        modifier.value,
      );
      c(
        'selectedAllyMaximumFixedWriteMismatch',
        `${q}.modifierPrefix`,
        w.before.modifiers ?? [],
        w.after.modifiers?.slice(0, -1),
      );
      c(
        'selectedAllyMaximumFixedIdentityMismatch',
        `${q}.modifierReference`,
        true,
        w.after.modifiers?.at(-1) === modifier,
      );
      c(
        'selectedAllyMaximumFixedIdentityMismatch',
        `${q}.receipt`,
        [writer.actionId, writer.effect.occurrenceId, 'attacker', 0, 0],
        [receipt.actionId, receipt.occurrenceId, receipt.actor, receipt.attempted, receipt.actual],
      );
      c(
        'selectedAllyMaximumFixedIdentityMismatch',
        `${q}.receiptReferences`,
        [true, true, true],
        [
          receipt.before === w.before.actors.attacker,
          receipt.after === w.after.actors.attacker,
          w.after.receipts.at(-1) === receipt,
        ],
      );
      c(
        'selectedAllyMaximumFixedRetainedMismatch',
        `${q}.receiptPrefix`,
        w.before.receipts,
        w.after.receipts.slice(0, -1),
      );
      const before = w.before.actors.attacker,
        after = w.after.actors.attacker;
      if (before?.kind === 'absolute' && after?.kind === 'absolute') {
        c(
          'selectedAllyMaximumFixedRetainedMismatch',
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
      'selectedAllyMaximumFixedRetainedMismatch',
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
        'selectedAllyMaximumFixedRetainedMismatch',
        `${path}.orderedWrite.${i}.before`,
        previous?.actors,
        w.before.actors,
      );
      c(
        'selectedAllyMaximumFixedRetainedMismatch',
        `${path}.orderedWrite.${i}.modifiers`,
        previous?.modifiers,
        w.before.modifiers,
      );
      previous = w.after;
    }
    c(
      'selectedAllyMaximumFixedRetainedMismatch',
      `${path}.lastWrite`,
      previous?.actors,
      n.returned?.hp?.actors,
    );
    c(
      'selectedAllyMaximumFixedRetainedMismatch',
      `${path}.lastModifiers`,
      previous?.modifiers,
      n.returned?.hp?.modifiers,
    );
    c(
      'selectedAllyMaximumFixedRetainedMismatch',
      `${path}.lastReceipts`,
      previous?.receipts,
      n.returned?.hp?.receipts,
    );
  }
  return { changed };
}
function inspectSelected(
  s: SelectedAllyMaximumFixedSource,
  c: Checker,
  boundary: (reason: string) => void,
) {
  const candidate = s.candidate,
    target = s.observation?.targetExecution;
  c('selectedAllyMaximumFixedTraceMissing', 'selected.candidate', true, !!candidate);
  c(
    'selectedAllyMaximumFixedIdentityMismatch',
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
    'selectedAllyMaximumFixedRetainedMismatch',
    'seed.reference',
    [true, true],
    [
      preparationExecutionStateFor(s.ordered)?.hp === s.transitions?.at(-1)?.result.state.hp,
      candidate.seed.hp === preparationExecutionStateFor(s.ordered)?.hp,
    ],
  );
  c(
    'selectedAllyMaximumFixedReaderMismatch',
    'reader.population',
    s.canonical.readers.map((r) => [r.operationId, r.sequence, r.leaf.comparison, r.leaf.value]),
    candidate.reads.map((r) => [r.operationId, r.operationSequence, r.comparison, r.expectedValue]),
  );
  if (!s.canonical.readers.length) boundary('noOrderedHpReader');
  let readers = 0,
    nps = 0;
  for (const [i, r] of candidate.reads.entries()) {
    c('selectedAllyMaximumFixedReaderMismatch', `reader.${i}.hp`, candidate.seed.hp, r.state.hp);
    c(
      'selectedAllyMaximumFixedReaderMismatch',
      `reader.${i}.permille`,
      [candidate.seed.permille, r.state.quantities.attackerHpPermille, 'attacker'],
      [r.permille, r.permille, r.actor],
    );
    const use = s.uses.find((u) => u.operationId === r.operationId);
    c('selectedAllyMaximumFixedUseMismatch', `reader.${i}.eventPopulation`, 1, use?.events.length);
    for (const e of use?.events ?? [])
      c(
        'selectedAllyMaximumFixedReaderMismatch',
        `reader.${i}.condition`,
        r.conditionOutcome,
        e.condition,
      );
    readers++;
  }
  c(
    'selectedAllyMaximumFixedNpMismatch',
    'np.population',
    s.canonical.nps.map((n) => [n.operation.operationId, n.sequence]),
    candidate.nps.map((n) => [n.operationId, n.operationSequence]),
  );
  c(
    'selectedAllyMaximumFixedNpMismatch',
    'np.canonical',
    s.canonical.naturalNps.length,
    s.canonical.nps.length,
  );
  if (!s.canonical.nps.length) boundary('noHpRatioLowNp');
  for (const [i, n] of candidate.nps.entries()) {
    c('selectedAllyMaximumFixedNpMismatch', `np.${i}.hp`, candidate.seed.hp, n.state.hp);
    c('selectedAllyMaximumFixedNpMismatch', `np.${i}.ratio`, n.context.attackerHpRatio, n.ratio);
    c(
      'selectedAllyMaximumFixedNpMismatch',
      `np.${i}.input`,
      [s.input?.npMultipliers, s.input?.npSpecialMultipliers, s.input?.damageFunction],
      [n.input.npMultipliers, n.input.npSpecialMultipliers, n.input.damageFunction],
    );
    if (n.disposition === 'consumed') nps++;
    else boundary(`hpNp:${n.disposition}`);
  }
  for (const [i, u] of s.uses.entries()) {
    c('selectedAllyMaximumFixedUseMismatch', `use.${i}.events`, 1, u.events.length);
    for (const e of u.events) {
      c(
        'selectedAllyMaximumFixedUseMismatch',
        `use.${i}.projection`,
        [e.projectionKey, e.projectionOutcome, e.projectionValuePermille],
        u.projections.map((p) => [p.projectionKey, p.outcome, p.valuePermille])[0],
      );
      for (const contribution of u.contributions)
        c(
          'selectedAllyMaximumFixedUseMismatch',
          `use.${i}.contribution.${contribution.component}`,
          e.operationOutcome,
          contribution.executionOutcome,
        );
    }
  }
  c(
    'selectedAllyMaximumFixedUseMismatch',
    'facade.directResult',
    s.calculation.result,
    s.directResult,
  );
  c(
    'selectedAllyMaximumFixedUseMismatch',
    'facade.preparedInput',
    s.selection.prepared.resolved.status === 'executable'
      ? s.selection.prepared.resolved.input
      : undefined,
    s.input,
  );
  return { readers, nps };
}
export function selectedAllyMaximumFixedInventory(master: MasterDataSnapshot) {
  return master.servants.flatMap((servant) =>
    servant.actorFormGraph.forms.flatMap((form) =>
      getSkillsForActorForm(servant, form.id).flatMap((skill) =>
        npProgramEffects(skill.effects).flatMap((effect) =>
          effect.execution.flatMap((operation, operationIndex) =>
            isSelectedAllyMaximumFixed(operation)
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
export function auditPublishedSelectedAllyMaximumFixed(
  master: MasterDataSnapshot,
  requests: readonly { prepared: PreparedCalculationScenario; calculation: CalculationExecution }[],
  selections: readonly SelectedAllyMaximumFixedSelection[],
  programs: readonly SelectedAllyMaximumFixedProgram[],
  observations: readonly SelectedAllyMaximumFixedSource[],
  canonicalRequests: readonly PreparedCalculationScenario[],
) {
  const gate = auditSelectedAllyMaximumFixed({ expected: programs, observations }),
    inventory = selectedAllyMaximumFixedInventory(master);
  // This ledger is recorded before evaluation, independently of consumer request/selection lists.
  const expected = canonicalRequests.flatMap((prepared) => {
    const canonical = selectedAllyMaximumFixedCanonical(prepared);
    return canonical ? [{ prepared, canonical, identity: '' }] : [];
  });
  expected.forEach((s, i) => {
    s.identity = selectionIdentity(s.canonical, i);
  });
  const actualRequests = requests.flatMap((r) => {
    const canonical = selectedAllyMaximumFixedCanonical(r.prepared);
    return canonical ? [{ prepared: r.prepared, canonical }] : [];
  });
  const checks: Check[] = [],
    failures: Failure[] = [];
  for (const [path, wanted, actual] of [
    [
      'published.requests',
      expected.map((s) => canonicalView(s.canonical)),
      actualRequests.map((s) => canonicalView(s.canonical)),
    ],
    [
      'published.requestOwners',
      expected.map(() => 1),
      expected.map((s) => actualRequests.filter((r) => r.prepared === s.prepared).length),
    ],
    [
      'published.selections',
      expected.map((s) => [s.identity, canonicalView(s.canonical)]),
      selections.map((s) => [s.identity, canonicalView(s.canonical)]),
    ],
    [
      'published.programs',
      selections.map((s) => s.identity),
      programs.map((p) => p.canonicalExpectation.identity),
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
    const identity = 'hpSelectedAllyMaximumFixed:published',
      e = canonicalValue(wanted),
      a = canonicalValue(actual);
    const check = {
      identity,
      reason: 'selectedAllyMaximumFixedPopulationMismatch' as const,
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
    inventory: Object.freeze(
      inventory.map((declaration) =>
        Object.freeze({
          ...declaration,
          form: canonicalValue(declaration.form),
          operation: canonicalValue(declaration.operation),
        }),
      ),
    ),
    selected: selections.length,
    checks: [...gate.checks, ...checks],
    failures: [...gate.failures, ...failures],
    status: gate.failures.length || failures.length ? ('failed' as const) : ('passed' as const),
    firstDifference: gate.firstDifference ?? failures[0]?.firstDifference ?? null,
  };
}

type ResolvedScenario = Extract<PreparedCalculationScenario['scenario'], { mode: 'resolved' }>;
const declaredScopes = new WeakMap<MasterDataSnapshot, Map<string, Set<number>>>();
/** Static canonical declaration join only; conditions, eligibility and execution outcomes never select requests. */
export function selectedAllyMaximumFixedMaySelect(
  master: MasterDataSnapshot,
  scenario: ResolvedScenario,
): boolean {
  let scopes = declaredScopes.get(master);
  if (!scopes) {
    scopes = new Map();
    for (const declaration of selectedAllyMaximumFixedInventory(master)) {
      const servant = master.servants.find((s) => s.id === declaration.servantId)!;
      const skill = getSkillsForActorForm(servant, declaration.form).find(
        (s) => s.id === declaration.skillId,
      )!;
      const key = JSON.stringify([servant.id, actorFormKey(declaration.form)]);
      const slots = scopes.get(key) ?? new Set<number>();
      slots.add(skill.slot);
      scopes.set(key, slots);
    }
    declaredScopes.set(master, scopes);
  }
  const slots = scopes.get(
    JSON.stringify([
      scenario.attacker.servantId,
      actorFormKey(scenario.attacker.initialActorFormId),
    ]),
  );
  return scenario.preNoblePhantasmPlan.some(
    (command) => command.kind === 'useSkillSlot' && slots?.has(command.slot) === true,
  );
}
