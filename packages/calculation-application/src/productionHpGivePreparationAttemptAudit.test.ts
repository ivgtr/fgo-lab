import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, getNoblePhantasmVariants } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import * as hpOwner from '../../battle-execution/src/preparationHp';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import { giveSelection } from './productionHpGivePreparationAudit';
import {
  giveAttemptSource,
  giveAttemptProgram,
  giveAttemptDiagnostic,
  auditGiveAttemptIsolation,
  type GiveAttemptExpectation,
  type GiveAttemptSource,
} from './productionHpGivePreparationAttemptAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';
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
  separate?: boolean;
  combined?: boolean;
  secondGain?: boolean;
  party?: boolean;
  trigger?: 'unsupported' | 'inputRequired' | 'beforeWriter' | 'beforeGain' | 'none';
  gain?: number;
  disabled?: boolean;
  useConditionFalse?: boolean;
  mixedConditions?: boolean;
  initial?: number;
  capture?: boolean;
  ranking?: boolean;
  boundary?: GiveAttemptExpectation & { kind: 'boundary' };
};
const cells = (v: number) => [Array.from({ length: 10 }, () => v), [], [], [], []];
function masterFor(spec: Spec) {
  const servant = base.servants[0]!;
  const writer = {
    ...effect,
    id: 'give',
    occurrenceId: 'give:0',
    requirement: spec.disabled
      ? {
          recipient: 'sourceSelf',
          expression: {
            kind: 'quantity',
            quantity: 'attackerHpPermille',
            comparison: 'atMost',
            value: 0,
          },
        }
      : effect.requirement,
    execution: [
      {
        kind: 'hpModifier',
        action: 'give',
        sign: 1,
        route,
        lifetime: 'active',
        selection: 'direct',
        bounds: { minimum: 0, maximum: 50000 },
        traits: ['give-fixture'],
        ...(spec.useConditionFalse
          ? {
              useCondition: {
                kind: 'quantity',
                quantity: 'attackerHpPermille',
                comparison: 'atMost',
                value: 0,
              },
            }
          : {}),
        values: cells(731),
      },
    ],
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
        amount: { kind: 'fixed', values: cells(spec.gain ?? 1001) },
        subjectId: null,
      },
    ],
  };
  const refusal = {
    ...effect,
    id: 'refusal',
    occurrenceId: 'refusal:0',
    execution: [
      spec.trigger === 'inputRequired'
        ? {
            kind: 'grantOcBoost',
            route,
            lifetime: 'active',
            stacking: 'additive',
            stateTraits: ['positive'],
            cells: [
              Array.from({ length: 10 }, () => ({
                stages: 1,
                applicationRatePermille: 500,
                turns: { kind: 'unlimited' },
                uses: { kind: 'unlimited' },
              })),
              [],
              [],
              [],
              [],
            ],
          }
        : {
            kind: 'unsupported',
            route,
            reason: 'resourceExecutionSemantics',
            damageRelevant: true,
          },
    ],
  };
  const prefix = {
    ...effect,
    id: 'prefix',
    occurrenceId: 'prefix:0',
    execution: [
      {
        kind: 'damageModifier',
        modifier: 'attackBuff',
        sign: 1,
        card: null,
        route,
        values: cells(100),
        valueExpressions: cells(0).map((r) => r.map(() => null)),
        semanticSupport: 'supported',
      },
    ],
  };
  if (spec.mixedConditions) {
    const first = writer.execution[0]!;
    writer.execution = [
      {
        ...first,
        useCondition: {
          kind: 'quantity',
          quantity: 'attackerHpPermille',
          comparison: 'atMost',
          value: 0,
        },
      },
      first,
    ];
  }
  const program = [
    ...(spec.trigger === 'beforeWriter' ? [refusal] : []),
    writer,
    ...(spec.trigger === 'beforeGain' ? [refusal] : []),
    gain,
    ...(spec.secondGain ? [{ ...gain, id: 'gain-second', occurrenceId: 'gain-second:0' }] : []),
    ...(['beforeWriter', 'beforeGain', 'none'].includes(spec.trigger ?? '') ? [] : [refusal]),
  ];
  const skills = (
    spec.separate
      ? [[prefix], [writer], program.filter((e) => e !== writer)]
      : [
          [prefix],
          spec.combined
            ? [{ ...writer, execution: program.map((e) => e.execution).flat() }]
            : program,
        ]
  ).map((effects, i) => ({
    id: `give-attempt-skill-${i}`,
    slot: i + 1,
    priority: 1,
    name: 'fixture',
    detail: '',
    imageKey: null,
    resourceRequirement: null,
    effects,
  }));
  return masterSnapshotSchema.parse({
    ...base,
    version: 'give-attempt-strict-fixture',
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
                      ...prefix,
                      id: 'hp-reader',
                      occurrenceId: 'hp-reader:0',
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
function run(spec: Spec, index = 0) {
  const master = masterFor(spec),
    defaults = createDefaultResolvedScenario(master, undefined);
  const scenario = {
    ...defaults,
    attacker: { ...defaults.attacker, level: 90 },
    attackerHpPermille: spec.initial ?? 333,
    explicitOverrides: {},
    canonicalInputValues: spec.party
      ? {
          'source:support:give-support:maximumHp': { kind: 'integer' as const, value: 10001 },
          'source:support:give-support:hpPermille': { kind: 'integer' as const, value: 444 },
        }
      : {},
    support: spec.party
      ? {
          sourceTemplateId: null,
          composition: {
            effectInclusions: [],
            sources: [
              {
                sourceInstanceId: 'give-support',
                servantId: master.servants[0]!.id,
                skills: [{ skillId: 'give-attempt-skill-0', skillLevel: 4, enabled: true }],
              },
            ],
          },
        }
      : null,
    preNoblePhantasmPlan: [
      ...(spec.separate ? [1, 2, 3] : [1, 2]).map((slot) => ({
        kind: 'useSkillSlot' as const,
        slot: slot as 1 | 2 | 3,
        skillLevel: 4,
        choice: null,
      })),
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    spec.ranking
      ? {
          kind: 'ranking',
          selfBuffs: 'included',
          conditionalEffects: 'satisfied',
          areaView: 'included',
        }
      : { kind: 'calculator' },
    {},
    spec.capture ?? true,
  );
  const context = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    masterDataVersion: master.version,
    appVersion: '0.1.0',
    gameRegion: 'JP',
    masterDataLocale: 'ja-JP',
  } as const;
  const calculation = evaluatePreparedCalculationScenario(prepared, context),
    direct = evaluatePreparedCalculationResult(prepared, context),
    request = { prepared, calculation },
    selection = giveSelection(request, index);
  if (!selection) throw new Error('give_attempt_fixture_selection_missing');
  const expectation: GiveAttemptExpectation = spec.boundary ?? {
    kind: 'changedNoncommit',
    actionIndex: spec.separate ? 2 : 1,
  };
  const program = giveAttemptProgram(selection, expectation, direct),
    source = giveAttemptSource(selection, direct),
    input = { requests: [request], expected: [program], observations: [source] };
  return { spec, request, program, source, input, gate: auditGiveAttemptIsolation(input) };
}
async function save(meta: unknown, path: string, payload: unknown) {
  const receipt = await writeProductionAuditArtifact(
    meta,
    path,
    encodeProductionAuditDiagnostic(payload),
  );
  const bytes = await readStoredProductionAuditArtifact(path);
  expect([bytes.length, createHash('sha256').update(bytes).digest('hex')]).toEqual([
    receipt.expectedBytes,
    receipt.expectedSha256,
  ]);
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
const positives: Spec[] = [
  { key: 'A-self' },
  { key: 'A-owner-filtered-instances', mixedConditions: true },
  { key: 'A-interrupted-source', combined: true },
  { key: 'B-two-gains', separate: true, secondGain: true },
  { key: 'A-party', party: true },
  { key: 'B-self', separate: true },
  { key: 'B-party', separate: true, party: true },
  { key: 'A-input', trigger: 'inputRequired' },
  { key: 'B-input', separate: true, trigger: 'inputRequired', ranking: true },
];
it(
  'connects strict give changed attempts through original native refusal and retained action prefixes',
  productionAuditTestOptions(['give-attempt-changed.json']),
  async ({ task }) => {
    const records = positives.map((s, i) => run(s, i));
    await save(
      task.meta,
      'give-attempt-changed.json',
      records.map((r) => ({
        key: r.spec.key,
        diagnostic: giveAttemptDiagnostic(r.source),
        gate: r.gate,
      })),
    );
    for (const r of records) {
      expect(r.gate.failures, r.spec.key).toEqual([]);
      expect(r.gate.isolated).toBe(1);
      expect(r.gate.changed).toBeGreaterThan(0);
      const declaredNps = getNoblePhantasmVariants(r.source.master.servants[0]!);
      expect(
        declaredNps.some(
          (np) => np.kind === 'attack' && np.damage.some((d) => d.kind === 'hpRatioLow'),
        ),
      ).toBe(true);
      expect(
        declaredNps.some((np) =>
          np.effects.some(
            (e) =>
              e.requirement.expression.kind === 'quantity' &&
              e.requirement.expression.quantity === 'attackerHpPermille',
          ),
        ),
      ).toBe(true);
      // Native rejection precedes NP selection; declared readers are not actual reads.
      expect(r.source.canonical.readers).toEqual([]);
      expect(r.source.canonical.nps).toEqual([]);
      const targetReads = r.source.transitions!.at(-1)!.hpActions![0]!.giveConsumptions!;
      expect(targetReads.length).toBe((r.spec.party ? 2 : 1) * (r.spec.secondGain ? 2 : 1));
      expect(targetReads.every((read) => read.consumption.give.actor === 'attacker')).toBe(true);
      const n = r.source.transitions!.at(-1)!.hpActions![0]!;
      expect(n.returned).toBe(n.start);
      expect(n.attempted!.hp).not.toBe(n.returned!.hp);
      expect(n.returned!.appliedActions.length).toBe(r.spec.separate ? 2 : 1);
      expect(n.returned!.hp!.modifiers?.length ?? 0).toBe(r.spec.separate ? 1 : 0);
    }
  },
);
it(
  'distinguishes give refusal boundaries without promoting them to changed isolation',
  productionAuditTestOptions(['give-attempt-boundaries.json']),
  async ({ task }) => {
    const specs: Spec[] = [
      {
        key: 'before-writer',
        trigger: 'beforeWriter',
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'writerUnreached' },
      },
      {
        key: 'writer-disabled',
        disabled: true,
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'writerNotApplied' },
      },
      {
        key: 'before-gain',
        trigger: 'beforeGain',
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'consumerUnreached' },
      },
      {
        key: 'give-read-excluded',
        useConditionFalse: true,
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'giveReadExcluded' },
      },
      {
        key: 'actual-zero',
        gain: 0,
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'consumerActualZero' },
      },
      {
        key: 'full-hp',
        initial: 1000,
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'consumerActualZero' },
      },
      {
        key: 'committed',
        trigger: 'none',
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'nativeCommitted' },
      },
      {
        key: 'capture-absent',
        capture: false,
        boundary: { kind: 'boundary', actionIndex: 1, boundary: 'attemptBeforeNative' },
      },
    ];
    const records = specs.map((s, i) => run(s, i));
    await save(
      task.meta,
      'give-attempt-boundaries.json',
      records.map((r) => ({
        key: r.spec.key,
        diagnostic: giveAttemptDiagnostic(r.source),
        gate: r.gate,
      })),
    );
    for (const r of records) {
      expect(r.gate.failures, r.spec.key).toEqual([]);
      expect(r.gate.isolated).toBe(0);
      expect(r.gate.boundaries.map((b) => b.reason)).toEqual([r.spec.boundary!.boundary]);
    }
  },
);
it(
  'rejects foreign identities, leaked failure state, lost prefixes and forged downstream without owner replay',
  productionAuditTestOptions(['give-attempt-negatives.json']),
  async ({ task }) => {
    const entry = run({ key: 'B-negative', separate: true, party: true }),
      s = entry.source,
      n = s.transitions!.at(-1)!.hpActions![0]!,
      t = s.transitions!.at(-1)!;
    const cases: { key: string; apply: () => () => void }[] = [];
    const replace = (key: string, object: object, field: string, v: unknown) =>
      cases.push({
        key,
        apply: () => {
          const o = object as Record<string, unknown>,
            old = o[field];
          o[field] = v;
          return () => {
            o[field] = old;
          };
        },
      });
    const read = n.giveConsumptions![0]!,
      gain = n.giveGains![0]!,
      write = s.transitions![1]!.hpActions![0]!.giveWrites![0]!;
    replace(
      'source-recipient',
      read.consumption.give,
      'actor',
      read.consumption.actor === 'attacker' ? 'party:foreign' : 'attacker:foreign',
    );
    replace('give-receive', write.operation, 'action', 'receive');
    replace(
      'equal-foreign-instance',
      read.consumption.give,
      'instances',
      read.consumption.give.instances.map((m) => ({ ...m })),
    );
    replace('foreign-source', read, 'source', { ...read.source });
    replace('wrong-action', n, 'actionId', 'foreign');
    replace('wrong-order', read, 'operationIndex', 999);
    replace('failed-hp-leak', n, 'returned', n.attempted);
    replace('prefix-loss', n, 'returned', s.transitions![0]!.before);
    replace('equal-foreign-returned', n, 'returned', { ...n.returned });
    replace('reducer-leak', t.result, 'state', n.attempted);
    replace('receipt-leak', n.returned!.hp!, 'receipts', [
      ...n.returned!.hp!.receipts,
      ...gain.receipts,
    ]);
    const writerAction = s.transitions![1]!.hpActions![0]!;
    replace('missing-append', writerAction, 'giveWrites', []);
    replace('duplicate-append', writerAction, 'giveWrites', [...writerAction.giveWrites!, write]);
    replace('wrong-append-cell', write, 'valueSetIndex', 42);
    replace('missing-read', n, 'giveConsumptions', []);
    replace('unmatched-read', n, 'giveConsumptions', [
      ...n.giveConsumptions!,
      { ...read, operationIndex: 999 },
    ]);
    replace('unmatched-gain', n, 'giveGains', [...n.giveGains!, { ...gain, operationIndex: 999 }]);
    replace('duplicate-read', n, 'giveConsumptions', [...n.giveConsumptions!, read]);
    replace('missing-native', n, 'native', undefined);
    replace('foreign-native', n, 'native', { ...n.native });
    replace(
      'wrong-step',
      t.attempts![0]!.stepOrigins.find((o) => o.index === t.attempts![0]!.reached.at(-1)!.index)!,
      'index',
      999,
    );
    replace('stale-start', n, 'start', s.transitions![0]!.before);
    replace('downstream-input', s, 'input', {});
    replace('downstream-candidate', s, 'candidate', {});
    replace('downstream-transport', s.transport!, 'damageInputGenerated', {});
    replace('downstream-use', s, 'uses', [
      { operationId: 'forged', events: [{}], projections: [], contributions: [] },
    ]);
    const excluded = run({
      key: 'excluded-negative',
      useConditionFalse: true,
      boundary: { kind: 'boundary', actionIndex: 1, boundary: 'giveReadExcluded' },
    });
    const spy = vi.spyOn(hpOwner, 'executeHpOperation');
    const records = [];
    try {
      for (const c of cases) {
        const restore = c.apply();
        try {
          const gate = auditGiveAttemptIsolation(entry.input);
          records.push({ key: c.key, gate });
          expect(gate.status, c.key).toBe('failed');
          expect(gate.firstDifference).not.toBeNull();
        } finally {
          restore();
        }
      }
      for (const key of [
        'missing-append',
        'duplicate-append',
        'wrong-append-cell',
        'source-recipient',
        'equal-foreign-instance',
        'wrong-order',
        'failed-hp-leak',
        'prefix-loss',
        'missing-read',
        'duplicate-read',
        'unmatched-read',
        'unmatched-gain',
        'missing-native',
        'wrong-step',
      ]) {
        const c = cases.find((c) => c.key === key)!;
        const restore = c.apply();
        try {
          const program = giveAttemptProgram(
            entry.program.selection,
            entry.program.expectation,
            s.directResult,
          );
          const source = giveAttemptSource(entry.program.selection, s.directResult);
          const gate = auditGiveAttemptIsolation({
            requests: entry.input.requests,
            expected: [program],
            observations: [source],
          });
          records.push({ key: `semantic:${key}`, gate });
          expect(gate.status, `semantic:${key}`).toBe('failed');
          expect(
            gate.failures.some(
              (f) =>
                f.reason !== 'giveAttemptProofMismatch' &&
                f.reason !== 'giveAttemptIdentityMismatch',
            ),
            `semantic:${key}`,
          ).toBe(true);
        } finally {
          restore();
        }
      }
      const populations = [
        { key: 'missing', input: { ...entry.input, observations: [] } },
        { key: 'duplicate', input: { ...entry.input, observations: [s, s] } },
        {
          key: 'unmatched',
          input: {
            ...entry.input,
            observations: [{ ...s, identity: 'foreign' } as GiveAttemptSource],
          },
        },
      ];
      for (const p of populations) {
        const gate = auditGiveAttemptIsolation(p.input);
        records.push({ key: p.key, gate });
        expect(gate.status, p.key).toBe('failed');
      }
      const excludedAction = excluded.source.transitions!.at(-1)!.hpActions![0]!;
      const original = excludedAction.giveExcludedConsumptions!;
      for (const [key, replacement] of [
        ['missing-excluded-read', []],
        ['duplicate-excluded-read', [...original, ...original]],
      ] as const) {
        excludedAction.giveExcludedConsumptions = [...replacement];
        try {
          const program = giveAttemptProgram(
            excluded.program.selection,
            excluded.program.expectation,
            excluded.source.directResult,
          );
          const gate = auditGiveAttemptIsolation({
            requests: excluded.input.requests,
            expected: [program],
            observations: [
              giveAttemptSource(excluded.program.selection, excluded.source.directResult),
            ],
          });
          records.push({ key, gate });
          expect(gate.status, key).toBe('failed');
          expect(
            gate.failures.some((f) => f.reason === 'giveAttemptConsumptionMismatch'),
            key,
          ).toBe(true);
        } finally {
          excludedAction.giveExcludedConsumptions = original;
        }
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    await save(task.meta, 'give-attempt-negatives.json', records);
    expect(auditGiveAttemptIsolation(entry.input).failures).toEqual([]);
  },
);
