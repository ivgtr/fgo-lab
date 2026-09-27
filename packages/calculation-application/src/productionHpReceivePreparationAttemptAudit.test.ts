import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { normalizeAtlasSnapshot } from '@fgo-lab/data-pipeline';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { createDefaultTargetContext } from './targetContext';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import {
  receiveSelection,
  receiveSource,
  receiveInventory,
  isReceiveSelf,
} from './productionHpReceivePreparationAudit';
import {
  auditReceiveAttemptIsolation,
  receiveAttemptProgram,
  receiveAttemptDiagnostic,
  type ReceiveAttemptExpectation,
  type ReceiveAttemptReason,
} from './productionHpReceivePreparationAttemptAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeProductionAuditArtifact,
} from './productionAuditArtifacts';

type Spec = {
  form?: MasterDataSnapshot['servants'][number]['actorFormGraph']['defaultInitialFormId'];
  key: string;
  initial?: number;
  multiple?: boolean;
  secondGain?: boolean;
  choice?: boolean;
  omitted?: boolean;
  disabled?: boolean;
  gain?: number;
  trigger?: 'unsupported' | 'inputRequired' | 'beforeGain' | 'beforeWriter' | 'none';
  beforeNative?: boolean;
  reset?: boolean;
  boundary?: Extract<ReceiveAttemptExpectation, { kind: 'boundary' }>['boundary'];
};
const specs: Spec[] = [
  { key: 'changed' },
  { key: 'multiple', multiple: true, secondGain: true },
  { key: 'choice', choice: true },
  { key: 'omitted-always', omitted: true },
  { key: 'input-required', trigger: 'inputRequired' },
  { key: 'source-reset', reset: true },
  { key: 'actual-zero', initial: 1000, boundary: 'consumerActualZero' },
  { key: 'zero-gain', gain: 0, boundary: 'consumerActualZero' },
  { key: 'consumer-unreached', trigger: 'beforeGain', boundary: 'consumerUnreached' },
  { key: 'consumer-absent', gain: -1, boundary: 'consumerUnreached' },
  { key: 'writer-unreached', trigger: 'beforeWriter', boundary: 'writerUnreached' },
  { key: 'writer-not-applied', disabled: true, boundary: 'writerNotApplied' },
  { key: 'before-native', beforeNative: true, boundary: 'attemptBeforeNative' },
  { key: 'committed', trigger: 'none', boundary: 'nativeCommitted' },
];
const rows = (v: number, rate = 1000) =>
  Array.from({ length: 10 }, (_, i) => ({ Rate: rate, Turn: 3, Count: -1, Value: v + i }));
