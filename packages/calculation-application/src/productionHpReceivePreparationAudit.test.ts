import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { normalizeAtlasSnapshot } from '@fgo-lab/data-pipeline';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { createDefaultTargetContext } from './targetContext';
import * as hpOwner from '../../battle-execution/src/preparationHp';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import {
  isReceiveSelf,
  receiveSelection,
  receiveSource,
  receiveProgram,
  receiveDiagnostic,
  receiveInventory,
  auditReceive,
  type ReceiveReason,
} from './productionHpReceivePreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';

type Spec = {
  key: string;
  values: number[];
  gain?: number;
  initial?: number;
  multiple?: boolean;
  choice?: boolean;
  omitted?: boolean;
  always?: boolean;
  disabled?: boolean;
  prefix?: boolean;
  earlyGain?: boolean;
};
const specs: Spec[] = [
  { key: 'changed', values: [200, 230, 260, 290, 320, 350, 380, 410, 440, 500], gain: 1234 },
  { key: 'same-occurrence-multiple', values: [200], gain: 777, multiple: true },
  { key: 'selected-choice', values: [731], gain: 1001, choice: true },
  { key: 'prior-committed-prefix', values: [400], gain: 700, prefix: true },
  { key: 'omitted-selection-always', values: [500], gain: 1234, omitted: true, always: true },
  { key: 'receive-upper-bound', values: [49000], gain: 101 },
  { key: 'receive-above-bound', values: [60000], gain: 101 },
  { key: 'zero-receive', values: [0], gain: 1000 },
  { key: 'negative-cell-lower-bound', values: [-1200], gain: 1000 },
  { key: 'gain-zero', values: [500], gain: 0 },
  { key: 'capacity-zero', values: [500], gain: 1000, initial: 1000 },
  { key: 'consumer-absent', values: [500] },
  { key: 'writer-not-applied', values: [500], gain: 1000, disabled: true },
  { key: 'gain-before-receive-boundary', values: [500], gain: 1000, earlyGain: true },
];
const rows = (values: number[]) =>
  Array.from({ length: 10 }, (_, i) => ({
    Rate: 1000,
    Turn: 3,
    Count: -1,
    Value: values.length === 1 ? values[0] : values[i],
  }));
