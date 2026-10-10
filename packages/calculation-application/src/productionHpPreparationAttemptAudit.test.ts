import { mutableAuditView } from './auditTestMutation';
import { preparationEffectSource } from '../../battle-execution/src/preparationOc';
import { compileOcSourceProgram } from '../../battle-execution/src/ocSourceProgram';
import { ocSourceOperationKey } from '../../battle-execution/src/ocSourceBinding';
import type { PreNoblePhantasmState, StochasticSelection } from '@fgo-lab/battle-execution';
import { it, expect, vi } from 'vitest';
import * as hpOwner from '../../battle-execution/src/preparationHp';
import { equalProductionAuditDiagnosticValues } from './productionAuditDiagnosticEquality';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  evaluatePreparedCalculationResult,
} from './scenario';
import { fixtureMaster, type Spec } from './hpPreparationAttemptFixtures';
import {
  hpPreparationAttemptSelection,
  hpPreparationAttemptSource,
  hpPreparationAttemptProgram,
  hpPreparationAttemptDiagnostic,
  auditHpPreparationAttempts,
  auditPublishedHpPreparationAttempts,
} from './productionHpPreparationAttemptAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeStoredProductionAuditDiagnostic,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';
import {
  battlePointPreparationRejectionObservationFor,
  attachBattlePointPreparationRejectionObservation,
} from './battlePointPreparationObservation';

