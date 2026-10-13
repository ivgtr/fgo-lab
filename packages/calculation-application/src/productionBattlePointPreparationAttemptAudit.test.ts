import { mutableAuditView } from './auditTestMutation';
import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import { isDeepStrictEqual } from 'node:util';
import { equalProductionAuditDiagnosticValues } from './productionAuditDiagnosticEquality';
import { attachBattlePointPreparationRejectionObservation } from './battlePointPreparationObservation';
import { expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, type MasterDataSnapshot } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import {
  productionAuditTestOptions,
  encodeProductionAuditDiagnostic as encodeDiagnostic,
  decodeProductionAuditDiagnostic as decodeDiagnostic,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';
import {
  battlePointPreparationAttemptProgram,
  battlePointPreparationAttemptSource,
  auditBattlePointPreparationAttemptObservations,
  auditPublishedBattlePointPreparationAttempts,
  type BattlePointPreparationAttemptSource,
  type BattlePointPreparationAttemptFailureReason,
} from './productionBattlePointPreparationAttemptAudit';

type Spec = {
  name: string;
  initial: number;
  groups: number[][];
  permille?: boolean;
  maximum?: number;
  failure: 'unsupported' | 'inputRequired' | 'invalid';
  attempted: number[];
  retained: number;
  boundary?: boolean;
  early?: boolean;
  skip?: boolean;
  choice?: boolean;
  phase?: number;
};
const specs: Spec[] = [
  {
    name: 'non-applied-boundary',
    initial: 10,
    groups: [[45]],
    failure: 'unsupported',
    attempted: [],
    retained: 10,
    boundary: true,
    skip: true,
  },
  {
    name: 'changed-before-invalid-bp',
    initial: 10,
    groups: [[45]],
    failure: 'invalid',
    attempted: [55],
    retained: 10,
  },
  {
    name: 'gain-unsupported',
    phase: 2,
    initial: 20,
    groups: [[45]],
    failure: 'unsupported',
    attempted: [65],
    retained: 20,
  },
  {
    name: 'loss-input-required',
    initial: 80,
    groups: [[-30]],
    failure: 'inputRequired',
    attempted: [50],
    retained: 80,
  },
  {
    name: 'multiple-lower-clamp',
    initial: 10,
    groups: [[70, -150, 55]],
    failure: 'unsupported',
    attempted: [80, 0, 55],
    retained: 10,
  },
  {
    name: 'prior-commit-action-start',
    initial: 10,
    groups: [[30], [20, -15]],
    failure: 'inputRequired',
    attempted: [60, 45],
    retained: 40,
  },
  {
    name: 'capacity-clamp',
    choice: true,
    initial: 180,
    groups: [[50, -80]],
    failure: 'unsupported',
    attempted: [200, 120],
    retained: 180,
    permille: true,
  },
  {
    name: 'unchanged-boundary',
    initial: 100,
    groups: [[45]],
    failure: 'unsupported',
    attempted: [100],
    retained: 100,
    boundary: true,
  },
  {
    name: 'early-boundary',
    initial: 10,
    groups: [[45]],
    failure: 'unsupported',
    attempted: [],
    retained: 10,
    boundary: true,
    early: true,
  },
];
function fixtureMaster(spec: Spec, missingNpCell = false) {
  const base = masterSnapshotSchema.parse(fixture);
  const servant = base.servants[0]!;
  const template = {
    label: 'domain preparation fixture',
    availability: 'allLimitBreakStates',
    inclusionPolicy: { default: 'include' },
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
  const domainId = '810000';
  const capacity = spec.permille ? 200 : 100;
  const domain = {
    id: domainId,
    phaseScale: spec.permille ? ('permille' as const) : ('point' as const),
    phases: [
      { phase: 0, threshold: 0 },
      { phase: 2, threshold: spec.permille ? 250 : 20 },
      { phase: 5, threshold: spec.permille ? 500 : 50 },
      { phase: 8, threshold: spec.permille ? 800 : 80 },
    ],
    eligibility: [{ kind: 'actor' as const, actorId: servant.id }],
    capacity: { default: capacity, maximum: capacity, traitOverrides: [] },
  };
  const modifier = {
    kind: 'damageModifier' as const,
    modifier: 'attackBuff' as const,
    sign: 1 as const,
    card: null,
    route: {
      target: 'sourceSelf' as const,
      contributionScope: 'personal' as const,
      eligibility: {
        kind: 'requiredRecipient' as const,
        recipient: 'attacker' as const,
        onMissing: 'ignore' as const,
        onMismatch: 'ignore' as const,
      },
    },
    values: [[100, 100, 100, 100, 100, 100, 100, 100, 100, 100], [], [], [], []],
    valueExpressions: [
      [null, null, null, null, null, null, null, null, null, null],
      [],
      [],
      [],
      [],
    ],
    semanticSupport: 'supported' as const,
  };
  const effect = {
    ...template,
    gameActivation: 'skillUse' as const,
    triggerScope: null,
    interaction: null,
    operationTrigger: null,
    operationReference: null,
    stateIdentity: null,
    proc: { kind: 'guaranteed' as const },
    selection: null,
    inputDefinitions: [],
    requirement: { recipient: 'sourceSelf' as const, expression: { kind: 'always' as const } },
  };
  const skills = spec.groups.map((amounts, index) => ({
    priority: 1,
    name: 'domain preparation fixture',
    detail: '',
    imageKey: null,
    id: `domain-skill-${index}`,
    slot: index + 1,
    resourceRequirement: null,
    effects: [
      {
        ...effect,
        id: `domain-writer-${index}`,
        occurrenceId: `domain-writer-${index}:0`,
        ...(spec.skip
          ? {
              requirement: {
                recipient: 'sourceSelf',
                expression: {
                  kind: 'quantity',
                  quantity: 'battlePointPhase',
                  subjectId: domainId,
                  comparison: 'atLeast',
                  value: 999,
                },
              },
            }
          : {}),
        execution: amounts.length
          ? amounts.map((amount) => ({
              kind: 'resourceMutation',
              resource: 'battlePoint',
              direction: amount > 0 ? 'gain' : 'loss',
              unit: 'fixed',
              recipient: 'sourceSelf',
              amount: {
                kind: 'fixed',
                values: [Array.from({ length: 10 }, () => Math.abs(amount)), [], [], [], []],
              },
              subjectId: domainId,
            }))
          : [modifier],
      },
    ],
  }));
  const groups = servant.noblePhantasmVariantGroups.map((group) => ({
    ...group,
    variants: group.variants.map((variant) =>
      variant.kind !== 'attack'
        ? variant
        : {
            ...variant,
            effects: [
              {
                ...effect,
                id: 'domain-terminal-reader',
                occurrenceId: 'domain-terminal-reader:0',
                gameActivation: 'npBeforeDamage',
                timing: 'beforeDamage',
                requirement: {
                  recipient: 'sourceSelf',
                  expression: {
                    kind: 'quantity',
                    quantity: 'battlePointPhase',
                    subjectId: domainId,
                    comparison: 'atLeast',
                    value: 5,
                  },
                },
                execution: [
                  {
                    ...modifier,
                    values: missingNpCell
                      ? modifier.values
                      : Array.from({ length: 5 }, () => [...modifier.values[0]!]),
                    valueExpressions: missingNpCell
                      ? modifier.valueExpressions
                      : Array.from({ length: 5 }, () => [...modifier.valueExpressions[0]!]),
                  },
                ],
              },
            ],
            damage: variant.damage.map((damage) => ({
              ...damage,
              kind: 'battlePointPhase',
              rawFunctionType: 'damageNpBattlePointPhase',
              maximumBattlePointPhase: spec.maximum ?? 10,
              parametersByOvercharge: damage.parametersByOvercharge.map((row) =>
                row.map((cell) => ({
                  ...cell,
                  targetId: Number(domainId),
                  secondaryValuePermille: 1000,
                  correctionPermille: 100,
                })),
              ),
            })),
          },
    ),
  }));
  const failSkill = skills.at(-1)!;
  const failEffect = {
    ...effect,
    id: 'attempt-failure',
    occurrenceId: 'attempt-failure:0',
    execution:
      spec.failure === 'invalid'
        ? [
            {
              kind: 'resourceMutation',
              resource: 'battlePoint',
              direction: 'gain',
              unit: 'fixed',
              recipient: 'sourceSelf',
              amount: { kind: 'fixed', values: [[], [], [], [], []] },
              subjectId: domainId,
            },
          ]
        : spec.failure === 'unsupported'
          ? [
              {
                kind: 'unsupported',
                route: modifier.route,
                reason: 'ocExecutionSemantics',
                damageRelevant: true,
              },
            ]
          : [
              {
                kind: 'grantOcBoost',
                route: modifier.route,
                lifetime: 'active',
                stacking: 'additive',
                stateTraits: ['positive'],
                cells: Array.from({ length: 5 }, () =>
                  Array.from({ length: 10 }, () => ({
                    stages: 1,
                    applicationRatePermille: 500,
                    turns: { kind: 'unlimited' },
                    uses: { kind: 'finite', remaining: 1 },
                  })),
                ),
              },
            ],
  };
  const selectedWriters = spec.choice
    ? failSkill.effects.flatMap((writer) => [
        {
          ...writer,
          selection: { kind: 'playerChoice', group: { key: 'bp-choice', candidate: 'selected' } },
          requirement: {
            recipient: 'sourceSelf',
            expression: { kind: 'choice', family: 'bp-choice', candidate: 'selected' },
          },
        },
        {
          ...writer,
          id: 'unselected-writer',
          occurrenceId: 'unselected-writer:0',
          selection: { kind: 'playerChoice', group: { key: 'bp-choice', candidate: 'other' } },
          requirement: {
            recipient: 'sourceSelf',
            expression: { kind: 'choice', family: 'bp-choice', candidate: 'other' },
          },
          execution: writer.execution.map((operation) => ({ ...operation, subjectId: '810001' })),
        },
      ])
    : failSkill.effects;
  const failEffects = spec.early
    ? [failEffect, ...selectedWriters]
    : [...selectedWriters, failEffect];
  const failedSkills = skills.map((skill) =>
    skill === failSkill ? { ...skill, effects: failEffects } : skill,
  );
  return masterSnapshotSchema.parse({
    ...base,
    battlePointDomains: [domain, { ...domain, id: '810001' }],
    servants: [
      {
        ...servant,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map(({ id }) => id),
            passiveIds: [],
          })),
        },
        skills: failedSkills,
        passives: [],
        battlePointDomains: [domain, { ...domain, id: '810001' }],
        noblePhantasmVariantGroups: groups,
      },
    ],
  });
}