function rawReceive(id: number, spec: Spec, choice?: number) {
  return {
    funcId: id,
    funcType: 'addState',
    funcTargetType: 'self',
    buffs: Array.from({ length: spec.multiple ? 2 : 1 }, () => ({
      type: 'upGainHp',
      maxRate: 50000,
      vals: [{ id: 3004 }],
    })),
    svals: rows(731).map((r) => ({
      ...r,
      ...(choice === undefined ? {} : { ActSelectIndex: choice }),
    })),
  };
}
const rawGain = (id: number, gain: number) => ({
  funcId: id,
  funcType: 'gainHp',
  funcTargetType: 'self',
  svals: Array.from({ length: 10 }, () => ({ Rate: 1000, Value: gain })),
});
const unsupported = (id: number) => ({
  funcId: id,
  funcType: 'addState',
  funcTargetType: 'self',
  buffs: [{ type: 'addMaxhp', script: { INDIVIDUALITIE: { id: 99001 } } }],
  svals: rows(10),
});
const oc = (id: number) => ({
  funcId: id,
  funcType: 'addState',
  funcTargetType: 'self',
  buffs: [{ type: 'upChagetd', buffGroup: 0, maxRate: 5, vals: [{ name: 'buffPositiveEffect' }] }],
  svals: rows(1, 500).map((r) => ({ ...r, Value: 1 })),
});
const generatedMaster = normalizeAtlasSnapshot({
  version: 'tsk08-receive-attempt',
  servants: specs.map((s, i) => {
    const base = 920000 + i * 100;
    return {
      id: base,
      collectionNo: i + 1,
      type: 'normal',
      name: s.key,
      className: 'saber',
      attribute: 'earth',
      rarity: 4,
      traits: [],
      hpGrowth: Array.from({ length: 100 }, () => 9010),
      atkGrowth: Array.from({ length: 100 }, () => 9000),
      classPassive: [],
      skills: [
        {
          id: base + 1,
          num: 1,
          priority: 1,
          name: 'prefix',
          detail: '',
          functions: [
            {
              funcId: base + 10,
              funcType: 'addState',
              funcTargetType: 'self',
              buffs: [{ type: 'upAtk' }],
              svals: rows(100),
            },
          ],
        },
        {
          id: base + 2,
          num: 2,
          priority: 1,
          name: 'receive',
          detail: '',
          ...(s.beforeNative
            ? { script: { NP_HIGHER: Array.from({ length: 10 }, () => 1000) } }
            : {}),
          functions: [
            ...(s.trigger === 'beforeWriter' ? [unsupported(base + 40)] : []),
            ...(s.choice ? [rawReceive(base + 21, s, 1)] : []),
            rawReceive(base + 20, s, s.choice ? 2 : undefined),
            ...(s.trigger === 'beforeGain' ? [unsupported(base + 41)] : []),
            ...(s.gain === -1 ? [] : [rawGain(base + 30, s.gain ?? 1234)]),
            ...(s.secondGain ? [rawGain(base + 31, 777)] : []),
            ...(s.reset || s.trigger === 'inputRequired' ? [oc(base + 35)] : []),
            ...(['beforeWriter', 'beforeGain', 'inputRequired', 'none'].includes(
              s.trigger ?? 'unsupported',
            )
              ? []
              : [unsupported(base + 42)]),
          ],
        },
      ],
      noblePhantasms: [
        {
          id: base + 3,
          name: 'NP',
          priority: 1,
          card: 'buster',
          functions: [
            {
              funcId: base + 50,
              funcType: 'damageNp',
              funcTargetType: 'enemyAll',
              ...Object.fromEntries(
                ['svals', 'svals2', 'svals3', 'svals4', 'svals5'].map((k) => [
                  k,
                  Array.from({ length: 5 }, () => ({ Rate: 1000, Value: 3000 })),
                ]),
              ),
            },
          ],
        },
      ],
    };
  }),
  equips: [],
  mysticCodes: [],
  items: [],
});
const fixtureMaster = masterSnapshotSchema.parse(JSON.parse(JSON.stringify(generatedMaster)));
const master = masterSnapshotSchema.parse({
  ...fixtureMaster,
  servants: fixtureMaster.servants.map((s, i) => ({
    ...s,
    skills: s.skills.map((skill) => ({
      ...skill,
      effects: skill.effects.map((e) => ({
        ...e,
        ...(specs[i]!.disabled && e.execution.some(isReceiveSelf)
          ? {
              requirement: {
                ...e.requirement,
                expression: {
                  kind: 'quantity' as const,
                  quantity: 'attackerHpPermille' as const,
                  comparison: 'atLeast' as const,
                  value: 900,
                },
              },
            }
          : {}),
        execution: e.execution.map((o) => {
          if (!isReceiveSelf(o) || !specs[i]!.omitted) return o;
          const copy = { ...o, useCondition: { kind: 'always' as const } };
          delete copy.selection;
          return copy;
        }),
      })),
    })),
  })),
});
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
function scenarioFor(m: MasterDataSnapshot, servantId: string, s: Spec, slot: 1 | 2 | 3 = 2) {
  const defaults = createDefaultResolvedScenario(m, undefined),
    servant = m.servants.find((x) => x.id === servantId)!;
  return {
    ...defaults,
    attacker: {
      ...defaults.attacker,
      servantId,
      level: 90,
      initialActorFormId: s.form ?? servant.actorFormGraph.defaultInitialFormId,
    },
    targetContext: createDefaultTargetContext(servant.classId),
    attackerHpPermille: s.initial ?? 333,
    explicitOverrides: {},
    canonicalInputValues: {},
    preNoblePhantasmPlan: [
      ...(slot === 2
        ? [{ kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 4, choice: null }]
        : []),
      {
        kind: 'useSkillSlot' as const,
        slot,
        skillLevel: 4,
        choice: s.choice ? { groupKey: 'player-choice:1', candidateKey: '2' } : null,
        ...(s.reset
          ? {
              canonicalInputValues: {
                [`oc:proc:${JSON.stringify(['attacker', `attacker:${servantId}`, String(Number(servantId) + 2), `${Number(servantId) + 35}:0`, null, 0])}`]:
                  { kind: 'integer' as const, value: 0, origin: 'witness' as const },
              },
            }
          : {}),
      },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
}
function execute(
  scenario: ReturnType<typeof scenarioFor>,
  m: MasterDataSnapshot,
  capture: boolean,
  ranking = false,
) {
  const prepared = prepareCalculationScenarioWithPolicy(
      scenario,
      m,
      ranking
        ? {
            kind: 'ranking',
            selfBuffs: 'included',
            conditionalEffects: 'satisfied',
            areaView: 'included',
          }
        : { kind: 'calculator' },
      {},
      capture,
    ),
    context = { ...versions, masterDataVersion: m.version };
  return {
    prepared,
    calculation: evaluatePreparedCalculationScenario(prepared, context),
    direct: evaluatePreparedCalculationResult(prepared, context),
  };
}
function entry(
  s: Spec,
  index: number,
  m = master,
  servantId = m.servants[index]!.id,
  slot: 1 | 2 | 3 = 2,
) {
  const scenario = scenarioFor(m, servantId, s, slot),
    run = execute(scenario, m, true),
    selection = receiveSelection(run.prepared, run.calculation, index);
  if (!selection) throw new Error(`receive_attempt_selection_missing:${s.key}`);
  const expectation: ReceiveAttemptExpectation = s.boundary
    ? { kind: 'boundary', boundary: s.boundary, actionIndex: slot === 2 ? 1 : 0 }
    : { kind: 'changedNoncommit', actionIndex: slot === 2 ? 1 : 0 };
  const program = receiveAttemptProgram(selection, expectation, run.direct),
    source = receiveSource(selection, run.direct),
    request = { prepared: run.prepared, calculation: run.calculation };
  const input = { requests: [request], expected: [program], observations: [source] };
  return {
    spec: s,
    scenario,
    run,
    source,
    program,
    request,
    input,
    gate: auditReceiveAttemptIsolation(input),
  };
}
async function save(task: { meta: unknown }, path: string, payload: unknown) {
  const receipt = await writeProductionAuditArtifact(
      task.meta,
      path,
      encodeProductionAuditDiagnostic(payload),
    ),
    bytes = await readFile(resolve(process.env['FGO_TEST_ARTIFACT_DIR']!, path));
  expect(bytes.length).toBe(receipt.expectedBytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.expectedSha256);
  expect(
    isDeepStrictEqual(
      decodeProductionAuditDiagnostic(
        decodeProductionAuditArtifact(bytes) as ReturnType<typeof encodeProductionAuditDiagnostic>,
      ),
      payload,
    ),
  ).toBe(true);
}
describe('receive changed-attempt native noncommit isolation', () => {
  it(
    'connects original changed gains, later native refusal, retained prefix and the same selected facades',
    { timeout: 60000, ...productionAuditTestOptions(['tsk-08-receive-attempt-changed.json']) },
    async ({ task }) => {
      const cases = specs.flatMap((s, i) => (s.boundary ? [] : [entry(s, i)])),
        parity = cases.map((c) => ({
          normal: execute(c.scenario, master, false),
          ranking: execute(c.scenario, master, true, true),
        }));
      await save(task, 'tsk-08-receive-attempt-changed.json', {
        cases: cases.map((c) => ({
          key: c.spec.key,
          gate: c.gate,
          proof: receiveAttemptDiagnostic(c.source),
        })),
        parity: parity.map((x) => ({
          normal: x.normal.calculation,
          ranking: x.ranking.calculation,
        })),
      });
      for (const [i, c] of cases.entries()) {
        expect(c.gate.status, JSON.stringify(c.gate.firstDifference)).toBe('passed');
        expect(c.gate.isolated).toBe(1);
        expect(c.gate.changed).toBeGreaterThan(0);
        expect(c.run.prepared.status).toBe('rejected');
        expect(c.source.transitions![1]!.result.status).toBe('rejected');
        expect(c.source.transitions![1]!.result.state).toBe(c.source.transitions![0]!.result.state);
        expect(parity[i]!.normal.calculation.result).toEqual(c.run.calculation.result);
        expect(parity[i]!.ranking.calculation.result).toEqual(c.run.calculation.result);
        expect(
          c.source.canonical.consumers.every(
            (x) => !c.source.canonical.writers.some((w) => w.effect === x.effect),
          ),
        ).toBe(true);
      }
    },
  );
  it(
    'keeps actual-zero, unreached, nonapplication, pre-native and committed boundaries',
    { timeout: 60000, ...productionAuditTestOptions(['tsk-08-receive-attempt-boundaries.json']) },
    async ({ task }) => {
      const cases = specs.flatMap((s, i) => (s.boundary ? [entry(s, i)] : []));
      const parity = cases.map((c) => ({
        normal: execute(c.scenario, master, false),
        ranking: execute(c.scenario, master, true, true),
      }));
      await save(task, 'tsk-08-receive-attempt-boundaries.json', {
        parity: parity.map((p) => ({
          normal: p.normal.calculation.result,
          ranking: p.ranking.calculation.result,
        })),
        cases: cases.map((c) => ({
          key: c.spec.key,
          gate: c.gate,
          proof: receiveAttemptDiagnostic(c.source),
        })),
      });
      for (const [i, c] of cases.entries()) {
        expect(
          c.gate.status,
          JSON.stringify({ key: c.spec.key, diff: c.gate.firstDifference }),
        ).toBe('passed');
        expect(c.gate.isolated).toBe(0);
        expect(c.gate.boundaries[0]?.reason).toBe(c.spec.boundary);
        expect(parity[i]!.normal.calculation.result).toEqual(c.run.calculation.result);
        expect(parity[i]!.ranking.calculation.result).toEqual(c.run.calculation.result);
      }
    },
  );
});

it(
  'joins strict published declarations to a separately identified schema-legal noncommit derivative',
  { timeout: 60000, ...productionAuditTestOptions(['tsk-08-receive-attempt-published.json']) },
  async ({ task }) => {
    const bytes = await readFile(resolve('apps/web/public/master/master.json')),
      published = masterSnapshotSchema.parse(JSON.parse(bytes.toString('utf8'))),
      inventory = receiveInventory(published);
    const candidates = inventory.filter((d) => {
      const skill = published.servants
          .find((s) => s.id === d.sourceId)!
          .skills.find((s) => s.id === d.skillId)!,
        index = skill.effects.findIndex((e) => e.occurrenceId === d.occurrenceId);
      return skill.effects
        .slice(index + 1)
        .some((e) =>
          e.execution.some(
            (o) =>
              o.kind === 'resourceMutation' &&
              o.resource === 'hp' &&
              o.direction === 'gain' &&
              o.amount.kind === 'fixed' &&
              o.unit === 'fixed' &&
              o.recipient === 'sourceSelf',
          ),
        );
    });
    const trigger = master.servants[0]!.skills[1]!.effects.find((e) =>
      e.execution.some((o) => o.kind === 'unsupported'),
    )!;
    const derivative = masterSnapshotSchema.parse({
      ...published,
      version: `${published.version}:receive-attempt-fixture`,
      servants: published.servants.map((s) => ({
        ...s,
        skills: s.skills.map((skill) =>
          candidates.some((d) => d.sourceId === s.id && d.skillId === skill.id)
            ? {
                ...skill,
                effects: [
                  ...skill.effects,
                  { ...trigger, occurrenceId: 'receive-attempt-native-refusal:0' },
                ],
              }
            : skill,
        ),
      })),
    });
    const cases = candidates.map((d, i) => {
      const slot = published.servants
        .find((s) => s.id === d.sourceId)!
        .skills.find((s) => s.id === d.skillId)!.slot;
      const rejected = entry(
          { key: `derived:${i}`, form: d.form },
          i,
          derivative,
          d.sourceId,
          slot,
        ),
        normal = execute(rejected.scenario, derivative, false),
        ranking = execute(rejected.scenario, derivative, true, true);
      const control = entry(
        { key: `published-control:${i}`, form: d.form, boundary: 'nativeCommitted' },
        i,
        published,
        d.sourceId,
        slot,
      );
      return { declaration: d, rejected, normal, ranking, control };
    });
    await save(task, 'tsk-08-receive-attempt-published.json', {
      master: {
        version: published.version,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      inventory,
      candidates,
      derivative: {
        version: derivative.version,
        sha256: createHash('sha256').update(JSON.stringify(derivative)).digest('hex'),
        qualification:
          'Schema-legal derivative with pipeline-generated later unsupported operation; not a published native rejection.',
      },
      cases: cases.map((c) => ({
        declaration: c.declaration,
        gate: c.rejected.gate,
        proof: receiveAttemptDiagnostic(c.rejected.source),
        normalResult: c.normal.calculation.result,
        rankingResult: c.ranking.calculation.result,
        control: { gate: c.control.gate, proof: receiveAttemptDiagnostic(c.control.source) },
      })),
    });
    expect(inventory.length).toBeGreaterThan(0);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.rejected.gate.status, JSON.stringify(c.rejected.gate.firstDifference)).toBe(
        'passed',
      );
      expect(c.rejected.gate.isolated).toBe(1);
      expect(c.rejected.gate.changed).toBeGreaterThan(0);
      expect(c.control.gate.status, JSON.stringify(c.control.gate.firstDifference)).toBe('passed');
      expect(c.normal.calculation.result).toEqual(c.rejected.run.calculation.result);
      expect(c.ranking.calculation.result).toEqual(c.rejected.run.calculation.result);
      expect(c.rejected.source.canonical.writers.every((w) => isReceiveSelf(w.operation))).toBe(
        true,
      );
    }
  },
);

function set(object: object, key: string, v: unknown) {
  const original = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, {
    value: v,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return () => {
    if (original) Object.defineProperty(object, key, original);
    else Reflect.deleteProperty(object, key);
  };
}
type Mutation = {
  name: string;
  reason: ReceiveAttemptReason;
  path: string;
  mutate: () => () => void;
};
function mutations(
  item: ReturnType<typeof entry>,
  inputRequired: ReturnType<typeof entry>,
): Mutation[] {
  const s = item.source,
    t = s.transitions![1]!,
    n = t.hpActions![0]!,
    w = n.receiveWrites![0]!,
    read = n.receiveConsumptions![0]!,
    h = read.consumption,
    gain = n.writes[0]!,
    r = gain.receipts[0]!,
    attempt = t.attempts![0]!,
    writer = s.canonical.writers[0]!,
    consumer = s.canonical.consumers[0]!,
    rejectedStep = attempt.reached.find((x) => x.step.kind === 'reject')!,
    rejectOrigin = attempt.stepOrigins.find((x) => x.index === rejectedStep.index)!;
  const result: Mutation[] = [];
  const add = (
    name: string,
    obj: object,
    key: string,
    v: unknown,
    reason: ReceiveAttemptReason,
    path: string,
  ) => result.push({ name, reason, path, mutate: () => set(obj, key, v) });
  const canonical: ReceiveAttemptReason = 'receiveAttemptCanonicalMismatch',
    append: ReceiveAttemptReason = 'receiveAttemptAppendMismatch',
    consumption: ReceiveAttemptReason = 'receiveAttemptConsumptionMismatch',
    native: ReceiveAttemptReason = 'receiveAttemptNativeMismatch',
    retained: ReceiveAttemptReason = 'receiveAttemptRetainedMismatch',
    transport: ReceiveAttemptReason = 'receiveAttemptTransportMismatch',
    identity: ReceiveAttemptReason = 'receiveAttemptIdentityMismatch';
  for (const [key, v] of Object.entries({
    actor: 'foreign',
    sourceId: 'foreign',
    sourceInstanceId: 'foreign',
    skillId: 'foreign',
    operationIndex: 8,
    valueIndex: 0,
    valueSetIndex: 1,
  }))
    add(`canonical ${key}`, writer, key, v, canonical, 'canonical.selection');
  add('wrong master', s.master, 'version', 'foreign', canonical, 'proof.canonical');
  add(
    'wrong master traits',
    s.master.servants[1]!,
    'traits',
    ['foreign'],
    canonical,
    'proof.canonical',
  );
  add(
    'wrong form',
    s.canonical,
    'form',
    { actorId: 'foreign', limitCount: 0 },
    canonical,
    'canonical.selection',
  );
  add(
    'wrong choice',
    s.canonical.actions[1]!.command,
    'choice',
    { groupKey: 'player-choice:1', candidateKey: '1' },
    canonical,
    'canonical',
  );
  add(
    'wrong command cell',
    s.canonical.actions[1]!.command,
    'skillLevel',
    1,
    canonical,
    'canonical',
  );
  add('wrong occurrence', w.source.effect, 'occurrenceId', 'foreign:0', canonical, 'canonical');
  for (const [key, v] of Object.entries({
    action: 'give',
    sign: -1,
    lifetime: 'source',
    selection: 'allEnemies',
    useCondition: { kind: 'trait', scope: 'recipient', trait: 'foreign', present: true },
  }))
    add(`wrong operation ${key}`, w.operation, key, v, canonical, 'canonical');
  add('wrong route', w.operation.route, 'target', 'allEnemies', canonical, 'canonical');
  add(
    'wrong eligibility',
    w.operation.route,
    'eligibility',
    {
      kind: 'requiredRecipient',
      recipient: 'foreign',
      onMissing: 'ignore',
      onMismatch: 'unsupported',
    },
    canonical,
    'canonical',
  );
  add(
    'wrong route traits',
    w.operation.route,
    'requiredTraits',
    ['foreign'],
    canonical,
    'canonical',
  );
  add('missing route', w.operation, 'route', undefined, canonical, 'canonical');
  add(
    'wrong bounds',
    w.operation,
    'bounds',
    { minimum: 1, maximum: 49999 },
    canonical,
    'canonical',
  );
  add('wrong value', w.operation.values[0], '3', 735, canonical, 'canonical');
  add('wrong actor source', w.source, 'sourceInstanceId', 'foreign', append, 'proof.append');
  add(
    'wrong source occurrence reference',
    w,
    'source',
    { ...w.source, effect: { ...w.source.effect } },
    identity,
    'reference',
  );
  add('wrong operation reference', w, 'operation', { ...w.operation }, identity, 'reference');
  add('wrong instance actor', w.modifiers[0]!, 'actor', 'foreign', append, 'proof.append');
  add('wrong instance value', w.modifiers[0]!, 'value', 999, append, 'proof.append');
  add('missing append', n, 'receiveWrites', [], append, 'proof.append');
  add('duplicate append', n, 'receiveWrites', [...n.receiveWrites!, w], append, 'proof.append');
  add(
    'reversed append',
    n,
    'receiveWrites',
    [...n.receiveWrites!].reverse(),
    append,
    'proof.append',
  );
  add('missing modifier', w, 'modifiers', [], append, 'proof.append');
  add('missing append receipt', w, 'receipts', [], append, 'proof.append');
  add(
    'wrong consumer occurrence',
    consumer,
    'effect',
    w.source.effect,
    canonical,
    'canonical.selection',
  );
  add('wrong gain operation index', read, 'operationIndex', 8, consumption, 'proof.consumption');
  add('wrong consumer route', consumer.operation, 'recipient', 'enemyAll', canonical, 'canonical');
  add('wrong gain cell', read, 'valueIndex', 0, consumption, 'proof.consumption');
  add('wrong gain actor', h, 'actor', 'foreign', consumption, 'proof.consumption');
  add('wrong receive resolution', h.receive, 'value', 1, consumption, 'proof.consumption');
  add('wrong mutation receive', h.mutation, 'receive', 1, consumption, 'proof.consumption');
  add('wrong gain instance', h.receive, 'instances', [], consumption, 'proof.consumption');
  add('missing consumer', n, 'receiveConsumptions', [], consumption, 'proof.consumption');
  add(
    'reversed consumer order',
    n,
    'receiveConsumptions',
    [...n.receiveConsumptions!].reverse(),
    consumption,
    'proof.consumption',
  );
  add(
    'reversed gain order',
    n,
    'writes',
    [...n.writes].reverse(),
    consumption,
    'proof.consumption',
  );
  add(
    'duplicate consumer',
    n,
    'receiveConsumptions',
    [read, read],
    consumption,
    'proof.consumption',
  );
  add('forged consumer clone', read, 'consumption', { ...h }, identity, 'reference');
  add('stale HP', h, 'before', n.start.hp!.actors.attacker, identity, 'reference');
  add('intermediate HP', h, 'before', r.after, consumption, 'proof.consumption');
  add('other execution actor reference', h, 'before', { ...h.before }, identity, 'reference');
  add('forged receipt', gain, 'receipts', [{ ...r }], identity, 'reference');
  add('missing gain receipt', gain, 'receipts', [], consumption, 'proof.consumption');
  add('duplicate gain receipt', gain, 'receipts', [r, r], consumption, 'proof.consumption');
  add('actual zero edit', r, 'actual', 0, consumption, 'proof.consumption');
  add('wrong receipt occurrence', r, 'occurrenceId', 'foreign', consumption, 'proof.consumption');
  add('wrong receipt actor', r, 'actor', 'foreign', consumption, 'proof.consumption');
  add('wrong native status', n.native!, 'status', 'committed', native, 'proof.native');
  add('wrong native reason', n.native!, 'reason', 'foreign', native, 'proof.native');
  add('missing native', n, 'native', undefined, native, 'proof.native');
  add('wrong rejection step', rejectedStep, 'index', -1, native, 'proof.native');
  add(
    'missing reject step',
    attempt,
    'reached',
    attempt.reached.slice(0, -1),
    native,
    'proof.native',
  );
  add(
    'reversed reached order',
    attempt,
    'reached',
    [...attempt.reached].reverse(),
    native,
    'proof.native',
  );
  add('wrong reject operation', rejectOrigin, 'operationIndex', 42, native, 'proof.native');
  add('wrong reject occurrence', rejectOrigin, 'source', { ...w.source }, native, 'proof.native');
  add('attempt leak returned', n, 'returned', n.attempted, retained, 'proof.retained');
  add('attempt leak reducer', t.result, 'state', n.attempted, retained, 'proof.retained');
  add('prefix lost', t.result.state, 'appliedActions', [], retained, 'proof.retained');
  add('prefix HP replaced', t.result.state, 'hp', n.attempted!.hp, retained, 'proof.retained');
  add(
    'wrong actor traits',
    n.start,
    'stateTraits',
    { attackerState: new Set(['foreign']), targetState: new Set() },
    retained,
    'proof.retained',
  );
  add('missing source end', n, 'sourceEnds', [], retained, 'proof.retained');
  add('wrong action identity', n, 'actionId', 'foreign', retained, 'proof.retained');
  add('forged source reset', n.sourceEnds[0]!, 'sourceStart', n.attempted, native, 'proof.native');
  add(
    'wrong reducer code',
    t.result,
    'code',
    'foreign',
    'receiveAttemptReducerMismatch',
    'proof.reducer',
  );
  add(
    'wrong refused operation',
    s.transport!.rejection!.rejection,
    'operationId',
    'foreign',
    transport,
    'proof.selected',
  );
  add('wrong facade result', s.directResult, 'status', 'calculated', transport, 'proof.selected');
  add('foreign direct wrapper', s, 'directResult', { ...s.directResult }, identity, 'reference');
  add(
    'fake ordered execution',
    s.transport!,
    'orderedExecution',
    {},
    'receiveAttemptDownstreamGenerated',
    'proof.downstream',
  );
  add(
    'fake damage input',
    s.transport!,
    'damageInputGenerated',
    {},
    'receiveAttemptDownstreamGenerated',
    'proof.downstream',
  );
  add(
    'fake HP reader',
    s,
    'candidate',
    { seed: { hp: n.attempted!.hp }, reads: [{ operationId: 'foreign' }], nps: [] },
    retained,
    'proof.retained',
  );
  add(
    'fake NP execution',
    s,
    'candidate',
    { seed: { hp: n.attempted!.hp }, reads: [], nps: [{ operationId: 'foreign', input: {} }] },
    'receiveAttemptDownstreamGenerated',
    'proof.downstream',
  );
  add(
    'fake application input',
    s,
    'input',
    {},
    'receiveAttemptDownstreamGenerated',
    'proof.downstream',
  );
  add(
    'fake selected observation',
    s,
    'observation',
    {},
    'receiveAttemptDownstreamGenerated',
    'proof.downstream',
  );
  const ir = inputRequired.source,
    inn = ir.transitions![1]!.hpActions![0]!,
    irt = ir.transitions![1]!;
  // These mutations are audited against their own original request/execution below.
  for (const [name, obj, key, v] of [
    [
      'wrong required input',
      inn.rejectionInput!,
      'requiredInput',
      { ...inn.rejectionInput!.requiredInput, key: 'foreign' },
    ],
    ['wrong input occurrence', inn.rejectionInput!, 'occurrenceId', 'foreign'],
    ['wrong reducer required input', irt.result, 'requiredInput', null],
    ['wrong reducer input occurrence', irt.result, 'requiredInputEffectOccurrenceId', 'foreign'],
  ] as const)
    result.push({
      name,
      reason: name.includes('reducer') ? 'receiveAttemptReducerMismatch' : native,
      path: name.includes('reducer') ? 'proof.reducer' : 'proof.native',
      mutate: () => set(obj, key, v),
    });
  result.push({
    name: 'coherent HP modifier receipt edit',
    reason: consumption,
    path: 'proof.consumption',
    mutate: () => {
      const undo = [
        set(r, 'actual', 1),
        set(r.after, 'current', 1),
        set(h.result, 'actual', 1),
        set(w.modifiers[0]!, 'value', 1),
        set(h.mutation, 'receive', 1),
        set(h.receive, 'value', 1),
      ];
      return () => undo.reverse().forEach((f) => f());
    },
  });
  return result;
}
describe('receive attempt negative responsibilities', () => {
  const multiple = entry(specs[1]!, 1),
    ir = entry(specs[4]!, 4),
    allMutations = mutations(multiple, ir);
  for (let batch = 0; batch < Math.ceil(allMutations.length / 10); batch++)
    it(
      `rejects responsibility mutations batch ${batch}`,
      {
        timeout: 60000,
        ...productionAuditTestOptions([`tsk-08-receive-attempt-negatives-${batch}.json`]),
      },
      async ({ task }) => {
        const list = allMutations.slice(batch * 10, (batch + 1) * 10),
          reports = [];
        for (const m of list) {
          const undo = m.mutate();
          try {
            const target =
              m.name.includes('required input') || m.name.includes('input occurrence')
                ? ir
                : multiple;
            reports.push({
              name: m.name,
              reason: m.reason,
              path: m.path,
              gate: auditReceiveAttemptIsolation(target.input),
            });
          } finally {
            undo();
          }
        }
        await save(task, `tsk-08-receive-attempt-negatives-${batch}.json`, { reports });
        for (const r of reports) {
          expect(r.gate.status, r.name).toBe('failed');
          expect(
            r.gate.failures.some((f) => f.reason === r.reason && f.checkPath.startsWith(r.path)),
            r.name,
          ).toBe(true);
          for (const f of r.gate.failures) {
            const diff = firstCanonicalAuditDifference(
              [{ identity: f.identity, value: f.expected }],
              [{ identity: f.identity, value: f.actual }],
            )!;
            expect({
              ...diff,
              path: diff.path ? `${f.checkPath}.${diff.path}` : f.checkPath,
            }).toEqual(f.firstDifference);
          }
        }
        expect(reports.length).toBeGreaterThan(0);
      },
    );
  it(
    'rejects population success filters and actual-zero changed classification',
    { timeout: 60000, ...productionAuditTestOptions(['tsk-08-receive-attempt-population.json']) },
    async ({ task }) => {
      const zero = entry(specs[6]!, 6),
        good = entry(specs[0]!, 0),
        badProgram = receiveAttemptProgram(
          zero.program.selection,
          { kind: 'changedNoncommit', actionIndex: 1 },
          zero.run.direct,
        );
      const cases = [
        {
          name: 'actual zero counted changed',
          reason: 'receiveAttemptBoundaryMismatch',
          gate: auditReceiveAttemptIsolation({ ...zero.input, expected: [badProgram] }),
        },
        {
          name: 'success-filter exclusion',
          reason: 'receiveAttemptPopulationMismatch',
          gate: auditReceiveAttemptIsolation({
            requests: [zero.request, good.request],
            expected: [good.program],
            observations: [good.source],
          }),
        },
        {
          name: 'missing observation',
          reason: 'receiveAttemptPopulationMismatch',
          gate: auditReceiveAttemptIsolation({ ...good.input, observations: [] }),
        },
        {
          name: 'duplicate observation',
          reason: 'receiveAttemptPopulationMismatch',
          gate: auditReceiveAttemptIsolation({
            ...good.input,
            observations: [good.source, good.source],
          }),
        },
        {
          name: 'duplicate expectation',
          reason: 'receiveAttemptPopulationMismatch',
          gate: auditReceiveAttemptIsolation({
            ...good.input,
            expected: [good.program, good.program],
          }),
        },
        {
          name: 'foreign request',
          reason: 'receiveAttemptMissing',
          gate: auditReceiveAttemptIsolation({ ...good.input, requests: [zero.request] }),
        },
        {
          name: 'different execution',
          reason: 'receiveAttemptIdentityMismatch',
          gate: auditReceiveAttemptIsolation({
            ...good.input,
            observations: [{ ...good.source, selection: zero.program.selection }],
          }),
        },
      ];
      await save(task, 'tsk-08-receive-attempt-population.json', { cases });
      for (const c of cases) {
        expect(c.gate.status, c.name).toBe('failed');
        expect(
          c.gate.failures.some((f) => f.reason === c.reason),
          c.name,
        ).toBe(true);
        for (const f of c.gate.failures) {
          const diff = firstCanonicalAuditDifference(
            [{ identity: f.identity, value: f.expected }],
            [{ identity: f.identity, value: f.actual }],
          )!;
          expect({
            ...diff,
            path: diff.path ? `${f.checkPath}.${diff.path}` : f.checkPath,
          }).toEqual(f.firstDifference);
        }
      }
    },
  );
});