const specs: Spec[] = [
  {
    name: 'gain',
    initial: 333,
    writes: [[731]],
    final: 4064,
    choice: true,
    failure: 'unsupported',
  },
  {
    name: 'loss',
    initial: 800,
    writes: [[-2345]],
    final: 5663,
    failure: 'unsupported',
    separateFailure: true,
  },
  { name: 'clamp', initial: 900, writes: [[5000]], final: 10010, failure: 'unsupported' },
  {
    name: 'floor',
    initial: 200,
    writes: [[-9000]],
    final: 1,
    floor: 'oneIfAlive',
    omitted: true,
    failure: 'unsupported',
  },
  {
    name: 'multiple',
    initial: 500,
    writes: [[800, -1234, 111]],
    final: 4682,
    failure: 'inputRequired',
  },
  { name: 'prefix', initial: 500, writes: [[1200], [-700, 91]], final: 5596, failure: 'invalid' },
  {
    name: 'source-reset',
    initial: 500,
    writes: [[800]],
    final: 5805,
    failure: 'unsupported',
    separateFailure: true,
    reset: true,
  },
  { name: 'zero-amount', initial: 600, writes: [[0]], final: 6006, failure: 'unsupported' },
  { name: 'full', initial: 1000, writes: [[1000]], final: 10010, failure: 'unsupported' },
  { name: 'dead', initial: 0, writes: [[800]], final: 0, failure: 'unsupported' },
  {
    name: 'disabled',
    initial: 500,
    writes: [[1000]],
    final: 5005,
    disabled: true,
    failure: 'unsupported',
    separateFailure: true,
  },
  { name: 'before', initial: 500, writes: [[800]], final: 5005, failure: 'before' },
  {
    name: 'outside',
    initial: 500,
    writes: [[731, 100]],
    final: 0,
    failure: 'unsupported',
    outside: true,
  },
  { name: 'committed', initial: 500, writes: [[800]], final: 5805, failure: 'none' },
];
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  masterDataVersion: 'fixture',
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;
function run(
  master: ReturnType<typeof fixtureMaster>,
  spec: Spec,
  capture = true,
  ranking = false,
  stochasticSelection?: StochasticSelection,
) {
  const scenario = {
    ...createDefaultResolvedScenario(master, undefined),
    attackerHpPermille: spec.initial,
    explicitOverrides: {},
    preNoblePhantasmPlan: [
      ...master.servants[0]!.skills.map((s) => ({
        kind: 'useSkillSlot' as const,
        slot: s.slot,
        skillLevel: 4,
        choice: spec.choice ? { groupKey: 'hp-choice', candidateKey: 'selected' } : null,
      })),
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
  if (spec.reset) {
    const servant = master.servants[0]!,
      skill = servant.skills.at(-1)!;
    const source = preparationEffectSource({
      servant,
      state: { currentFormId: scenario.attacker.initialActorFormId } as PreNoblePhantasmState,
      effect: skill.effects[0]!,
      origin: 'attacker',
      sourceInstanceId: `attacker:${servant.id}`,
      skillId: skill.id,
      skillName: skill.name,
      valueSetIndex: 0,
      valueIndex: 3,
    });
    scenario.canonicalInputValues = {
      [`oc:proc:${ocSourceOperationKey(compileOcSourceProgram(source), 0)}`]: {
        kind: 'integer',
        value: 0,
      },
    };
  }
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
    stochasticSelection ? { stochasticSelection } : {},
    capture,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const selection = hpPreparationAttemptSelection(prepared, calculation);
  if (!selection) throw new TypeError('hp_attempt_selection_missing');
  const program = hpPreparationAttemptProgram(selection),
    source = hpPreparationAttemptSource(selection);
  const gate = auditHpPreparationAttempts({
    selections: [selection],
    expected: [program],
    observations: [source],
  });
  return { prepared, calculation, selection, program, source, gate };
}
async function save(meta: unknown, path: string, payload: unknown) {
  const encoded = encodeProductionAuditDiagnostic(payload);
  const receipt = await writeProductionAuditArtifact(meta, path, encoded);
  const saved = decodeStoredProductionAuditDiagnostic(
    await readStoredProductionAuditArtifact(path),
  );
  // Compare original values independently of the codec and its alias topology.
  expect(equalProductionAuditDiagnosticValues(payload, saved)).toBe(true);
  return receipt;
}
const parsedMasters = new Map(specs.map((spec) => [spec, fixtureMaster(spec)]));
for (const spec of specs) {
  const path = `hp-attempt-${spec.name}.json`;
  it(`fixed HP attempt ${spec.name}`, productionAuditTestOptions([path]), async ({ task }) => {
    const master = parsedMasters.get(spec)!,
      result = run(master, spec);
    const normal = run(master, spec, false),
      ranking = run(master, spec, true, true);
    const rankingReplay = run(
      master,
      spec,
      false,
      false,
      ranking.prepared.preparation.stochasticSelection,
    );
    const direct = evaluatePreparedCalculationResult(result.prepared, {
      ...versions,
      masterDataVersion: master.version,
    });
    const beforeAudit = structuredClone(hpPreparationAttemptDiagnostic(result.source));
    const repeated = auditHpPreparationAttempts({
      selections: [result.selection],
      expected: [result.program],
      observations: [result.source],
    });
    await save(task.meta, path, {
      spec,
      repeated,
      beforeAudit,
      canonical: result.selection.canonical,
      source: hpPreparationAttemptDiagnostic(result.source),
      gate: result.gate,
      normal: normal.calculation,
      ranking: ranking.calculation,
      rankingReplay: rankingReplay.calculation,
      direct,
    });
    expect(result.gate.status, JSON.stringify(result.gate.firstDifference)).toBe('passed');
    expect(repeated).toEqual(result.gate);
    expect(hpPreparationAttemptDiagnostic(result.source)).toEqual(beforeAudit);
    expect({ ...normal.calculation, executionObservation: undefined }).toEqual({
      ...result.calculation,
      executionObservation: undefined,
    });
    expect(ranking.calculation.result).toEqual(rankingReplay.calculation.result);
    if (spec.failure === 'inputRequired')
      expect(result.calculation.result.status).toBe('inputRequired');
    expect(direct).toEqual(result.calculation.result);
    expect(battlePointPreparationRejectionObservationFor(direct)).toBe(result.source.transport);
    if (spec.outside) {
      expect(result.gate.boundaries[0]!.kind).toBe('outsideScope');
      return;
    }
    if (spec.failure === 'none') {
      expect(result.gate.boundaries[0]!.kind).toBe('committed');
      return;
    }
    const transition = result.source.transitions!.at(-1)!;
    expect(transition.result.state).toBe(transition.before);
    const hp = transition.hpActions[0]!;
    expect(hp.native!.status).not.toBe('committed');
    if (spec.reset) {
      expect(hp.attempted!.hp).toBe(hp.start.hp);
      expect(hp.attempted!.hp).not.toBe(hp.writes.at(-1)!.after);
      expect(hp.returned!.hp!.actors.attacker).toMatchObject({ current: 5005, maximum: 10010 });
    }
    if (spec.name === 'prefix') {
      expect(result.source.transitions![0]!.before.hp!.actors.attacker).toMatchObject({
        current: 5005,
        maximum: 10010,
      });
      expect(transition.before.hp!.actors.attacker).toMatchObject({
        current: 6205,
        maximum: 10010,
      });
      expect(transition.result.state.appliedActions).toHaveLength(1);
    }
    if (
      ['gain', 'loss', 'clamp', 'floor', 'multiple', 'prefix', 'source-reset'].includes(spec.name)
    ) {
      expect(result.gate.boundaries[0]!.kind).toBe('changedNonCommit');
      const receipts = hp.writes.flatMap((w) => w.receipts).filter((r) => r.actual! > 0);
      expect(receipts.length).toBeGreaterThan(0);
      expect(receipts.at(-1)!.after).toMatchObject({ current: spec.final });
    } else expect(result.gate.boundaries[0]!.changed).toBe(0);
  });
}

type Run = ReturnType<typeof run>;
function cloneSource(result: Run) {
  // One cloned graph keeps coherent state/receipt aliases, but cannot replace owner references.
  const { master, selection, ...rest } = result.source;
  const copy = structuredClone({
    ...rest,
    prepared: Object.fromEntries(Object.entries(rest.prepared).filter(([key]) => key !== 'master')),
  });
  const source = {
    ...copy,
    master,
    selection,
    prepared: { ...copy.prepared, master },
  } as typeof result.source;
  for (const owner of [source.prepared, source.calculation, source.result])
    if (source.transport) attachBattlePointPreparationRejectionObservation(owner, source.transport);
  return source;
}
const seenMutationFields = new WeakMap<object, Set<string>>();
function paths(value: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (!value || typeof value !== 'object' || value instanceof Set || value instanceof Map)
    return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const seen = seenMutationFields.get(value) ?? new Set<string>();
    if (seen.has(key)) return [];
    seen.add(key);
    seenMutationFields.set(value, seen);
    const p = [...prefix, Array.isArray(value) ? Number(key) : key];
    const stop =
      [
        'atlasEvidence',
        'activeEffects',
        'activationFacts',
        'buffInstances',
        'populationEvents',
        'damage',
        'naturalNps',
        'naturalReaders',
        'resolved',
        'trace',
        'npGaugeProjection',
        'effects',
        'contributions',
        'uses',
        'noblePhantasmVariantGroups',
      ].includes(key) ||
      (key === 'effect' && prefix.includes('selectedEffects'));
    return [p, ...(stop ? [] : paths(item, p))];
  });
}
function parent(value: unknown, path: (string | number)[]): object {
  let node = value;
  for (const key of path.slice(0, -1)) node = Reflect.get(node as object, key);
  return node as object;
}
const groups = [
  'canonical',
  'hpActions',
  'attempts',
  'transport',
  'prepared',
  'calculation',
] as const;
const negativeSpec = specs[5]!;
const negativeMaster = parsedMasters.get(negativeSpec)!;
const negativeResult = run(negativeMaster, negativeSpec);
it('HP attempt owns diagnostics across caller mutations and repairs', () => {
  const source = cloneSource(negativeResult);
  const input = {
    selections: [negativeResult.selection],
    expected: [negativeResult.program],
    observations: [source],
  };
  const baseline = auditHpPreparationAttempts(input);
  const receipt = source.hpActions![1]![0]!.writes[0]!.receipts[0]!;
  const original = receipt.actual!;
  const checkPath = 'owner.hpActions.1.0.writes.0.receipts.0.actual';
  Reflect.set(receipt, 'actual', original + 1);
  const first = auditHpPreparationAttempts(input);
  Reflect.set(receipt, 'actual', original + 2);
  const second = auditHpPreparationAttempts(input);
  expect(first.failures.find((f) => f.checkPath === checkPath)?.actual).toBe(original + 1);
  expect(second.failures.find((f) => f.checkPath === checkPath)?.actual).toBe(original + 2);
  Reflect.set(receipt, 'actual', original);
  expect(equalProductionAuditDiagnosticValues(auditHpPreparationAttempts(input), baseline)).toBe(
    true,
  );
  expect(first.failures.find((f) => f.checkPath === checkPath)?.actual).toBe(original + 1);
});
for (const group of groups) {
  const candidates = paths(negativeResult.source[group]).filter(
    (p) => !p.includes('atlasEvidence') && !p.includes('master'),
  );
  const cases = [[], ...candidates];
  for (let offset = 0; offset < cases.length; offset += 1) {
    const path = `hp-attempt-negative-${group}-${offset}.json`;
    it(
      `HP noncommit rejects missing and altered ${group} ${offset}`,
      productionAuditTestOptions([path]),
      async ({ task }) => {
        const result = negativeResult;
        const negatives = [];
        // Group roots and every nested field/cell are independently denied; no success filters.
        for (const p of cases.slice(offset, offset + 1)) {
          const source = cloneSource(result);
          const full = [group, ...p];
          const container = parent(source, full),
            key = full.at(-1)!;
          if (Array.isArray(container) && typeof key === 'number') container.splice(key, 1);
          else Reflect.deleteProperty(container, key);
          const gate = auditHpPreparationAttempts({
            selections: [result.selection],
            expected: [result.program],
            observations: [source],
          });
          negatives.push({ mutation: full, source: hpPreparationAttemptDiagnostic(source), gate });
        }
        await save(task.meta, path, {
          canonical: result.selection.canonical,
          expected: result.program.owner,
          negatives,
        });
        for (const negative of negatives) {
          expect(negative.gate.status).toBe('failed');
          const invalidDiagnostics: { checkPath: string; reason: string }[] = [];
          for (const failure of negative.gate.failures) {
            const diff = firstCanonicalAuditDifference(
              [{ identity: failure.identity, value: failure.expected }],
              [{ identity: failure.identity, value: failure.actual }],
            )!;
            const expectedDifference = {
              ...diff,
              path: diff.path ? `${failure.checkPath}.${diff.path}` : failure.checkPath,
            };
            if (
              !equalProductionAuditDiagnosticValues(failure.firstDifference, expectedDifference) ||
              !/^hpAttempt/.test(failure.reason)
            )
              invalidDiagnostics.push({ checkPath: failure.checkPath, reason: failure.reason });
          }
          expect(invalidDiagnostics).toEqual([]);
          expect(negative.gate.failures.some((f) => f.checkPath.startsWith(`owner.${group}`))).toBe(
            true,
          );
        }
      },
    );
  }
}
it(
  'HP attempt published population cannot be success filtered',
  productionAuditTestOptions(['hp-attempt-published.json']),
  async ({ task }) => {
    const spec = specs[0]!,
      master = fixtureMaster(spec),
      result = run(master, spec);
    const requests = [{ prepared: result.prepared, calculation: result.calculation }];
    const good = auditPublishedHpPreparationAttempts(
      master,
      requests,
      [result.selection],
      [result.program],
      [result.source],
    );
    const filtered = auditPublishedHpPreparationAttempts(master, requests, [], [], []);
    const missing = auditPublishedHpPreparationAttempts(
      { ...master, servants: [] },
      requests,
      [result.selection],
      [result.program],
      [result.source],
    );
    const duplicate = auditHpPreparationAttempts({
      selections: [result.selection, result.selection],
      expected: [result.program],
      observations: [result.source],
    });
    await save(task.meta, 'hp-attempt-published.json', { good, filtered, missing, duplicate });
    expect(good.status).toBe('passed');
    expect(filtered.failures.some((f) => f.checkPath === 'published.requests')).toBe(true);
    expect(missing.failures.some((f) => f.checkPath === 'published.declarations')).toBe(true);
    expect(duplicate.failures.some((f) => f.checkPath === 'population.unique')).toBe(true);
  },
);