const receiveFunction = (id: number, spec: Spec, choice?: number) => ({
  funcId: id,
  funcType: 'addState',
  funcTargetType: 'self',
  buffs: Array.from({ length: spec.multiple ? 2 : 1 }, () => ({
    type: 'upGainHp',
    maxRate: 50000,
    vals: [{ id: 3004 }],
  })),
  svals: rows(spec.values).map((row) => ({
    ...row,
    ...(choice === undefined ? {} : { ActSelectIndex: choice }),
  })),
});
const healFunction = (id: number, gain: number) => ({
  funcId: id,
  funcType: 'gainHp',
  funcTargetType: 'self',
  svals: rows([gain]).map(({ Rate, Value }) => ({ Rate, Value })),
});
const fixtureMaster = normalizeAtlasSnapshot({
  version: 'tsk08-receive-fixtures',
  servants: specs.map((spec, index) => ({
    id: 800100 + index,
    collectionNo: index + 1,
    type: 'normal',
    name: spec.key,
    className: 'saber',
    attribute: 'earth',
    rarity: 4,
    hpGrowth: Array.from({ length: 100 }, (_, i) => (i === 89 ? 9010 : i + 1)),
    atkGrowth: Array.from({ length: 100 }, (_, i) => i + 1),
    traits: [],
    skills: [
      ...(spec.prefix
        ? [
            {
              id: 810100 + index * 2,
              num: 1,
              priority: 1,
              name: 'prefix',
              detail: '',
              functions: [
                {
                  funcId: 840100 + index,
                  funcType: 'addState',
                  funcTargetType: 'self',
                  buffs: [{ type: 'upAtk' }],
                  svals: rows([100]),
                },
              ],
            },
          ]
        : []),
      {
        id: 810101 + index * 2,
        num: spec.prefix ? 2 : 1,
        priority: 1,
        name: 'receive',
        detail: '',
        functions: [
          ...(spec.earlyGain ? [healFunction(830100 + index, spec.gain!)] : []),
          ...(spec.choice ? [receiveFunction(850100 + index, spec, 1)] : []),
          receiveFunction(820100 + index, spec, spec.choice ? 2 : undefined),
          ...(spec.gain === undefined || spec.earlyGain
            ? []
            : [healFunction(830100 + index, spec.gain)]),
        ],
      },
    ],
    classPassive: [],
    noblePhantasms: [
      {
        id: 860100 + index,
        name: 'NP',
        priority: 1,
        card: 'buster',
        functions: [
          {
            funcId: 870100 + index,
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
  })),
  equips: [],
  mysticCodes: [],
  items: [],
});
// Omission/always and normal nonapplication are schema-legal canonical variants of generated effects.
const publishedFixture = masterSnapshotSchema.parse(JSON.parse(JSON.stringify(fixtureMaster)));
const legalFixture = masterSnapshotSchema.parse({
  ...publishedFixture,
  servants: publishedFixture.servants.map((servant, index) => {
    const spec = specs[index]!;
    return {
      ...servant,
      skills: servant.skills.map((skill) => ({
        ...skill,
        effects: skill.effects.map((effect) => ({
          ...effect,
          ...(spec.disabled && effect.execution.some(isReceiveSelf)
            ? {
                requirement: {
                  recipient: 'sourceSelf',
                  expression: {
                    kind: 'quantity',
                    quantity: 'attackerHpPermille',
                    comparison: 'atMost',
                    value: 0,
                  },
                },
              }
            : {}),
          execution: effect.execution.map((operation) => {
            if (!isReceiveSelf(operation)) return operation;
            const rest = { ...operation };
            if (spec.omitted) delete rest.selection;
            return {
              ...(spec.omitted ? rest : operation),
              ...(spec.always ? { useCondition: { kind: 'always' } } : {}),
            };
          }),
        })),
      })),
    };
  }),
});
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
function scenarioFor(
  master: MasterDataSnapshot,
  servantId: string,
  spec: Spec,
  slot: 1 | 2 | 3 = 1,
) {
  const defaults = createDefaultResolvedScenario(master, undefined),
    servant = master.servants.find((s) => s.id === servantId)!;
  return {
    ...defaults,
    attacker: {
      ...defaults.attacker,
      servantId,
      level: 90,
      initialActorFormId: servant.actorFormGraph.defaultInitialFormId,
    },
    targetContext: createDefaultTargetContext(servant.classId),
    attackerHpPermille: spec.initial ?? 333,
    explicitOverrides: {},
    canonicalInputValues: {},
    preNoblePhantasmPlan: [
      ...(spec.prefix
        ? [{ kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 4, choice: null }]
        : []),
      {
        kind: 'useSkillSlot' as const,
        slot,
        skillLevel: 4,
        choice: spec.choice ? { groupKey: 'player-choice:1', candidateKey: '2' } : null,
      },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
}
function execute(
  scenario: ReturnType<typeof scenarioFor>,
  master: MasterDataSnapshot,
  capture: boolean,
  ranking = false,
) {
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
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
  );
  const context = { ...versions, masterDataVersion: master.version };
  const calculation = evaluatePreparedCalculationScenario(prepared, context);
  return {
    prepared,
    calculation,
    directResult: evaluatePreparedCalculationResult(prepared, context),
  };
}
function entry(
  master: MasterDataSnapshot,
  servantId: string,
  spec: Spec,
  index: number,
  slot: 1 | 2 | 3 = 1,
) {
  const scenario = scenarioFor(master, servantId, spec, slot),
    run = execute(scenario, master, true);
  const selection = receiveSelection(run.prepared, run.calculation, index);
  if (!selection) throw new Error(`receive_fixture_selection_missing:${spec.key}`);
  const program = receiveProgram(selection, run.directResult),
    source = receiveSource(selection, run.directResult);
  const request = { prepared: run.prepared, calculation: run.calculation };
  return {
    spec,
    scenario,
    master,
    request,
    program,
    source,
    gate: auditReceive({ requests: [request], expected: [program], observations: [source] }),
  };
}
async function save(task: { meta: unknown }, path: string, payload: unknown) {
  const receipt = await writeProductionAuditArtifact(
    task.meta,
    path,
    encodeProductionAuditDiagnostic(payload),
  );
  const bytes = await readStoredProductionAuditArtifact(path);
  expect(bytes.length).toBe(receipt.expectedBytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.expectedSha256);
  expect(
    isDeepStrictEqual(
      decodeProductionAuditDiagnostic(
        decodeStoredProductionAuditArtifact(bytes) as ReturnType<
          typeof encodeProductionAuditDiagnostic
        >,
      ),
      payload,
    ),
  ).toBe(true);
}
function set(object: object, key: string, v: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, {
    value: v,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else Reflect.deleteProperty(object, key);
  };
}

describe('TSK-08 committed receive and original later fixed HP consumer', () => {
  it(
    'connects generated changed representatives and explicit boundaries without audit-side writer replay',
    productionAuditTestOptions(['tsk-08-receive-representatives.json']),
    async ({ task }) => {
      const cases = specs.map((spec, index) =>
        entry(legalFixture, String(800100 + index), spec, index, spec.prefix ? 2 : 1),
      );
      const parity = cases.map((item) => ({
        key: item.spec.key,
        normal: execute(item.scenario, item.master, false),
        ranking: execute(item.scenario, item.master, true, true),
      }));
      // All source collection, owner transitions, and original result evaluation precede this spy.
      const spy = vi.spyOn(hpOwner, 'executeHpOperation');
      const rechecked = cases.map((item) =>
        auditReceive({
          requests: [item.request],
          expected: [item.program],
          observations: [item.source],
        }),
      );
      const calls = spy.mock.calls.length;
      spy.mockRestore();
      await save(task, 'tsk-08-receive-representatives.json', {
        cases: cases.map((item, i) => ({
          key: item.spec.key,
          gate: rechecked[i],
          proof: receiveDiagnostic(item.source),
          normalResult: parity[i]!.normal.calculation.result,
          rankingResult: parity[i]!.ranking.calculation.result,
        })),
        auditWriterCalls: calls,
      });
      expect(calls).toBe(0);
      for (const [i, item] of cases.entries()) {
        expect(
          item.gate.status,
          `${item.spec.key}:${JSON.stringify(item.gate.firstDifference)}`,
        ).toBe('passed');
        expect(rechecked[i]!.status).toBe('passed');
        expect(parity[i]!.normal.calculation.result).toEqual(item.source.calculation.result);
        expect(parity[i]!.ranking.calculation.result).toEqual(item.source.calculation.result);
        expect(parity[i]!.normal.prepared.orderedScenario?.hp).toEqual(item.source.ordered?.hp);
        expect(
          item.source.canonical.consumers.every(
            (c) => !item.source.canonical.writers.some((w) => w.effect === c.effect),
          ),
        ).toBe(true);
        expect(item.source.candidate?.reads).toEqual([]);
        expect(item.source.candidate?.nps).toEqual([]);
      }
      const positive = cases.filter(
        (c) =>
          ![
            'negative-cell-lower-bound',
            'gain-zero',
            'capacity-zero',
            'consumer-absent',
            'writer-not-applied',
            'gain-before-receive-boundary',
          ].includes(c.spec.key),
      );
      for (const item of positive) {
        expect(item.gate.changed, item.spec.key).toBeGreaterThan(0);
        expect(item.gate.connected).toBe(1);
        expect(item.source.calculation.result.status).toBe('calculated');
      }
      for (const key of ['receive-upper-bound', 'receive-above-bound'])
        expect(
          cases.find((c) => c.spec.key === key)!.source.transitions![0]!.hpActions![0]!
            .receiveConsumptions![0]!.consumption.receive.value,
        ).toBe(50000);
      expect(
        cases.find((c) => c.spec.key === 'negative-cell-lower-bound')!.source.transitions![0]!
          .hpActions![0]!.receiveConsumptions![0]!.consumption.receive.value,
      ).toBe(0);
      expect(cases.find((c) => c.spec.key === 'gain-zero')!.gate.boundaries).toContainEqual(
        expect.objectContaining({ reason: 'consumerActualZero' }),
      );
      expect(cases.find((c) => c.spec.key === 'capacity-zero')!.gate.changed).toBe(0);
      expect(cases.find((c) => c.spec.key === 'consumer-absent')!.gate.boundaries).toContainEqual(
        expect.objectContaining({ reason: 'noLaterFixedGain' }),
      );
      expect(cases.find((c) => c.spec.key === 'writer-not-applied')!.gate.appended).toBe(0);
      expect(
        cases.find((c) => c.spec.key === 'gain-before-receive-boundary')!.gate.boundaries,
      ).toContainEqual(
        expect.objectContaining({ reason: 'outsideScope:otherHpWriterOutsideConsumer' }),
      );
      const changed = cases[0]!.source.transitions![0]!.hpActions![0]!;
      expect(changed.receiveWrites![0]!.modifiers[0]!.value).toBe(290);
      expect(changed.receiveConsumptions![0]!.consumption.result).toMatchObject({
        status: 'applied',
        attempted: 1591,
        actual: 1591,
      });
    },
  );

  it(
    'rejects canonical, original consumption, retained, selected and population corruption with typed first differences',
    productionAuditTestOptions(['tsk-08-receive-negatives.json']),
    async ({ task }) => {
      const item = entry(legalFixture, '800101', specs[1]!, 200),
        other = entry(legalFixture, '800100', specs[0]!, 201);
      const source = item.source,
        action = source.transitions![0]!.hpActions![0]!,
        write = action.receiveWrites![0]!,
        gain = action.writes[0]!,
        read = action.receiveConsumptions![0]!;
      const mutations: {
        key: string;
        reason: ReceiveReason;
        path: string;
        mutate: () => () => void;
      }[] = [];
      const add = (
        key: string,
        object: object,
        field: string,
        v: unknown,
        reason: ReceiveReason,
        path: string,
      ) => mutations.push({ key, reason, path, mutate: () => set(object, field, v) });
      add(
        'wrong actor',
        write.modifiers[0]!,
        'actor',
        'support:other',
        'receiveWriteMismatch',
        'receiveActions',
      );
      add(
        'wrong source',
        write.source,
        'sourceInstanceId',
        'attacker:other',
        'receiveWriteMismatch',
        'receiveActions',
      );
      add(
        'wrong occurrence',
        write.source.effect,
        'occurrenceId',
        'other:0',
        'receiveCanonicalMismatch',
        'canonical',
      );
      add('wrong operation', write, 'operationIndex', 8, 'receiveWriteMismatch', 'receiveActions');
      add('wrong cell', write, 'valueIndex', 1, 'receiveWriteMismatch', 'receiveActions');
      add('wrong value set', write, 'valueSetIndex', 1, 'receiveWriteMismatch', 'receiveActions');
      add(
        'wrong route',
        write.operation.route,
        'target',
        'partyOther',
        'receiveCanonicalMismatch',
        'canonical',
      );
      add('wrong sign', write.operation, 'sign', -1, 'receiveCanonicalMismatch', 'canonical');
      add(
        'wrong bounds',
        write.operation.bounds,
        'maximum',
        49999,
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'wrong lifetime',
        write.operation,
        'lifetime',
        'constant',
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'wrong traits',
        write.operation,
        'traits',
        ['other'],
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'wrong eligibility',
        write.operation.route,
        'eligibility',
        { kind: 'anyRecipient', onMissing: 'ignore' },
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'wrong value',
        write.operation.values[0],
        '3',
        900,
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'modifier value',
        write.modifiers[0]!,
        'value',
        900,
        'receiveRetainedMismatch',
        'transitions',
      );
      add('missing append', action, 'receiveWrites', [], 'receiveWriteMismatch', 'receiveActions');
      add(
        'duplicate append',
        action,
        'receiveWrites',
        [write, write],
        'receiveWriteMismatch',
        'receiveActions',
      );
      add(
        'reverse append',
        action,
        'receiveWrites',
        [...action.receiveWrites!].reverse(),
        'receiveWriteMismatch',
        'receiveActions',
      );
      add(
        'operation reference',
        write,
        'operation',
        structuredClone(write.operation),
        'receiveIdentityMismatch',
        'reference',
      );
      add(
        'instance reference',
        read.consumption.receive,
        'instances',
        read.consumption.receive.instances.map((m) => ({ ...m })),
        'receiveIdentityMismatch',
        'reference',
      );
      add(
        'missing consumer',
        action,
        'receiveConsumptions',
        [],
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add(
        'duplicate consumer',
        action,
        'receiveConsumptions',
        [read, read],
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add(
        'consumer occurrence',
        read.source.effect,
        'occurrenceId',
        'fabricated:0',
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'consumer operation',
        read,
        'operationIndex',
        8,
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add('consumer cell', read, 'valueIndex', 1, 'receiveConsumptionMismatch', 'receiveActions');
      add(
        'consumer resolved receive',
        read.consumption.receive,
        'value',
        0,
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add(
        'consumer transition input',
        read.consumption.mutation,
        'receive',
        1000,
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add(
        'stale consumer hp',
        read.consumption,
        'before',
        write.before.actors.attacker,
        'receiveIdentityMismatch',
        'reference',
      );
      add(
        'fabricated receipt',
        gain,
        'receipts',
        gain.receipts.map((r) => ({ ...r })),
        'receiveIdentityMismatch',
        'reference',
      );
      add('missing receipt', gain, 'receipts', [], 'receiveRetainedMismatch', 'transitions');
      add(
        'duplicate receipt',
        gain,
        'receipts',
        [...gain.receipts, ...gain.receipts],
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'actual zero forged',
        gain.receipts[0]!,
        'actual',
        0,
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'native noncommit',
        action.native!,
        'status',
        'invalid',
        'receiveCommitMismatch',
        'transitions',
      );
      add(
        'intermediate returned hp',
        action.returned!,
        'hp',
        write.after,
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'reducer prior hp',
        source.transitions![0]!.result.state,
        'hp',
        action.start.hp,
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'stale selected hp',
        source.candidate!.seed,
        'hp',
        write.after,
        'receiveRetainedMismatch',
        'candidate',
      );
      add(
        'different execution',
        source,
        'calculation',
        other.source.calculation,
        'receiveIdentityMismatch',
        'reference',
      );
      add(
        'different direct result',
        source,
        'directResult',
        other.source.directResult,
        'receiveResultMismatch',
        'directResult',
      );
      add(
        'wrong command choice',
        source.canonical.actions[0]!.command,
        'choice',
        { groupKey: 'other', candidateKey: 'other' },
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'wrong action',
        action,
        'actionId',
        'preparation:other',
        'receiveRetainedMismatch',
        'receiveActions',
      );
      add(
        'wrong form',
        source.canonical.writers[0]!,
        'form',
        { actorId: 'other', limitCount: 0 },
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'wrong use condition',
        write.operation,
        'useCondition',
        {
          kind: 'trait',
          scope: 'recipient',
          trait: 'other',
          present: true,
          provenance: {
            stateSources: 'activeOnly',
            ignoredStateTraits: 'exclude',
            unremovableStateTraits: 'include',
          },
        },
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'consumer actor',
        read.consumption,
        'actor',
        'support:other',
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add(
        'consumer route',
        read.source.effect.execution[read.operationIndex]!,
        'recipient',
        'partyAll',
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'consumer value',
        read.consumption.mutation,
        'amount',
        9,
        'receiveConsumptionMismatch',
        'receiveActions',
      );
      add(
        'reverse source order',
        action,
        'sources',
        [...action.sources].reverse(),
        'receiveRetainedMismatch',
        'transitions',
      );
      add('missing modifier', write, 'modifiers', [], 'receiveWriteMismatch', 'receiveActions');
      add(
        'modifier id',
        write.modifiers[0]!,
        'id',
        'fabricated',
        'receiveWriteMismatch',
        'receiveActions',
      );
      add(
        'receipt actor',
        gain.receipts[0]!,
        'actor',
        'other',
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'receipt occurrence',
        gain.receipts[0]!,
        'occurrenceId',
        'other:0',
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'receipt action',
        gain.receipts[0]!,
        'actionId',
        'other',
        'receiveRetainedMismatch',
        'transitions',
      );
      add(
        'original commit input hp',
        action,
        'commitStartHp',
        write.after,
        'receiveRetainedMismatch',
        'receiveActions',
      );
      add(
        'facade effects reference',
        source.calculation,
        'effects',
        [...source.calculation.effects],
        'receiveIdentityMismatch',
        'reference.facade',
      );
      add(
        'transport transitions reference',
        source.transport!,
        'transitions',
        [...source.transport!.transitions],
        'receiveIdentityMismatch',
        'reference.transport',
      );
      add(
        'missing route',
        write.operation,
        'route',
        undefined,
        'receiveCanonicalMismatch',
        'canonical',
      );
      add(
        'fake HP read',
        source.candidate!,
        'reads',
        [{ operationId: 'fake', actor: 'attacker' }],
        'receiveRetainedMismatch',
        'candidate',
      );
      add(
        'fake HP dependent NP',
        source.candidate!,
        'nps',
        [{ operationId: 'fake', ratio: 0.2 }],
        'receiveRetainedMismatch',
        'candidate',
      );
      mutations.push({
        key: 'coherent state modifier receipt corruption',
        reason: 'receiveCanonicalMismatch',
        path: 'canonical',
        mutate: () => {
          const restores = [
            set(write.operation.values[0], '3', 201),
            ...read.consumption.receive.instances.map((m) => set(m, 'value', 201)),
            set(gain.receipts[0]!, 'actual', 999),
            set(gain.receipts[0]!.after, 'current', 9999),
            set(read.consumption.mutation, 'receive', 1402),
          ];
          return () => restores.reverse().forEach((r) => r());
        },
      });
      const reports = mutations.map((m) => {
        const restore = m.mutate();
        try {
          return {
            key: m.key,
            reason: m.reason,
            path: m.path,
            gate: structuredClone(
              auditReceive({
                requests: [item.request],
                expected: [item.program],
                observations: [source],
              }),
            ),
            proof: structuredClone(receiveDiagnostic(source)),
          };
        } finally {
          restore();
        }
      });
      const disabled = entry(legalFixture, '800112', specs[12]!, 202);
      const population = [
        {
          key: 'nonapplied success-filter exclusion',
          requests: [disabled.request],
          expected: [],
          observations: [],
        },
        { key: 'missing request', requests: [], expected: [item.program], observations: [source] },
        {
          key: 'success-filter removed program',
          requests: [item.request],
          expected: [],
          observations: [],
        },
        {
          key: 'missing observation',
          requests: [item.request],
          expected: [item.program],
          observations: [],
        },
        {
          key: 'duplicate observation',
          requests: [item.request],
          expected: [item.program],
          observations: [source, source],
        },
        {
          key: 'wrong request execution',
          requests: [{ prepared: item.request.prepared, calculation: other.request.calculation }],
          expected: [item.program],
          observations: [source],
        },
      ].map((p) => ({ key: p.key, gate: auditReceive(p) }));
      await save(task, 'tsk-08-receive-negatives.json', { reports, population });
      for (const report of reports) {
        expect(report.gate.status, report.key).toBe('failed');
        const failure = report.gate.failures.find(
          (f) => f.reason === report.reason && f.checkPath.includes(report.path),
        );
        expect(failure, report.key).toBeDefined();
        expect(failure!.firstDifference.path).toContain(failure!.checkPath);
        expect(failure!.expected).not.toEqual(failure!.actual);
        for (const f of report.gate.failures) {
          const d = firstCanonicalAuditDifference(
            [{ identity: f.identity, value: f.expected }],
            [{ identity: f.identity, value: f.actual }],
          )!;
          expect(f.firstDifference).toEqual({
            ...d,
            path: d.path ? `${f.checkPath}.${d.path}` : f.checkPath,
          });
        }
      }
      for (const report of population) {
        expect(report.gate.status, report.key).toBe('failed');
        const expectedReason =
          report.key === 'wrong request execution'
            ? 'receiveIdentityMismatch'
            : 'receivePopulationMismatch';
        const expectedPath =
          report.key === 'wrong request execution' ? 'request.references' : 'population';
        const failure = report.gate.failures.find(
          (f) => f.reason === expectedReason && f.checkPath.startsWith(expectedPath),
        );
        expect(failure, report.key).toBeDefined();
        for (const f of report.gate.failures) {
          const d = firstCanonicalAuditDifference(
            [{ identity: f.identity, value: f.expected }],
            [{ identity: f.identity, value: f.actual }],
          )!;
          expect(f.firstDifference).toEqual({
            ...d,
            path: d.path ? `${f.checkPath}.${d.path}` : f.checkPath,
          });
        }
      }
      expect(
        auditReceive({ requests: [item.request], expected: [item.program], observations: [source] })
          .status,
      ).toBe('passed');
    },
  );

  it(
    'derives published declarations and later same-skill gain from parsed master without fixed counts',
    productionAuditTestOptions(['tsk-08-receive-published.json']),
    async ({ task }) => {
      const bytes = await readFile(
        resolve(import.meta.dirname, '../../../apps/web/public/master/master.json'),
      );
      const master = masterSnapshotSchema.parse(JSON.parse(bytes.toString('utf8'))),
        inventory = receiveInventory(master);
      const candidates = inventory.filter((d) => {
        const skill = master.servants
          .find((s) => s.id === d.sourceId)!
          .skills.find((s) => s.id === d.skillId)!;
        const index = skill.effects.findIndex((e) => e.occurrenceId === d.occurrenceId);
        return skill.effects
          .slice(index + 1)
          .some((e) =>
            e.execution.some(
              (o) =>
                o.kind === 'resourceMutation' &&
                o.resource === 'hp' &&
                o.direction === 'gain' &&
                o.unit === 'fixed' &&
                o.amount.kind === 'fixed',
            ),
          );
      });
      const cases = candidates.map((d, index) => {
        const slot = master.servants
          .find((s) => s.id === d.sourceId)!
          .skills.find((s) => s.id === d.skillId)!.slot;
        return entry(
          master,
          d.sourceId,
          { key: `published:${index}`, values: [], gain: 1 },
          300 + index,
          slot,
        );
      });
      await save(task, 'tsk-08-receive-published.json', {
        master: {
          version: master.version,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        inventory,
        candidates,
        cases: cases.map((c) => ({ gate: c.gate, proof: receiveDiagnostic(c.source) })),
      });
      expect(inventory.length).toBeGreaterThan(0);
      expect(candidates.length).toBeGreaterThan(0);
      for (const item of cases) {
        expect(item.gate.status, JSON.stringify(item.gate.firstDifference)).toBe('passed');
        expect(item.gate.appended).toBeGreaterThan(0);
        expect(item.gate.consumed).toBeGreaterThan(0);
        expect(item.gate.changed).toBeGreaterThan(0);
      }
    },
  );
});
