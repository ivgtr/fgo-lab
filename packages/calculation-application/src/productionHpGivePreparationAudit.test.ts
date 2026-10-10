import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { executeHpOperation, type SourceEffect } from '@fgo-lab/battle-execution';
import * as owner from '../../battle-execution/src/preparationHp';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
} from './scenario';
import {
  createGiveAuditSnapshotter,
  giveSelection,
  giveSource,
  giveProgram,
  giveDiagnostic,
  auditGive,
} from './productionHpGivePreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';

it('owns completed give projections across caller mutations and repairs', () => {
  const leaf = { quantity: 3 };
  const source = { one: leaf, two: leaf };
  const before = createGiveAuditSnapshotter()(source);
  const fields = (before as { fields: Record<string, unknown> }).fields;
  expect(fields.one).toBe(fields.two);
  leaf.quantity = 9;
  expect(before).toMatchObject({ fields: { one: { fields: { quantity: { value: 3 } } } } });
  expect(createGiveAuditSnapshotter()(source)).toMatchObject({
    fields: { one: { fields: { quantity: { value: 9 } } } },
  });
  leaf.quantity = 3;
  expect(createGiveAuditSnapshotter()(source)).toEqual(before);
  const cycle: unknown[] = [];
  cycle.push(cycle);
  expect(() => createGiveAuditSnapshotter()(cycle)).toThrow('cyclic_give_audit_value');
});