it(
  'HP attempt denies coherent changes, stale retention, alien execution and fabricated downstream',
  productionAuditTestOptions(['hp-attempt-altered.json']),
  async ({ task }) => {
    const result = negativeResult;
    type Source = typeof result.source;
    const mutations: {
      name: string;
      reason: string;
      path: string;
      mutate: (source: Source) => void;
    }[] = [];
    const add = (name: string, reason: string, path: string, mutate: (source: Source) => void) => {
      mutations.push({ name, reason, path, mutate });
    };
    for (const field of ['actionId', 'occurrenceId', 'actor'] as const)
      add(
        `receipt-${field}`,
        'hpAttemptIdentityMismatch',
        `owner.hpActions.1.0.writes.0.receipts.0.${field}`,
        (s) => {
          Reflect.set(s.hpActions![1]![0]!.writes[0]!.receipts[0]!, field, 'alien');
        },
      );
    for (const field of ['operationIndex'] as const)
      add(field, 'hpAttemptIdentityMismatch', `owner.hpActions.1.0.writes.0.${field}`, (s) => {
        mutableAuditView(s.hpActions![1]![0]!.writes[0]!).operationIndex = 999;
      });
    for (const field of [
      'sourceId',
      'sourceInstanceId',
      'skillId',
      'valueSetIndex',
      'valueIndex',
    ] as const)
      add(
        field,
        'hpAttemptIdentityMismatch',
        `owner.hpActions.1.0.writes.0.source.${field}`,
        (s) => {
          Reflect.set(
            s.hpActions![1]![0]!.writes[0]!.source,
            field,
            field.includes('Index') ? 9 : 'alien',
          );
        },
      );
    for (const field of ['direction', 'unit', 'recipient', 'lossFloor'] as const)
      add(field, 'hpAttemptCanonicalMismatch', 'owner.canonical.writers', (s) => {
        Reflect.set(s.canonical.writers[1]!.operation, field, 'alien');
      });
    add('value-cell', 'hpAttemptCanonicalMismatch', 'owner.canonical.writers', (s) => {
      const op = s.canonical.writers[1]!.operation;
      if (op.amount.kind === 'fixed') op.amount.values[0][3] = 9999;
    });
    add('initial-as-start', 'hpAttemptStateMismatch', 'owner.hpActions.1.0.start.hp', (s) => {
      mutableAuditView(s.hpActions![1]![0]!.start).hp = s.hpActions![0]![0]!.start.hp;
    });
    add('attempt-as-retained', 'hpAttemptStateMismatch', 'owner.hpActions.1.0.returned.hp', (s) => {
      mutableAuditView(s.hpActions![1]![0]!.returned!).hp = s.hpActions![1]![0]!.attempted!.hp;
    });
    add('maximum-as-current', 'hpAttemptStateMismatch', 'owner.hpActions', (s) => {
      Reflect.set(s.hpActions![1]![0]!.start.hp!.actors.attacker!, 'current', 10010);
    });
    add(
      'receipt-amount-only',
      'hpAttemptStateMismatch',
      'owner.hpActions.1.0.writes.0.receipts.0.actual',
      (s) => {
        Reflect.set(s.hpActions![1]![0]!.writes[0]!.receipts[0]!, 'actual', 0);
      },
    );
    add('fake-commit', 'hpAttemptNativeMismatch', 'owner.hpActions.1.0.native.status', (s) => {
      Reflect.set(s.hpActions![1]![0]!.native!, 'status', 'committed');
    });
    add(
      'prefix-lost',
      'hpAttemptRejectionMismatch',
      'owner.transport.rejection.appliedPreparationActions',
      (s) => {
        s.transport!.rejection!.appliedPreparationActions = [];
      },
    );
    add(
      'receipt-leak',
      'hpAttemptStateMismatch',
      'owner.hpActions.1.0.returned.hp.receipts',
      (s) => {
        mutableAuditView(s.hpActions![1]![0]!.returned!).hp = {
          ...s.hpActions![1]![0]!.returned!.hp!,
          receipts: s.hpActions![1]![0]!.attempted!.hp!.receipts,
        };
      },
    );
    add(
      'effect-leak',
      'hpAttemptStateMismatch',
      'owner.hpActions.1.0.returned.hp.executedEffects',
      (s) => {
        mutableAuditView(s.hpActions![1]![0]!.returned!).hp = {
          ...s.hpActions![1]![0]!.returned!.hp!,
          executedEffects: ['failed-action'],
        };
      },
    );
    add(
      'applied-action-leak',
      'hpAttemptRejectionMismatch',
      'owner.transport.rejection.appliedPreparationActions',
      (s) => {
        s.transport!.rejection!.appliedPreparationActions = [
          ...s.transport!.rejection!.appliedPreparationActions,
          s.transport!.rejection!.appliedPreparationActions[0]!,
        ];
      },
    );
    add(
      'write-order',
      'hpAttemptIdentityMismatch',
      'owner.hpActions.1.0.writes.0.operationIndex',
      (s) => {
        mutableAuditView(s.hpActions![1]![0]!.writes).reverse();
      },
    );
    add('duplicate-write', 'hpAttemptStateMismatch', 'owner.hpActions', (s) => {
      mutableAuditView(s.hpActions![1]![0]!.writes).push(s.hpActions![1]![0]!.writes[0]!);
    });
    add('coherent-receipt-state', 'hpAttemptStateMismatch', 'owner.hpActions', (s) => {
      const w = s.hpActions![1]![0]!.writes[0]!;
      const r = w.receipts[0]!;
      Reflect.set(r.after, 'current', 8000);
      mutableAuditView(w).after = { ...w.after, actors: { ...w.after.actors, attacker: r.after } };
      mutableAuditView(s.hpActions![1]![0]!.attempted!).hp = w.after;
    });
    add(
      'coherent-refusal',
      'hpAttemptRejectionMismatch',
      'owner.transport.rejection.rejection.code',
      (s) => {
        Reflect.set(s.transport!.rejection!.rejection, 'code', 'attackerDead');
        Reflect.set(s.prepared.resolved.preparationRejection!, 'code', 'attackerDead');
      },
    );
    for (const key of [
      'seed',
      'read',
      'np',
      'event',
      'projection',
      'contribution',
      'damageInput',
      'calculatedResult',
    ])
      add(`downstream-${key}`, 'hpAttemptDownstreamLeak', `owner.transport.${key}`, (s) => {
        Reflect.set(s.transport!, key, { fabricated: true });
      });
    const negatives = mutations.map((m) => {
      const source = cloneSource(result);
      m.mutate(source);
      return {
        name: m.name,
        reason: m.reason,
        path: m.path,
        source: hpPreparationAttemptDiagnostic(source),
        gate: auditHpPreparationAttempts({
          selections: [result.selection],
          expected: [result.program],
          observations: [source],
        }),
      };
    });
    const referenceClone = cloneSource(result);
    const referenceGate = auditHpPreparationAttempts({
      selections: [result.selection],
      expected: [result.program],
      observations: [referenceClone],
    });
    const alien = run(negativeMaster, { ...negativeSpec, initial: 400 });
    const alienGate = auditHpPreparationAttempts({
      selections: [result.selection],
      expected: [result.program],
      observations: [{ ...alien.source, identity: result.selection.identity }],
    });
    const missingMaster = cloneSource(result);
    Reflect.deleteProperty(missingMaster, 'master');
    const missingMasterGate = auditHpPreparationAttempts({
      selections: [result.selection],
      expected: [result.program],
      observations: [missingMaster],
    });
    const missingPreparedMaster = cloneSource(result);
    Reflect.deleteProperty(missingPreparedMaster.prepared, 'master');
    const missingPreparedMasterGate = auditHpPreparationAttempts({
      selections: [result.selection],
      expected: [result.program],
      observations: [missingPreparedMaster],
    });
    const missingProgram = auditHpPreparationAttempts({
      selections: [result.selection],
      expected: [],
      observations: [result.source],
    });
    await save(task.meta, 'hp-attempt-altered.json', {
      canonical: result.selection.canonical,
      expected: result.program.owner,
      negatives,
      referenceGate,
      alienGate,
      missingProgram,
      missingMasterGate,
      missingPreparedMasterGate,
    });
    for (const negative of negatives) {
      expect(negative.gate.status, negative.name).toBe('failed');
      expect(
        negative.gate.failures.some(
          (f) => f.reason === negative.reason && f.checkPath.startsWith(negative.path),
        ),
        negative.name,
      ).toBe(true);
      for (const f of negative.gate.failures) {
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
      referenceGate.failures.some((f) => f.checkPath === 'reference.action.1.0.attempted'),
    ).toBe(true);
    expect(alienGate.status).toBe('failed');
    expect(missingProgram.failures.some((f) => f.checkPath === 'population.programs')).toBe(true);
    expect(
      missingMasterGate.failures.some((f) => f.checkPath.startsWith('owner.masterEvidence')),
    ).toBe(true);
    expect(missingPreparedMasterGate.failures.some((f) => f.checkPath === 'transport.master')).toBe(
      true,
    );
  },
);
it(
  'HP shared consumer never reexecutes the HP writer',
  productionAuditTestOptions(['hp-attempt-no-writer-replay.json']),
  async ({ task }) => {
    const spy = vi.spyOn(hpOwner, 'executeHpOperation');
    try {
      const result = run(negativeMaster, negativeSpec);
      const before = spy.mock.calls.length;
      const gate = auditHpPreparationAttempts({
        selections: [result.selection],
        expected: [result.program],
        observations: [result.source],
      });
      const after = spy.mock.calls.length;
      await save(task.meta, 'hp-attempt-no-writer-replay.json', {
        canonical: result.selection.canonical,
        source: hpPreparationAttemptDiagnostic(result.source),
        gate,
        before,
        after,
      });
      expect(before).toBeGreaterThan(0);
      expect(after).toBe(before);
      expect(gate.status).toBe('passed');
    } finally {
      spy.mockRestore();
    }
  },
);
it(
  'HP refusal rejects objects masquerading as absent downstream evidence',
  productionAuditTestOptions(['hp-attempt-absence-tags.json']),
  async ({ task }) => {
    const result = negativeResult;
    const negatives = ['observation', 'input', 'candidate'].map((key) => {
      const source = cloneSource(result);
      Reflect.set(source, key, { kind: 'absent' });
      return {
        key,
        source: hpPreparationAttemptDiagnostic(source),
        gate: auditHpPreparationAttempts({
          selections: [result.selection],
          expected: [result.program],
          observations: [source],
        }),
      };
    });
    await save(task.meta, 'hp-attempt-absence-tags.json', {
      expected: result.program.owner,
      negatives,
    });
    for (const negative of negatives) {
      expect(
        negative.gate.failures.some(
          (f) =>
            f.reason === 'hpAttemptDownstreamLeak' &&
            f.checkPath === `downstream.source.${negative.key}.absent`,
        ),
      ).toBe(true);
      for (const f of negative.gate.failures) {
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
  },
);