const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  masterDataVersion: 'fixture',
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
function run(
  master: MasterDataSnapshot,
  spec: Spec,
  capture = true,
  policy: 'calculator' | 'ranking' = 'calculator',
  declaredInputs: Readonly<Record<string, number>> = {},
) {
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined),
    battleState: { battlePointPhase: spec.phase ?? null },
    canonicalInputValues: Object.fromEntries(
      Object.entries(declaredInputs).map(([key, value]) => [
        key,
        { kind: 'integer' as const, value },
      ]),
    ),
    ...(spec.phase === undefined
      ? { initialBattlePointPoints: { '810000': spec.initial, '810001': 10 } }
      : {}),
    preNoblePhantasmPlan: [
      ...master.servants[0]!.skills.map((skill) => ({
        kind: 'useSkillSlot' as const,
        slot: skill.slot,
        skillLevel: 10,
        choice:
          spec.choice && skill.slot === master.servants[0]!.skills.at(-1)!.slot
            ? { groupKey: 'bp-choice', candidateKey: 'selected' }
            : null,
      })),
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    policy === 'calculator'
      ? { kind: 'calculator' }
      : {
          kind: 'ranking',
          conditionalEffects: 'baseline',
          selfBuffs: 'included',
          areaView: 'included',
        },
    {},
    capture,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const result = evaluatePreparedCalculationResult(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const program = battlePointPreparationAttemptProgram(prepared, calculation);
  if (!program) throw new Error('canonical attempt program required');
  const source = battlePointPreparationAttemptSource(program);
  return {
    master,
    result,
    program,
    source,
    gate: auditBattlePointPreparationAttemptObservations({
      expected: [program],
      observations: [source],
    }),
  };
}
type Mutable<T> = T extends
  | BattlePointPreparationAttemptSource['program']
  | BattlePointPreparationAttemptSource['prepared']
  | BattlePointPreparationAttemptSource['calculation']
  ? T
  : T extends ReadonlySet<infer U>
    ? Set<U>
    : T extends ReadonlyMap<infer K, infer V>
      ? Map<K, V>
      : T extends object
        ? { -readonly [K in keyof T]: Mutable<T[K]> }
        : T;
type Source = Mutable<BattlePointPreparationAttemptSource>;

it('rejects empty audit identities before comparing owned BP projections and permits repair', () => {
  const spec = specs[1]!;
  const entry = run(fixtureMaster(spec), spec);
  const identity = entry.program.canonicalIdentity;
  entry.program.canonicalIdentity = '';
  try {
    expect(() =>
      auditBattlePointPreparationAttemptObservations({
        expected: [entry.program],
        observations: [entry.source],
      }),
    ).toThrow('empty_canonical_audit_identity:expected');
  } finally {
    entry.program.canonicalIdentity = identity;
  }
  expect(
    auditBattlePointPreparationAttemptObservations({
      expected: [entry.program],
      observations: [entry.source],
    }).status,
  ).toBe('passed');
});

it('compares a complete native rejection and rejects changed rollback, commit, quantity, and proof clocks', () => {
  const spec = specs[1]!;
  const source = run(fixtureMaster(spec), spec).source;
  const receipt = source.capture!.transitions.at(-1)!.result;
  expect(receipt.status).toBe('rejected');
  expect(receipt.state).toBe(receipt.before);
  expect(receipt.committedSources).toEqual([]);
  const restored = decodeDiagnostic(encodeDiagnostic(receipt)) as typeof receipt;
  expect(equalProductionAuditDiagnosticValues(receipt, restored)).toBe(true);
  // The independent Node oracle stays bounded to this single native result.
  expect(isDeepStrictEqual(receipt, restored)).toBe(true);
  type MutableReceipt = { -readonly [K in keyof typeof receipt]: (typeof receipt)[K] };
  const changed = (mutate: (value: MutableReceipt) => void) => {
    const value = structuredClone({ ...restored });
    mutate(value);
    expect(equalProductionAuditDiagnosticValues(receipt, value)).toBe(false);
    expect(isDeepStrictEqual(receipt, value)).toBe(false);
  };
  changed((value) => {
    value.state = { ...value.state, terminated: !value.state.terminated };
  });
  changed((value) => {
    expect(value.sources.length).toBeGreaterThan(0);
    value.committedSources = [value.sources[0]!];
  });
  changed((value) => {
    mutableAuditView(value.state.npResource).gauge++;
  });
  changed((value) => {
    const sourceExecution = value.sources.find(({ binding }) => binding.activation.kind === 'read');
    expect(sourceExecution).toBeDefined();
    const activation = sourceExecution!.binding.activation;
    expect(activation.kind).toBe('read');
    if (activation.kind !== 'read') throw new TypeError('fixture_source_read_required');
    expect(activation.read.clock.phase).toBe('sourceUse');
    if (!sourceExecution) throw new TypeError('fixture_source_execution_required');
    const mutableSource = sourceExecution as { binding: typeof sourceExecution.binding };
    mutableSource.binding = {
      ...sourceExecution.binding,
      activation: {
        ...activation,
        read: {
          ...activation.read,
          clock: { ...activation.read.clock, phase: 'damageEvaluation' },
        },
      },
    };
  });
  const missing = { ...restored } as Record<string, unknown>;
  delete missing['observations'];
  expect(equalProductionAuditDiagnosticValues(receipt, missing)).toBe(false);
  expect(isDeepStrictEqual(receipt, missing)).toBe(false);
});

it('rejects the original missing NP modifier cell and distinguishes an explicit zero cell', () => {
  const spec = specs.find(({ name }) => name === 'loss-input-required')!;
  const originalMaster = fixtureMaster(spec, true);
  const pending = run(originalMaster, spec);
  const pendingResult = pending.source.calculation.result;
  if (
    pendingResult.status !== 'inputRequired' ||
    pending.source.prepared.scenario.mode !== 'resolved'
  )
    throw new TypeError('fixture_proc_input_required');
  const definition = pendingResult.requiredInputs.find(({ key }) => key.startsWith('oc:proc:'))!;
  const scenario = {
    ...pending.source.prepared.scenario,
    canonicalInputValues: {
      ...pending.source.prepared.scenario.canonicalInputValues,
      [definition.key]: { kind: 'integer' as const, value: 1 },
    },
  };
  const missing = prepareCalculationScenarioWithPolicy(scenario, originalMaster, {
    kind: 'calculator',
  });
  expect(missing.outcome.status).toBe('unsupported');
  expect(
    missing.orderedExecution?.operations.find(
      ({ operation }) =>
        operation.kind === 'preserveSemanticEffect' && operation.semanticKind === 'unsupported',
    ),
  ).toMatchObject({
    outcome: 'unsupported',
    conditionRead: { kind: 'known', truth: true, clock: { phase: 'sourceUse' } },
    operation: { unsupportedReason: 'missingOperationValue' },
  });
  const zeroMaster = structuredClone(originalMaster);
  const modifier =
    zeroMaster.servants[0]!.noblePhantasmVariantGroups[0]!.variants[0]!.effects[0]!.execution[0]!;
  if (modifier.kind !== 'damageModifier') throw new TypeError('fixture_modifier_required');
  modifier.values[1] = [0, 0, 0, 0, 0];
  modifier.valueExpressions[1] = [null, null, null, null, null];
  const zero = prepareCalculationScenarioWithPolicy(scenario, zeroMaster, { kind: 'calculator' });
  expect(zero.outcome.status).toBe('calculated');
  expect(zero.orderedExecution?.input.attackBuff).toBe(0);
  const ranking = prepareCalculationScenarioWithPolicy(
    pending.source.prepared.scenario,
    originalMaster,
    {
      kind: 'ranking',
      selfBuffs: 'included',
      conditionalEffects: 'baseline',
      areaView: 'included',
    },
  );
  expect(ranking.outcome.status).toBe('unsupported');
  expect(ranking.possibilityCertificate.kind).toBe('enumerated');
  if (ranking.possibilityCertificate.kind !== 'enumerated')
    throw new TypeError('fixture_certificate_required');
  expect(
    ranking.possibilityCertificate.branches.map(({ average }) => average === null).sort(),
  ).toEqual([false, true]);
});

it('requires retained Map and Set order even where the Node value comparison permits reordering', () => {
  for (const [expected, reordered] of [
    [new Set(['first', 'second']), new Set(['second', 'first'])],
    [
      new Map([
        ['first', 1],
        ['second', 2],
      ]),
      new Map([
        ['second', 2],
        ['first', 1],
      ]),
    ],
  ]) {
    expect(isDeepStrictEqual(expected, reordered)).toBe(true);
    expect(equalProductionAuditDiagnosticValues(expected, reordered)).toBe(false);
    expect(
      equalProductionAuditDiagnosticValues(expected, decodeDiagnostic(encodeDiagnostic(expected))),
    ).toBe(true);
  }
});

for (const spec of specs)
  it(
    `isolates original failed BP attempt ${spec.name}`,
    productionAuditTestOptions([`audit-preparation-bp-attempt-${spec.name}.json`]),
    async ({ task }) => {
      const master = fixtureMaster(spec);
      const positive = run(master, spec),
        normal = run(master, spec, false),
        ranking = run(master, spec, true, 'ranking');
      const negatives: {
        name: string;
        group: string;
        reason: BattlePointPreparationAttemptFailureReason;
        path: string;
        gate: ReturnType<typeof auditBattlePointPreparationAttemptObservations>;
        transport: unknown;
      }[] = [];
      const add = (
        group: string,
        name: string,
        reason: BattlePointPreparationAttemptFailureReason,
        path: string,
        mutate: (s: Source) => void,
      ) => {
        const { program, ...transport } = positive.source;
        const s = { ...structuredClone(transport), program } as Source;
        mutate(s);
        negatives.push({
          name,
          group,
          reason,
          path,
          gate: auditBattlePointPreparationAttemptObservations({
            expected: [positive.program],
            observations: [s as unknown as BattlePointPreparationAttemptSource],
          }),
          transport: {
            programIdentity: s.program.canonicalIdentity,
            prepared: s.prepared,
            calculation: s.calculation,
            capture: s.capture,
          },
        });
      };
      const addProgram = (
        name: string,
        reason: BattlePointPreparationAttemptFailureReason,
        path: string,
        mutate: (p: typeof positive.program) => void,
      ) => {
        const saved = { ...positive.program };
        try {
          mutate(positive.program);
          negatives.push({
            name,
            group: 'missing',
            reason,
            path,
            gate: auditBattlePointPreparationAttemptObservations({
              expected: [positive.program],
              observations: [positive.source],
            }),
            transport: {
              canonicalIdentity: positive.program.canonicalIdentity,
              expected: structuredClone(positive.program.expected),
              contract: structuredClone(positive.program.contract),
              owner: structuredClone(positive.program.owner),
            },
          });
        } finally {
          Object.assign(positive.program, saved);
        }
      };
      addProgram('expected-writers', 'attemptCanonicalMismatch', 'canonical.contract', (p) => {
        p.expected = { ...p.expected, writers: [] };
      });
      addProgram('expected-command', 'attemptCanonicalMismatch', 'canonical.contract', (p) => {
        p.expected = { ...p.expected, actions: [] };
      });
      addProgram('expected-contract', 'attemptCanonicalMismatch', 'canonical.seal', (p) => {
        p.contract = null;
      });
      addProgram('expected-owner', 'attemptStateMismatch', 'transport.seal', (p) => {
        p.owner = null;
      });
      addProgram('expected-identity', 'attemptIdentityMismatch', 'canonical.identity', (p) => {
        p.canonicalIdentity = 'wrong';
      });
      addProgram('expected-master', 'attemptCanonicalMismatch', 'canonical.owner', (p) => {
        p.prepared = { ...p.prepared, master: { ...p.prepared.master, servants: [] } };
      });
      addProgram(
        'expected-capture',
        'attemptIdentityMismatch',
        'transport.captureReference',
        (p) => {
          p.capture = undefined;
        },
      );
      const failedIndex = spec.groups.length - 1;
      const failed = (s: Source) => s.capture!.transitions[failedIndex]!;
      const attempt = (s: Source) => failed(s).attempts![0]!;
      add('missing', 'capture', 'attemptTransportMissing', 'transport.capture', (s) => {
        s.capture = undefined;
      });
      add('missing', 'native', 'attemptNativeMismatch', 'native.result', (s) => {
        delete attempt(s).native;
      });
      add('missing', 'attempt', 'attemptTransportMissing', 'native.attempt', (s) => {
        failed(s).attempts = [];
      });
      add('missing', 'rejection', 'attemptTransportMissing', 'rejection.outcome', (s) => {
        delete s.capture!.rejection;
      });
      add('missing', 'transitions', 'attemptRejectionMismatch', 'rejection.transition', (s) => {
        s.capture!.transitions = [];
      });
      add('identity-order', 'command', 'attemptOrderMismatch', 'transition.commandPrefix', (s) => {
        failed(s).command = { kind: 'executeAttackNoblePhantasm' };
      });
      add('identity-order', 'action', 'attemptIdentityMismatch', 'native.actionId', (s) => {
        attempt(s).actionId = 'wrong';
      });
      add('identity-order', 'source', 'attemptIdentityMismatch', 'native.sourceIdentity', (s) => {
        attempt(s).sources[0]!.sourceInstanceId = 'wrong';
      });
      add('identity-order', 'native-reason', 'attemptNativeMismatch', 'native.result', (s) => {
        const n = attempt(s).native!;
        if (n.status !== 'committed') n.reason = 'wrong';
      });
      add('identity-order', 'prefix', 'attemptOrderMismatch', 'native.prefix', (s) => {
        attempt(s).reached[0]!.index = 5;
      });
      add('identity-order', 'prefix-reverse', 'attemptOrderMismatch', 'native.prefix', (s) => {
        attempt(s).reached.reverse();
      });
      add('identity-order', 'prefix-duplicate', 'attemptOrderMismatch', 'native.prefix', (s) => {
        attempt(s).reached.push(attempt(s).reached[0]!);
      });
      add(
        'identity-order',
        'occurrence',
        'attemptIdentityMismatch',
        'native.sourceIdentity',
        (s) => {
          attempt(s).sources[0]!.effect.occurrenceId = 'wrong';
        },
      );
      add('identity-order', 'source-missing', 'attemptCanonicalMismatch', 'native.sources', (s) => {
        attempt(s).sources.pop();
      });
      add('state', 'returned-attempt', 'attemptStateMismatch', 'native.retainedState', (s) => {
        attempt(s).returned!.battlePoints = structuredClone(attempt(s).attempted!);
        if (spec.boundary)
          attempt(s).returned!.battlePoints.actors.attacker!.domains['810000'] = {
            kind: 'present',
            point: 999,
            capacity: 100,
            capacityModifiers: [],
          };
      });
      add('state', 'reducer-state', 'attemptStateMismatch', 'rejection.battlePoints', (s) => {
        failed(s).result.state = structuredClone(failed(s).before);
        const b = failed(s).result.state.battlePoints.actors.attacker!.domains['810000']!;
        if (b.kind === 'present') b.point = 999;
      });
      add(
        'commit-downstream',
        'native-commit',
        'attemptNativeMismatch',
        'native.nonCommit',
        (s) => {
          const n = attempt(s).native!;
          (n as { status: string }).status = 'committed';
        },
      );
      add('commit-downstream', 'executed', 'attemptCommitLeak', 'native.executedEffects', (s) => {
        attempt(s).returned!.battlePoints = structuredClone(attempt(s).returned!.battlePoints);
        attempt(s).returned!.battlePoints.executedEffects.push('failed');
      });
      add(
        'commit-downstream',
        'commit-marker',
        'attemptCommitLeak',
        'native.committedAction',
        (s) => {
          attempt(s).native!.state.committedActions.add(attempt(s).actionId);
        },
      );
      add('commit-downstream', 'outcomes', 'attemptCommitLeak', 'native.outcomes', (s) => {
        attempt(s).native!.outcomes.push({ step: 0, outcome: 'applied' });
      });
      add(
        'commit-downstream',
        'ordered',
        'attemptDownstreamLeak',
        'downstream.orderedScenario',
        (s) => {
          (s.prepared as unknown as { orderedScenario: object }).orderedScenario = {};
        },
      );
      add(
        'commit-downstream',
        'inputs',
        'attemptDownstreamLeak',
        'downstream.canonicalInputs',
        (s) => {
          (s.prepared as unknown as { canonicalInputs: object }).canonicalInputs = {};
        },
      );
      add(
        'commit-downstream',
        'execution',
        'attemptDownstreamLeak',
        'downstream.executionObservation',
        (s) => {
          s.calculation.executionObservation = { battlePointWitness: null, targetExecution: null };
        },
      );
      add('commit-downstream', 'damage-input', 'attemptDownstreamLeak', 'downstream.input', (s) => {
        (s.calculation as unknown as { input: object }).input = {};
      });
      add(
        'commit-downstream',
        'calculated',
        'attemptResultMismatch',
        'result.notCalculated',
        (s) => {
          (s.calculation.result as { status: string }).status = 'calculated';
        },
      );
      add('result', 'failure-code', 'attemptRejectionMismatch', 'rejection.code', (s) => {
        s.capture!.rejection!.rejection.code = 'skillSlotUnavailable';
      });
      add(
        'result',
        'required-input',
        'attemptRejectionMismatch',
        'resolved.requiredInputs',
        (s) => {
          s.prepared.resolved.requiredInputs = [{ key: 'wrong' } as never];
        },
      );
      add('result', 'trace', 'attemptResultMismatch', 'result.trace', (s) => {
        if ('trace' in s.calculation.result) s.calculation.result.trace = [];
      });
      add('missing', 'master', 'attemptCanonicalMismatch', 'canonical.observed', (s) => {
        s.prepared.master = { ...s.prepared.master, servants: [] };
      });
      add('missing', 'command-plan', 'attemptCanonicalMismatch', 'canonical.observed', (s) => {
        if (s.prepared.scenario.mode === 'resolved') s.prepared.scenario.preNoblePhantasmPlan = [];
      });
      add('missing', 'typed-result', 'attemptTransportMissing', 'transport.result', (s) => {
        delete (s.calculation as unknown as { result?: unknown }).result;
      });
      add('missing', 'start', 'attemptTransportMissing', 'native.startState', (s) => {
        delete (attempt(s) as unknown as { start?: unknown }).start;
      });
      add('missing', 'write-list', 'attemptTransportMissing', 'native.writeList', (s) => {
        delete (attempt(s) as unknown as { writes?: unknown }).writes;
      });
      add('missing', 'reached-list', 'attemptTransportMissing', 'native.reachedList', (s) => {
        delete (attempt(s) as unknown as { reached?: unknown }).reached;
      });
      add('missing', 'origin-list', 'attemptTransportMissing', 'native.originList', (s) => {
        delete (attempt(s) as unknown as { stepOrigins?: unknown }).stepOrigins;
      });
      add('missing', 'source-list', 'attemptTransportMissing', 'native.sourceList', (s) => {
        delete (attempt(s) as unknown as { sources?: unknown }).sources;
      });
      add('identity-order', 'candidate', 'attemptResultMismatch', 'result.scenario', (s) => {
        s.calculation.scenario = { ...s.calculation.scenario, mode: 'manual' } as never;
      });
      add(
        'identity-order',
        'prepared-scenario',
        'attemptCanonicalMismatch',
        'canonical.observed',
        (s) => {
          if (s.prepared.scenario.mode === 'resolved')
            s.prepared.scenario.attacker.servantId = 'wrong';
        },
      );
      add(
        'identity-order',
        'native-step-origin',
        'attemptIdentityMismatch',
        'native.stepOrigins',
        (s) => {
          attempt(s).stepOrigins[0]!.operationIndex = 99;
        },
      );
      add(
        'identity-order',
        'native-step-duplicate',
        'attemptIdentityMismatch',
        'native.stepOrigins',
        (s) => {
          attempt(s).stepOrigins.push(attempt(s).stepOrigins[0]!);
        },
      );
      add('state', 'attempted-missing', 'attemptStateMismatch', 'native.attempted', (s) => {
        delete attempt(s).attempted;
      });
      add('state', 'stale-other-domain', 'attemptStateMismatch', 'native.retainedState', (s) => {
        attempt(s).returned!.battlePoints = structuredClone(attempt(s).returned!.battlePoints);
        const domains = attempt(s).returned!.battlePoints.actors.attacker!.domains;
        domains['810000'] = domains['810001']!;
        if (spec.retained === 10) {
          const b = domains['810000'];
          if (b.kind === 'present') b.point = 20;
        }
      });
      add(
        'commit-downstream',
        'applied-action',
        'attemptCommitLeak',
        'result.appliedActions',
        (s) => {
          s.calculation.appliedPreparationActions = [{} as never];
        },
      );
      add(
        'commit-downstream',
        'fake-effect',
        'attemptDownstreamLeak',
        'downstream.effects',
        (s) => {
          s.calculation.effects = [{} as never];
        },
      );
      add(
        'commit-downstream',
        'fake-contribution',
        'attemptDownstreamLeak',
        'downstream.contributions',
        (s) => {
          s.calculation.effectiveContributions.contributions = [{} as never];
        },
      );
      add(
        'commit-downstream',
        'phase-conversion',
        'attemptDownstreamLeak',
        'downstream.phaseConversion',
        (s) => {
          s.capture!.damageInputGenerated = {} as never;
        },
      );
      add(
        'commit-downstream',
        'ordered-preparation',
        'attemptDownstreamLeak',
        'downstream.orderedPreparation',
        (s) => {
          s.capture!.orderedScenario = {} as never;
        },
      );
      add(
        'commit-downstream',
        'ordered-execution',
        'attemptDownstreamLeak',
        'downstream.orderedExecution',
        (s) => {
          s.capture!.orderedExecution = {} as never;
        },
      );
      add('result', 'typed-status-contradiction', 'attemptResultMismatch', 'result.owner', (s) => {
        (s.calculation.result as { status: string }).status =
          s.calculation.result.status === 'inputRequired' ? 'unsupported' : 'inputRequired';
      });
      add(
        'result',
        'reducer-code-contradiction',
        'attemptRejectionMismatch',
        'rejection.code',
        (s) => {
          const r = failed(s).result;
          if (r.status === 'rejected') r.code = 'skillSlotUnavailable';
        },
      );
      add(
        'result',
        'required-input-contradiction',
        'attemptRejectionMismatch',
        'rejection.requiredInputs',
        (s) => {
          const r = failed(s).result;
          if (r.status === 'rejected') {
            r.requiredInput = { key: 'wrong' } as never;
            r.requiredInputEffectOccurrenceId = 'wrong';
          }
        },
      );
      add(
        'identity-order',
        'program-reference',
        'attemptIdentityMismatch',
        'transport.program',
        (s) => {
          s.program = { ...s.program };
        },
      );
      add(
        'missing',
        'calculation-object',
        'attemptTransportMissing',
        'transport.calculationObject',
        (s) => {
          delete (s as unknown as { calculation?: unknown }).calculation;
        },
      );
      add(
        'missing',
        'prepared-object',
        'attemptTransportMissing',
        'transport.preparedObject',
        (s) => {
          delete (s as unknown as { prepared?: unknown }).prepared;
        },
      );
      add('missing', 'transition-list', 'attemptTransportMissing', 'transition.list', (s) => {
        delete (s.capture as unknown as { transitions?: unknown }).transitions;
      });
      add(
        'identity-order',
        'source-value-index',
        'attemptIdentityMismatch',
        'native.sourceIdentity',
        (s) => {
          attempt(s).sources[0]!.valueIndex = 0;
        },
      );
      add(
        'identity-order',
        'source-skill-id',
        'attemptIdentityMismatch',
        'native.sourceIdentity',
        (s) => {
          attempt(s).sources[0]!.skillId = 'wrong';
        },
      );
      add(
        'identity-order',
        'source-origin',
        'attemptIdentityMismatch',
        'native.sourceIdentity',
        (s) => {
          attempt(s).sources[0]!.origin = 'support';
        },
      );
      add(
        'identity-order',
        'source-owner',
        'attemptIdentityMismatch',
        'native.sourceIdentity',
        (s) => {
          attempt(s).sources[0]!.sourceId = 'wrong';
        },
      );
      add(
        'identity-order',
        'source-order',
        'attemptIdentityMismatch',
        'native.sourceIdentity',
        (s) => {
          attempt(s).sources.reverse();
        },
      );
      add(
        'commit-downstream',
        'post-rejection-command',
        'attemptOrderMismatch',
        'transition.stop',
        (s) => {
          s.capture!.transitions.push({
            ...failed(s),
            command: { kind: 'executeAttackNoblePhantasm' },
            result: {
              status: 'applied',
              state: failed(s).before,
              before: failed(s).before,
              command: { kind: 'executeAttackNoblePhantasm' },
              sources: [],
              committedSources: [],
              observations: { ocAttempts: [], battlePointSteps: [], hpActions: [] },
            },
          });
        },
      );
      if (attempt(positive.source as unknown as Source).writes.length > 1) {
        add(
          'identity-order',
          'writes-reversed',
          'attemptPopulationMismatch',
          'writer.reachedPopulation',
          (s) => {
            attempt(s).writes.reverse();
          },
        );
        add('state', 'intermediate-leak', 'attemptStateMismatch', 'native.retainedState', (s) => {
          attempt(s).returned!.battlePoints = structuredClone(attempt(s).writes[0]!.after);
        });
      }
      if (!spec.early) {
        for (const [i, originalWrite] of attempt(
          positive.source as unknown as Source,
        ).writes.entries()) {
          if (originalWrite.receipts.length === 0) continue;
          add(
            'identity-order',
            `receipt-duplicate-${i}`,
            'attemptStateMismatch',
            `writer.${i}.receipts.owner`,
            (s) => {
              attempt(s).writes[i]!.receipts.push(attempt(s).writes[i]!.receipts[0]!);
            },
          );
          add(
            'commit-downstream',
            `retained-receipt-${i}`,
            'attemptCommitLeak',
            'native.retainedReceipts',
            (s) => {
              attempt(s).returned!.battlePoints = structuredClone(
                attempt(s).returned!.battlePoints,
              );
              attempt(s).returned!.battlePoints.receipts.push(attempt(s).writes[i]!.receipts[0]!);
            },
          );
          for (const key of ['identity', 'actor', 'domainId'] as const)
            add(
              'identity-order',
              `receipt-${i}-${key}`,
              'attemptIdentityMismatch',
              `writer.${i}.receiptIdentity`,
              (s) => {
                attempt(s).writes[i]!.receipts[0]![key] = 'wrong';
              },
            );
          add(
            'identity-order',
            `operation-${i}`,
            'attemptIdentityMismatch',
            `writer.${i}.canonical`,
            (s) => {
              attempt(s).writes[i]!.operationIndex = 99;
            },
          );
          add('state', `after-${i}`, 'attemptStateMismatch', `writer.${i}.after.owner`, (s) => {
            const b = attempt(s).writes[i]!.after.actors.attacker!.domains['810000']!;
            if (b.kind === 'present') b.point = 999;
          });
          add(
            'state',
            `coherent-${i}`,
            'attemptStateMismatch',
            `writer.${i}.receipts.owner`,
            (s) => {
              const w = attempt(s).writes[i]!;
              const b = w.after.actors.attacker!.domains['810000']!;
              if (b.kind === 'present') b.point = 999;
              w.receipts[0]!.after = b;
              attempt(s).attempted = w.after;
            },
          );
          add(
            'missing',
            `receipt-${i}`,
            'attemptStateMismatch',
            `writer.${i}.receipts.owner`,
            (s) => {
              attempt(s).writes[i]!.receipts = [];
            },
          );
        }
        add(
          'identity-order',
          'writes-duplicate',
          'attemptPopulationMismatch',
          'writer.reachedPopulation',
          (s) => {
            attempt(s).writes.push(attempt(s).writes[0]!);
          },
        );
        add('missing', 'write', 'attemptPopulationMismatch', 'writer.reachedPopulation', (s) => {
          attempt(s).writes = [];
        });
      }
      if (spec.groups.length > 1)
        add('state', 'initial-for-action-start', 'attemptStateMismatch', 'native.start', (s) => {
          attempt(s).start.battlePoints = s.capture!.transitions[0]!.before.battlePoints;
        });
      if (spec.failure === 'inputRequired')
        add(
          'result',
          'required-input-definitions',
          'attemptResultMismatch',
          'result.application',
          (s) => {
            s.calculation.inputDefinitions = [];
          },
        );
      add('missing', 'native-oc-state', 'attemptTransportMissing', 'native.ocStateObject', (s) => {
        delete (attempt(s).native as unknown as { state?: unknown }).state;
      });
      add('missing', 'native-status', 'attemptNativeMismatch', 'native.nonCommitStatus', (s) => {
        delete (attempt(s).native as unknown as { status?: unknown }).status;
      });
      for (const [name, expected, observations] of [
        ['missing-population', [positive.program], []],
        ['extra-observation', [], [positive.source]],
        ['duplicate-observation', [positive.program], [positive.source, positive.source]],
      ] as const)
        negatives.push({
          name,
          group: 'missing',
          reason: 'attemptPopulationMismatch',
          path: 'population',
          gate: auditBattlePointPreparationAttemptObservations({ expected, observations }),
          transport: { expected, observations },
        });
      const originalAttempt = positive.source.capture!.transitions[failedIndex]!.attempts![0]!;
      const referenceNegative = (name: string, path: string, mutate: () => () => void) => {
        const restore = mutate();
        try {
          negatives.push({
            name,
            group: 'identity-order',
            reason: 'attemptIdentityMismatch',
            path,
            gate: auditBattlePointPreparationAttemptObservations({
              expected: [positive.program],
              observations: [positive.source],
            }),
            transport: structuredClone({
              prepared: positive.source.prepared,
              calculation: positive.source.calculation,
              capture: positive.source.capture,
            }),
          });
        } finally {
          restore();
        }
      };
      if (originalAttempt.writes.length) {
        const write = originalAttempt.writes[0]!;
        referenceNegative(
          'same-value-original-before-reference',
          'writer.0.beforeReference',
          () => {
            const prior = write.before;
            mutableAuditView(write).before = structuredClone(prior);
            return () => {
              mutableAuditView(write).before = prior;
            };
          },
        );
        if (write.receipts.length)
          referenceNegative(
            'same-value-original-receipt-reference',
            'writer.0.receiptReferences',
            () => {
              const prior = write.receipts;
              mutableAuditView(write).receipts = structuredClone(prior);
              return () => {
                mutableAuditView(write).receipts = prior;
              };
            },
          );
      }
      referenceNegative('same-value-attached-result-reference', 'result.originalReference', () => {
        const prior = positive.source.calculation.result;
        const fake = structuredClone(prior);
        attachBattlePointPreparationRejectionObservation(fake, positive.source.capture!);
        positive.source.calculation.result = fake;
        return () => {
          positive.source.calculation.result = prior;
        };
      });
      const missingPopulation = auditBattlePointPreparationAttemptObservations({
        expected: [positive.program],
        observations: [],
      });
      const actualAttempts = positive.source.capture!.transitions[failedIndex]!.attempts![0]!;
      const points = actualAttempts.writes.flatMap((w) =>
        w.receipts.map((r) => (r.after.kind === 'present' ? r.after.point : null)),
      );
      const retained = actualAttempts.returned!.battlePoints.actors.attacker!.domains['810000'];
      const published = auditPublishedBattlePointPreparationAttempts(
        positive.master,
        [positive.program],
        [positive.source],
      );
      const missingPublished = auditPublishedBattlePointPreparationAttempts(
        { ...positive.master, servants: [] },
        [positive.program],
        [positive.source],
      );
      const required = positive.source.calculation.result;
      const definition =
        required.status === 'inputRequired'
          ? required.requiredInputs.find(({ key }) => key.startsWith('oc:proc:'))
          : undefined;
      const declared =
        (spec.name === 'loss-input-required' || spec.name === 'prior-commit-action-start') &&
        definition
          ? [0, 1].map((value) =>
              run(positive.master, spec, true, 'calculator', { [definition.key]: value }),
            )
          : [];
      const payload = {
        spec,
        positive,
        ranking,
        declaredFixture: { definition: definition ?? null, branches: declared },
        normal: normal.source.calculation,
        negatives,
        missingPopulation,
        published,
        missingPublished,
        points,
        retained,
      };
      const encoded = encodeDiagnostic(payload);
      const roundTrip = equalProductionAuditDiagnosticValues(payload, decodeDiagnostic(encoded));
      await writeProductionAuditArtifact(
        task.meta,
        `audit-preparation-bp-attempt-${spec.name}.json`,
        {
          diagnosticVersion: 1,
          encoding: 'lossless-interned-values',
          spec,
          positiveStatus: positive.gate.status,
          negativeCount: negatives.length,
          roundTrip,
          encoded,
        },
      );
      expect(roundTrip).toBe(true);
      expect(
        positive.gate.status,
        JSON.stringify(positive.gate.failures.map((f) => [f.reason, f.checkPath])),
      ).toBe('passed');
      expect(
        ranking.gate.status,
        JSON.stringify(ranking.gate.failures.map((f) => [f.reason, f.checkPath])),
      ).toBe('passed');
      expect(positive.result).toEqual(positive.source.calculation.result);
      expect(published.status).toBe('passed');
      expect(
        missingPublished.failures.some(
          (f) =>
            f.reason === 'attemptPopulationMismatch' &&
            f.checkPath === 'published.population' &&
            f.firstDifference.path === 'published.population',
        ),
      ).toBe(true);
      expect(positive.source.calculation).toEqual(normal.source.calculation);
      if (spec.name === 'loss-input-required' || spec.name === 'prior-commit-action-start') {
        expect(required.status).toBe('inputRequired');
        expect(definition).toMatchObject({ minimum: 0, maximum: 1, step: 1 });
        expect(declared).toHaveLength(2);
        const certificate = ranking.source.calculation.possibilityCertificate;
        expect(certificate.kind).toBe('enumerated');
        if (certificate.kind !== 'enumerated') throw new TypeError('fixture_enumeration_required');
        expect(certificate.branches).toHaveLength(2);
        expect(certificate.illegalWitnesses).toEqual([]);
        for (const [index, concrete] of declared.entries()) {
          const result = concrete.source.calculation.result;
          expect(result.status).toBe('calculated');
          if (result.status !== 'calculated')
            throw new TypeError('fixture_declared_calculated_required');
          const outcome = index === 0 ? 'failure' : 'success';
          const branch = certificate.branches.find(({ witness }) =>
            witness.some(({ choice }) => choice.kind === 'binary' && choice.outcome === outcome),
          );
          expect(branch).toBeDefined();
          expect(branch!.status).toBe('executable');
          expect(branch!.average).toBe(result.rows[0].average);
          const native = concrete.source.prepared.preparationExecution;
          expect(native).not.toBeNull();
          if (!native) throw new TypeError('fixture_native_preparation_required');
          const nativeReads = [
            ...(native.initializationExecution?.sources ?? []),
            ...(native.actionExecutions ?? []).flatMap(({ sources }) => sources),
          ]
            .filter(({ status }) => status !== 'unreached')
            .map(({ binding }) =>
              binding.activation.kind === 'read' && binding.activation.proc.kind === 'resolved'
                ? {
                    ...binding.activation,
                    proc: { ...binding.activation.proc, selection: 'witness' as const },
                  }
                : binding.activation,
            );
          expect(branch!.sourceReads).toEqual(nativeReads);
          expect(branch!.resourceUses).toEqual(
            concrete.source.calculation.appliedPreparationActions.map((action) => ({
              actorFormId: action.actorFormId,
              before: action.resourceBefore,
              after: action.resourceAfter,
              ocUse: action.ocUse,
            })),
          );
        }
        const selectedOutcome = certificate.selectedWitness.find(
          ({ choice }) => choice.kind === 'binary',
        )!.choice;
        if (selectedOutcome.kind !== 'binary')
          throw new TypeError('fixture_binary_selection_required');
        const selected = declared[selectedOutcome.outcome === 'failure' ? 0 : 1]!;
        const selectedResult = selected.source.calculation.result;
        if (!('trace' in selectedResult)) throw new TypeError('fixture_selected_trace_required');
        const declaration = `${definition!.key}:${selectedOutcome.outcome === 'failure' ? 0 : 1}:explicit`;
        const declarationTrace = selectedResult.trace.filter(
          ({ step, detail }) => step === 'canonical-input' && detail === declaration,
        );
        expect(declarationTrace).toEqual([{ step: 'canonical-input', detail: declaration }]);
        // A declared input and an enumerated witness have distinct provenance.
        // Every other result field and every other trace entry must still agree.
        expect(ranking.source.calculation.result).toEqual({
          ...selectedResult,
          trace: selectedResult.trace.filter((entry) => !declarationTrace.includes(entry)),
        });
        const ordinary = declared.map(({ source }) => {
          const execution = source.prepared.orderedExecution;
          expect(execution).not.toBeNull();
          if (!execution) throw new TypeError('fixture_native_execution_required');
          const nativePreparation = preparationExecutionStateFor(source.prepared.orderedScenario);
          const nativeProof = nativePreparation?.conditionFactProofs.quantities.get(
            'battlePoint:attacker:810000',
          );
          if (!nativePreparation || !nativeProof)
            throw new TypeError('fixture_native_battle_point_proof_required');
          const committedWriter = nativePreparation.battlePoints.receipts.some(
            ({ actor, domainId }) => actor === 'attacker' && domainId === '810000',
          );
          expect(nativeProof).toMatchObject({
            kind: committedWriter ? 'guaranteedWrite' : 'selectedInitialResource',
            clock: { phase: committedWriter ? 'sourceUse' : 'initial' },
          });
          const input = execution.input;
          const np = execution.operations.find(
            ({ operation }) => operation.kind === 'executeNpDamage',
          );
          expect(np?.damageDependencyRead).toMatchObject({
            kind: 'known',
            certainty: 'guaranteed',
            clock: { phase: 'damageEvaluation', operationId: np!.operation.operationId },
            evidence: [
              {
                expression: { kind: 'quantity', quantity: 'battlePointPhase', subjectId: '810000' },
                value: input.battlePointPhase,
              },
            ],
          });
          expect(np!.damageDependencyRead!.support).toEqual([nativeProof]);
          const expectedCell =
            source.prepared.master.servants[0]!.noblePhantasmVariantGroups[0]!.variants[0]!.effects.find(
              ({ occurrenceId }) => occurrenceId === 'domain-terminal-reader:0',
            )!.execution.find((operation) => operation.kind === 'damageModifier');
          if (!expectedCell) throw new TypeError('fixture_modifier_cell_required');
          const value = expectedCell.values[input.overcharge - 1]![input.npLevel - 1]!;
          const reader = execution.operations.find(
            ({ operation }) => operation.source.effectOccurrenceId === 'domain-terminal-reader:0',
          );
          const contributions = source.calculation.effectiveContributions.contributions.filter(
            ({ source }) => source.effectOccurrenceId === 'domain-terminal-reader:0',
          );
          if (!reader || reader.operation.kind !== 'addModifier')
            throw new TypeError('fixture_reader_required');
          expect(value).toBe(100);
          expect(reader.operation.valuePermille).toBe(value);
          expect(reader.conditionRead).toMatchObject({
            kind: 'known',
            certainty: 'guaranteed',
            clock: { phase: 'sourceUse' },
            truth: input.battlePointPhase! >= 5,
          });
          expect(reader.conditionRead.support).toContainEqual(nativeProof);
          expect(contributions).toHaveLength(1);
          expect(contributions[0]).toMatchObject({
            conditionDecision: { kind: 'included' },
            effective: reader.conditionRead.truth === true,
          });
          // Both branches independently read the same declared canonical modifier value.
          return source.calculation.effectiveContributions.contributions.filter(
            ({ effective }) => effective,
          );
        });
        expect(ordinary[0]).toEqual(ordinary[1]);
      } else {
        expect(positive.source.calculation.result).toEqual(ranking.source.calculation.result);
      }
      expect(points).toEqual(spec.attempted);
      expect(retained?.kind === 'present' ? retained.point : null).toBe(spec.retained);
      expect(positive.gate.boundaries[0]?.kind).toBe(
        spec.boundary ? 'unchangedNonCommit' : 'changedNonCommit',
      );
      expect(positive.source.calculation.result.status).toBe(
        spec.failure === 'inputRequired' ? 'inputRequired' : 'unsupported',
      );
      expect(missingPopulation.status).toBe('failed');
      for (const n of negatives) {
        const f = n.gate.failures.find((f) => f.reason === n.reason && f.checkPath === n.path);
        expect(
          f,
          `${spec.name}:${n.name}:${JSON.stringify(n.gate.failures.map((f) => [f.reason, f.checkPath]))}`,
        ).toBeDefined();
        expect(f!.firstDifference.path.startsWith(n.path)).toBe(true);
        expect(f!.firstDifference.identity).toBe(f!.canonicalIdentity);
      }
    },
  );