const base = masterSnapshotSchema.parse(fixture);
const route = {
  target: 'sourceSelf',
  contributionScope: 'personal',
  eligibility: {
    kind: 'requiredRecipient',
    recipient: 'attacker',
    onMissing: 'ignore',
    onMismatch: 'ignore',
  },
};
const effect = {
  label: 'give fixture',
  availability: 'allLimitBreakStates',
  inclusionPolicy: { default: 'include' },
  gameActivation: 'skillUse',
  triggerScope: null,
  interaction: null,
  operationTrigger: null,
  operationReference: null,
  stateIdentity: null,
  proc: { kind: 'guaranteed' },
  selection: null,
  inputDefinitions: [],
  requirement: { recipient: 'sourceSelf', expression: { kind: 'always' } },
  atlasEvidence: {
    functionType: 'fixture',
    target: 'self',
    parameterSets: [[], [], [], [], []],
    parameterSemantics: {
      value: [],
      lifecycle: [],
      presentation: [],
      condition: [],
      contextMutation: [],
      choice: [],
      valueExpression: [],
      buffIdentity: [],
      unresolved: [],
    },
    unresolvedSemanticKeys: [],
    buffTypes: [],
    buffRateTargets: [],
    buffConditionKeys: [],
  },
};
type Spec = {
  key: string;
  value?: number;
  sign?: 1 | -1;
  maximum?: number;
  minimum?: number;
  party?: boolean;
  early?: boolean;
  noGain?: boolean;
  disabled?: boolean;
  omitted?: boolean;
  multiple?: boolean;
  gain?: number;
  initial?: number;
  choice?: boolean;
};
const specs: Spec[] = [
  { key: 'cross-action-party', party: true },
  { key: 'self' },
  { key: 'negative-sign', sign: -1, value: 300 },
  { key: 'upper-bound', value: 60000 },
  { key: 'lower-bound', value: 2000, sign: -1 },
  { key: 'two-instances', multiple: true },
  { key: 'omitted-direct', omitted: true },
  { key: 'selected-choice', choice: true },
  { key: 'no-consumer', noGain: true },
  { key: 'consumer-before-writer', early: true, party: true },
  { key: 'writer-not-applied', disabled: true },
  { key: 'gain-zero', gain: 0 },
  { key: 'full-hp-clamp', initial: 1000 },
];
function fixtureMaster(spec: Spec): MasterDataSnapshot {
  const servant = base.servants[0]!;
  const writer = {
    ...effect,
    id: 'give',
    occurrenceId: 'give:0',
    ...(spec.choice
      ? {
          selection: { kind: 'playerChoice', group: { key: 'give-choice', candidate: 'selected' } },
        }
      : {}),
    ...(spec.disabled
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
    execution: Array.from({ length: spec.multiple ? 2 : 1 }, () => ({
      kind: 'hpModifier',
      action: 'give',
      sign: spec.sign ?? 1,
      route,
      lifetime: 'active',
      ...(spec.omitted ? {} : { selection: 'direct' }),
      bounds: { minimum: spec.minimum ?? 0, maximum: spec.maximum ?? 50000 },
      traits: ['give-fixture'],
      values: [
        Array.from({ length: 10 }, (_, i) => (spec.value ?? 731) + (i === 3 ? 0 : 17)),
        [],
        [],
        [],
        [],
      ],
    })),
  };
  const gain = {
    ...effect,
    id: 'gain',
    occurrenceId: 'gain:0',
    execution: [
      {
        kind: 'resourceMutation',
        resource: 'hp',
        direction: 'gain',
        unit: 'fixed',
        selection: 'direct',
        recipient: spec.party ? 'partyMember' : 'sourceSelf',
        amount: {
          kind: 'fixed',
          values: [Array.from({ length: 10 }, () => spec.gain ?? 1001), [], [], [], []],
        },
        subjectId: null,
      },
    ],
  };
  const skills = [writer, gain].map((e, index) => ({
    id: `give-skill-${index}`,
    slot: index + 1,
    priority: 1,
    name: 'fixture skill',
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects: [e],
  }));
  return masterSnapshotSchema.parse({
    ...base,
    version: 'give-strict-fixture',
    servants: [
      {
        ...servant,
        hpByLevel: { ...servant.hpByLevel, 90: 9010 },
        skills,
        passives: [],
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((f) => ({
            ...f,
            skillIds: skills.map((s) => s.id),
            passiveIds: [],
          })),
        },
        noblePhantasmVariantGroups: servant.noblePhantasmVariantGroups.map((g) => ({
          ...g,
          variants: g.variants.map((np) =>
            np.kind !== 'attack'
              ? np
              : {
                  ...np,
                  effects: [
                    {
                      ...effect,
                      id: 'reader',
                      occurrenceId: 'reader:0',
                      gameActivation: 'npBeforeDamage',
                      timing: 'beforeDamage',
                      requirement: {
                        recipient: 'sourceSelf',
                        expression: {
                          kind: 'quantity',
                          quantity: 'attackerHpPermille',
                          comparison: 'atMost',
                          value: 700,
                        },
                      },
                      execution: [
                        {
                          kind: 'damageModifier',
                          modifier: 'attackBuff',
                          sign: 1,
                          card: null,
                          route,
                          values: [Array.from({ length: 10 }, () => 100), [], [], [], []],
                          valueExpressions: [
                            Array.from({ length: 10 }, () => null),
                            [],
                            [],
                            [],
                            [],
                          ],
                          semanticSupport: 'supported',
                        },
                      ],
                    },
                  ],
                  damage: np.damage.map((d) => ({
                    ...d,
                    kind: 'hpRatioLow',
                    rawFunctionType: 'damageNpHpratioLow',
                    parametersByOvercharge: d.parametersByOvercharge.map((row) =>
                      row.map((cell) => ({ ...cell, targetId: 9000 })),
                    ),
                  })),
                },
          ),
        })),
      },
    ],
  });
}
function run(spec: Spec, capture = true, ranking = false, index = 0) {
  const master = fixtureMaster(spec);
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined),
    attackerHpPermille: spec.initial ?? 333,
    attacker: { ...createDefaultResolvedScenario(master, undefined).attacker, level: 90 },
    explicitOverrides: {},
    preNoblePhantasmPlan: [
      ...(spec.early ? [2, 1] : spec.noGain ? [1] : [1, 2]).map((slot) => ({
        kind: 'useSkillSlot' as const,
        slot: slot as 1 | 2,
        skillLevel: 4,
        choice:
          spec.choice && slot === 1 ? { groupKey: 'give-choice', candidateKey: 'selected' } : null,
      })),
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
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
  const calculation = evaluatePreparedCalculationScenario(prepared, {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    masterDataVersion: master.version,
    appVersion: '0.1.0',
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
  });
  const request = { prepared, calculation },
    selection = giveSelection(request, index);
  if (!selection) throw new Error('give_fixture_selection_missing');
  return { request, selection, source: giveSource(selection), program: giveProgram(selection) };
}
const gate = (item: ReturnType<typeof run>) =>
  auditGive({ requests: [item.request], expected: [item.program], observations: [item.source] });
async function save(meta: unknown, path: string, payload: unknown) {
  const receipt = await writeProductionAuditArtifact(
    meta,
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
it(
  'connects strict cross-action give writes, original reads, retained HP, live conditions and continuous NP without owner replay',
  productionAuditTestOptions(['tsk-08-give-representatives.json']),
  async ({ task }) => {
    const cases = specs.map((spec, index) => ({ spec, item: run(spec, true, false, index) }));
    const parity = specs.map((spec, index) => ({
      key: spec.key,
      plain: run(spec, false, false, index),
      ranking: run(spec, true, true, index),
    }));
    const spy = vi.spyOn(owner, 'executeHpOperation');
    const records = cases.map(({ spec, item }, i) => ({
      key: spec.key,
      gate: gate(item),
      rankingGate: gate(parity[i]!.ranking),
      proof: giveDiagnostic(item.source),
      parity: {
        plain: { input: parity[i]!.plain.source.input, result: parity[i]!.plain.source.result },
        ranking: {
          input: parity[i]!.ranking.source.input,
          result: parity[i]!.ranking.source.result,
        },
      },
    }));
    try {
      const population = auditGive({
        requests: cases.map((c) => c.item.request),
        expected: cases.map((c) => c.item.program),
        observations: cases.map((c) => c.item.source),
      });
      await save(task.meta, 'tsk-08-give-representatives.json', { records, population });
      expect(population.failures).toEqual([]);
      expect([
        population.selected,
        population.declaredSelected,
        population.reached,
        population.committed,
        population.excluded,
        population.gainConsumed,
        population.changed,
        population.readers,
        population.nps,
        population.connected,
      ]).toEqual([13, 14, 14, 13, 1, 10, 7, 13, 13, 10]);
      expect(spy).not.toHaveBeenCalled();
      for (const [i, { spec, item }] of cases.entries()) {
        const record = records[i]!;
        expect(record.gate.failures, spec.key).toEqual([]);
        expect(item.source.calculation.status, spec.key).toBe('executable');
        expect(item.source.result).toEqual(record.parity.plain.result);
        expect(item.source.input).toEqual(record.parity.plain.input);
        expect(item.source.result).toEqual(record.parity.ranking.result);
        expect(item.source.input).toEqual(record.parity.ranking.input);
        expect(record.rankingGate.failures, spec.key).toEqual([]);
        expect(record.gate.connected).toBe(spec.noGain || spec.early || spec.disabled ? 0 : 1);
      }
    } finally {
      spy.mockRestore();
    }
    const actualFactors = cases.map(({ item }) =>
      item.source.transitions
        ?.flatMap((t) => (t as Partial<typeof t>).hpActions ?? [])
        .flatMap((a) => a.giveConsumptions ?? [])
        .map((r) => r.consumption.give.value),
    );
    expect(actualFactors[2]).toEqual([700]);
    expect(actualFactors[3]).toEqual([50000]);
    expect(actualFactors[4]).toEqual([0]);
    expect(actualFactors[5]).toEqual([2462]);
    const first = cases[0]!.item.source;
    expect(first.canonical.writers[0]!.skillId).not.toBe(first.canonical.consumers[0]!.skillId);
    expect(first.canonical.writers[0]!.actionIndex).toBeLessThan(
      first.canonical.consumers[0]!.actionIndex,
    );
    const hp = first.candidate!.seed.hp!.actors.attacker;
    expect(hp).toMatchObject({ kind: 'absolute', current: 5065, maximum: 10010 });
    expect(first.candidate!.nps[0]!.ratio).toBe(5065 / 10010);
    expect(first.candidate!.nps[0]!.ratio).not.toBe(first.candidate!.seed.permille! / 1000);
  },
);
it(
  'fails closed on missing, duplicate, foreign, stale or corrupted give evidence and preserves typed first differences',
  productionAuditTestOptions(['tsk-08-give-negatives.json']),
  async ({ task }) => {
    const item = run(specs[0]!);
    const actions = item.source.transitions!.flatMap(
      (t) => (t as Partial<typeof t>).hpActions ?? [],
    );
    const write = actions[0]!.giveWrites![0]!,
      read = actions[1]!.giveConsumptions![0]!;
    const negatives: { key: string; object: object; field: string; value: unknown }[] = [
      { key: 'source-actor', object: read.consumption.give, field: 'actor', value: 'foreign' },
      { key: 'recipient-actor', object: read.consumption, field: 'actor', value: 'foreign' },
      { key: 'missing-give', object: read.consumption.give, field: 'instances', value: [] },
      {
        key: 'foreign-instance',
        object: read.consumption.give,
        field: 'instances',
        value: [structuredClone(write.modifiers[0])],
      },
      { key: 'wrong-factor', object: read.consumption.give, field: 'value', value: 1000 },
      {
        key: 'wrong-mutation-factor',
        object: read.consumption.mutation,
        field: 'give',
        value: 1000,
      },
      { key: 'wrong-receive', object: read.consumption.receive, field: 'value', value: 2000 },
      { key: 'source-skill', object: read.source, field: 'skillId', value: 'foreign' },
      { key: 'wrong-action', object: actions[1]!, field: 'actionId', value: 'foreign' },
      {
        key: 'wrong-order',
        object: item.source,
        field: 'transitions',
        value: [...item.source.transitions!].reverse(),
      },
      { key: 'write-duplicate', object: actions[0]!, field: 'giveWrites', value: [write, write] },
      { key: 'write-missing', object: actions[0]!, field: 'giveWrites', value: [] },
      {
        key: 'read-duplicate',
        object: actions[1]!,
        field: 'giveConsumptions',
        value: [read, read],
      },
      { key: 'read-missing', object: actions[1]!, field: 'giveConsumptions', value: [] },
      { key: 'wrong-cell', object: write, field: 'valueIndex', value: 0 },
      { key: 'wrong-instance-value', object: write.modifiers[0]!, field: 'value', value: 0 },
      {
        key: 'wrong-operation',
        object: write,
        field: 'operation',
        value: structuredClone(write.operation),
      },
      { key: 'give-as-receive', object: write.operation, field: 'action', value: 'receive' },
      { key: 'wrong-sign', object: write.operation, field: 'sign', value: -1 },
      { key: 'wrong-bound', object: write.operation.bounds, field: 'maximum', value: 500 },
      {
        key: 'stale-hp',
        object: item.source.candidate!.seed,
        field: 'hp',
        value: actions[0]!.start.hp,
      },
      {
        key: 'foreign-retained-hp',
        object: item.source.candidate!.seed,
        field: 'hp',
        value: structuredClone(item.source.candidate!.seed.hp),
      },
      {
        key: 'wrong-reader',
        object: item.source.candidate!.reads[0]!,
        field: 'actor',
        value: 'foreign',
      },
      { key: 'wrong-np-ratio', object: item.source.candidate!.nps[0]!, field: 'ratio', value: 0.5 },
      { key: 'missing-use', object: item.source, field: 'uses', value: [] },
      {
        key: 'governing-hp',
        object: item.source.master.servants[0]!,
        field: 'hpByLevel',
        value: {},
      },
      {
        key: 'native-container',
        object: actions[0]!.native!.state,
        field: 'sourceOutcomes',
        value: [],
      },
    ];
    const results = negatives.map((n) => {
      const descriptor = Object.getOwnPropertyDescriptor(n.object, n.field);
      Object.defineProperty(n.object, n.field, {
        value: n.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      try {
        const result = gate(item);
        return { key: n.key, result };
      } finally {
        if (descriptor) Object.defineProperty(n.object, n.field, descriptor);
        else Reflect.deleteProperty(n.object, n.field);
      }
    });
    for (const [key, request] of [
      ['missing', { requests: [item.request], expected: [item.program], observations: [] }],
      [
        'duplicate',
        {
          requests: [item.request],
          expected: [item.program],
          observations: [item.source, item.source],
        },
      ],
      ['unmatched', { requests: [], expected: [item.program], observations: [item.source] }],
    ] as const) {
      const result = auditGive(request);
      results.push({ key, result });
    }
    const restored = gate(item);
    await save(task.meta, 'tsk-08-give-negatives.json', { results, restored });
    expect(restored.failures).toEqual([]);
    for (const { key, result } of results) {
      expect(result.status, key).toBe('failed');
      expect(result.firstDifference, key).not.toBeNull();
    }
  },
);
it(
  'observes the actual source give and recipient receive independently on a party gain, and bypasses give for loss',
  productionAuditTestOptions(['tsk-08-give-actor-counterexample.json']),
  async ({ task }) => {
    const item = run(specs[0]!),
      actions = item.source.transitions!.flatMap((t) => (t as Partial<typeof t>).hpActions ?? []);
    const writer = actions[0]!.giveWrites![0]!,
      gain = actions[1]!.giveGains![0]!;
    const give = {
      ...writer.modifiers[0]!,
      actor: 'support:fixture',
      id: 'support-give',
      value: 500,
    };
    const foreign = { ...give, actor: 'attacker', id: 'foreign-give', value: 9000 };
    const receive = {
      ...give,
      actor: 'attacker',
      id: 'attacker-receive',
      value: 300,
      operation: { ...give.operation, action: 'receive' as const },
    };
    const state = {
      actors: {
        attacker: { kind: 'absolute' as const, current: 2000, maximum: 10000, baseMaximum: 10000 },
        'support:fixture': {
          kind: 'absolute' as const,
          current: 4000,
          maximum: 10000,
          baseMaximum: 10000,
        },
      },
      modifiers: [give, foreign, receive],
      receipts: [],
    };
    const source: SourceEffect = {
      ...gain.source,
      origin: 'support',
      sourceInstanceId: 'support:fixture',
    };
    const operation = source.effect.execution[0]!;
    if (operation.kind !== 'resourceMutation' || operation.resource !== 'hp')
      throw new Error('expected HP gain');
    const reads: owner.HpGiveGainConsumption[] = [];
    const result = executeHpOperation({
      state,
      source,
      operation,
      values: {},
      actionId: 'gain-counterexample',
      valueSetIndex: 0,
      observeGiveGain: (read) => reads.push(read),
    });
    // Independent actor updates are primitive evidence; no attacker NP claim is attached to them.
    const bypass: owner.HpGiveGainConsumption[] = [];
    executeHpOperation({
      state,
      source,
      operation: { ...operation, direction: 'loss', lossFloor: 'zero' },
      values: {},
      actionId: 'loss',
      valueSetIndex: 0,
      observeGiveGain: (read) => bypass.push(read),
    });
    await save(task.meta, 'tsk-08-give-actor-counterexample.json', {
      sourceActor: source.sourceInstanceId,
      state,
      operation,
      result,
      reads,
      lossBypass: bypass,
      qualification:
        'Primitive source/recipient evidence only; auxiliary HP is not attacker NP consumption.',
    });
    expect(result.status).toBe('applied');
    expect(reads.map((r) => [r.actor, r.give.actor, r.give.value, r.receive.value])).toEqual([
      ['attacker', 'support:fixture', 1500, 1300],
      ['support:fixture', 'support:fixture', 1500, 1000],
    ]);
    expect(reads[0]!.give.instances[0]).toBe(give);
    expect(reads[0]!.receive.instances[0]).toBe(receive);
    expect(reads[0]!.result).toMatchObject({
      status: 'applied',
      attempted: 1951,
      actor: { current: 3951 },
    });
    expect(bypass).toEqual([]);
  },
);
