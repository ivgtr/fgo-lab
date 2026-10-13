import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  playerChoiceForEffect,
  type MasterEffect,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import { normalizeAtlasSnapshot } from '@fgo-lab/data-pipeline';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  createDefaultResolvedScenario,
  evaluatePreparedCalculationResult,
  evaluatePreparedCalculationScenario,
  prepareCalculationScenarioWithPolicy,
  type CalculationApplicationResult,
  type CalculationExecution,
} from './scenario';
import { maximumFixedSelection } from './productionHpMaximumFixedPreparationAudit';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
  encodeProductionAuditDiagnostic,
  decodeProductionAuditDiagnostic,
  decodeStoredProductionAuditArtifact,
  readStoredProductionAuditArtifact,
} from './productionAuditArtifacts';
import {
  auditMaximumFixedAttemptIsolation,
  maximumFixedAttemptDiagnostic,
  maximumFixedAttemptProgram,
  maximumFixedAttemptSource,
  type MaximumFixedAttemptBoundary,
  type MaximumFixedAttemptExpectation,
  type MaximumFixedAttemptProgram,
  type MaximumFixedAttemptRequest,
  type MaximumFixedAttemptSource,
} from './productionHpMaximumFixedAttemptAudit';

type AtlasFunction = {
  funcId: number;
  funcType: string;
  funcTargetType: string;
  buffs: {
    type: string;
    buffGroup?: number;
    maxRate?: number;
    vals?: { name: string }[];
    script?: { INDIVIDUALITIE?: { id: number } };
  }[];
  svals: {
    Rate: number;
    Turn: number;
    Count: number;
    Value: number | null;
    ActSelectIndex?: number;
  }[];
};

const parameterRows = (value: number | null, rate = 1_000, choice?: number) =>
  Array.from({ length: 10 }, () => ({
    Rate: rate,
    Turn: -1,
    Count: -1,
    Value: value,
    ...(choice === undefined ? {} : { ActSelectIndex: choice }),
  }));

function generatedHpFunction(args: {
  id: number;
  buffs: readonly { type: 'addMaxhp' | 'subMaxhp'; unsupportedTrait?: boolean }[];
  value: number | null;
  choice?: number;
}): AtlasFunction {
  return {
    funcId: args.id,
    funcType: 'addState',
    funcTargetType: 'self',
    buffs: args.buffs.map(({ type, unsupportedTrait }) => ({
      type,
      ...(unsupportedTrait ? { script: { INDIVIDUALITIE: { id: 99_001 } } } : {}),
    })),
    svals: parameterRows(args.value, 1_000, args.choice),
  };
}

function generatedUnsupportedHpFunction(id: number): AtlasFunction {
  return generatedHpFunction({
    id,
    buffs: [{ type: 'addMaxhp', unsupportedTrait: true }],
    value: 10,
  });
}

function generatedOcFunction(id: number, rate: number): AtlasFunction {
  return {
    funcId: id,
    funcType: 'addState',
    funcTargetType: 'self',
    buffs: [
      {
        type: 'upChagetd',
        buffGroup: 0,
        maxRate: 5,
        vals: [{ name: 'buffPositiveEffect' }],
      },
    ],
    svals: parameterRows(1, rate),
  };
}

function withOcGrant(effect: AtlasFunction, id: number, rate: number): AtlasFunction[] {
  return [effect, generatedOcFunction(id, rate)];
}

function invalidSecondMaximumFixedFunctions(id: number): AtlasFunction[] {
  return [
    generatedHpFunction({ id, buffs: [{ type: 'addMaxhp' }], value: 333 }),
    generatedHpFunction({ id: id + 1, buffs: [{ type: 'addMaxhp' }], value: null }),
  ];
}

interface AttemptFixture {
  key: string;
  initialHpPermille: number;
  functions: AtlasFunction[];
  expectation: MaximumFixedAttemptExpectation;
  selectedChoice?: number;
  commandCanonicalValues?: (
    servantId: string,
    effect: MasterEffect,
  ) => ReturnType<typeof createDefaultResolvedScenario>['canonicalInputValues'];
  resourceRequirement?: number;
}

function fixtureSkill(
  id: number,
  slot: 1 | 2,
  functions: AtlasFunction[],
  resourceRequirement?: number,
) {
  return {
    id,
    num: slot,
    priority: 1,
    name: `fixture ${id}`,
    detail: '',
    functions,
    ...(resourceRequirement === undefined
      ? {}
      : { script: { NP_HIGHER: Array.from({ length: 10 }, () => resourceRequirement) } }),
  };
}

const fixtureIdentities = new Map<string, { servantId: string; targetSkillId: number }>();

function fixtureServantId(key: string) {
  const identity = fixtureIdentities.get(key);
  if (!identity) throw new Error(`maximum_fixed_fixture_identity_missing:${key}`);
  return identity.servantId;
}

function fixtureMaster(specs: readonly AttemptFixture[]): MasterDataSnapshot {
  return normalizeAtlasSnapshot({
    version: 'tsk08-maximum-fixed-attempt-fixtures',
    servants: specs.map((spec, index) => {
      const actorId = 700_100 + index;
      const prefixSkillId = 710_100 + index * 2;
      const targetSkillId = prefixSkillId + 1;
      fixtureIdentities.set(spec.key, { servantId: String(actorId), targetSkillId });
      return {
        id: actorId,
        collectionNo: index + 1,
        type: 'normal',
        name: `fixture ${spec.key}`,
        className: 'saber',
        attribute: 'earth',
        rarity: 4,
        hpGrowth: Array.from({ length: 100 }, (_, level) => (level === 89 ? 9_010 : level + 1)),
        atkGrowth: Array.from({ length: 100 }, (_, level) => level + 1),
        traits: [],
        skills: [
          fixtureSkill(prefixSkillId, 1, [
            generatedHpFunction({
              id: 980_001 + index,
              buffs: [{ type: 'addMaxhp' }],
              value: 100,
            }),
          ]),
          fixtureSkill(targetSkillId, 2, spec.functions, spec.resourceRequirement),
        ],
        classPassive: [],
        noblePhantasms: [
          {
            id: 720_100 + index,
            name: 'fixture NP',
            priority: 1,
            card: 'buster',
            functions: [
              {
                funcId: 730_100 + index,
                funcType: 'damageNp',
                funcTargetType: 'enemyAll',
                svals: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                svals2: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                svals3: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                svals4: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
                svals5: Array.from({ length: 5 }, () => ({ Rate: 1_000, Value: 3_000 })),
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
}

const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP',
  masterDataLocale: 'ja-JP',
} as const;

function scenarioFor(spec: AttemptFixture, master: MasterDataSnapshot) {
  const servantId = fixtureServantId(spec.key);
  const defaults = createDefaultResolvedScenario(master, undefined);
  const servant = master.servants.find((item) => item.id === servantId);
  const targetEffect = servant?.skills
    .find((skill) => skill.slot === 2)
    ?.effects.find((effect) =>
      effect.execution.some((operation) => operation.kind === 'hpModifier'),
    );
  return {
    ...defaults,
    attacker: {
      ...defaults.attacker,
      servantId,
      initialActorFormId:
        servant?.actorFormGraph.defaultInitialFormId ?? defaults.attacker.initialActorFormId,
    },
    attackerHpPermille: spec.initialHpPermille,
    explicitOverrides: {},
    canonicalInputValues:
      targetEffect && spec.commandCanonicalValues
        ? spec.commandCanonicalValues(servantId, targetEffect)
        : {},
    preNoblePhantasmPlan: [
      { kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 4, choice: null },
      {
        kind: 'useSkillSlot' as const,
        slot: 2 as const,
        skillLevel: 4,
        choice:
          spec.selectedChoice === undefined
            ? null
            : { groupKey: 'player-choice:1', candidateKey: String(spec.selectedChoice) },
      },
      { kind: 'executeAttackNoblePhantasm' as const },
    ],
  };
}

function execute(
  scenario: ReturnType<typeof scenarioFor>,
  master: MasterDataSnapshot,
  capture: boolean,
  policy: 'calculator' | 'ranking' = 'calculator',
) {
  const prepared = prepareCalculationScenarioWithPolicy(
    scenario,
    master,
    policy === 'calculator'
      ? { kind: 'calculator' }
      : {
          kind: 'ranking',
          selfBuffs: 'included',
          conditionalEffects: 'satisfied',
          areaView: 'included',
        },
    { initialNpGauge: 1_000 },
    capture,
  );
  const calculation = evaluatePreparedCalculationScenario(prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  return { prepared, calculation };
}

interface AttemptEntry {
  spec: AttemptFixture;
  master: MasterDataSnapshot;
  request: MaximumFixedAttemptRequest;
  program: MaximumFixedAttemptProgram;
  source: MaximumFixedAttemptSource;
  gate: ReturnType<typeof auditMaximumFixedAttemptIsolation>;
  directResult: CalculationApplicationResult;
}

function buildAttempt(
  spec: AttemptFixture,
  index: number,
  parity: boolean,
  master: MasterDataSnapshot,
): AttemptEntry {
  const scenario = scenarioFor(spec, master);
  const capture = execute(scenario, master, true);
  const directResult = evaluatePreparedCalculationResult(capture.prepared, {
    ...versions,
    masterDataVersion: master.version,
  });
  const selection = maximumFixedSelection(capture.prepared, capture.calculation, index);
  if (!selection) throw new Error(`maximum_fixed_attempt_selection_missing:${spec.key}`);
  const program = maximumFixedAttemptProgram(selection, spec.expectation, directResult);
  const source = maximumFixedAttemptSource(selection, directResult);
  const request = { prepared: capture.prepared, calculation: capture.calculation };
  const gate = auditMaximumFixedAttemptIsolation({
    requests: [request],
    expected: [program],
    observations: [source],
  });
  const result: AttemptEntry = { spec, master, request, program, source, gate, directResult };
  if (parity) {
    const normal = execute(scenario, master, false);
    const ranking = execute(scenario, master, true, 'ranking');
    const rankingNormal = execute(scenario, master, false, 'ranking');
    Object.assign(result, { normal, ranking, rankingNormal });
  }
  return result;
}

function attemptFixtures(): { positives: AttemptFixture[]; boundaries: AttemptFixture[] } {
  const unsupported = (id: number) => generatedUnsupportedHpFunction(id);
  const positive = (args: {
    key: string;
    initialHpPermille: number;
    functions: AtlasFunction[];
    selectedChoice?: number;
    commandCanonicalValues?: AttemptFixture['commandCanonicalValues'];
  }): AttemptFixture => ({
    key: args.key,
    initialHpPermille: args.initialHpPermille,
    functions: args.functions,
    expectation: { kind: 'changedNoncommit', actionIndex: 1 },
    ...(args.selectedChoice === undefined ? {} : { selectedChoice: args.selectedChoice }),
    ...(args.commandCanonicalValues ? { commandCanonicalValues: args.commandCanonicalValues } : {}),
  });
  const stochasticResetKey = 'source-local-stochastic-reset';
  const positives = [
    positive({
      key: 'increase',
      initialHpPermille: 500,
      functions: [
        generatedHpFunction({ id: 981_001, buffs: [{ type: 'addMaxhp' }], value: 731 }),
        unsupported(981_002),
      ],
    }),
    positive({
      key: 'decrease-current-floor',
      initialHpPermille: 50,
      functions: [
        generatedHpFunction({ id: 981_003, buffs: [{ type: 'subMaxhp' }], value: 6_000 }),
        unsupported(981_004),
      ],
    }),
    positive({
      key: 'decrease-maximum-floor-and-clamp',
      initialHpPermille: 1_000,
      functions: [
        generatedHpFunction({ id: 981_005, buffs: [{ type: 'subMaxhp' }], value: 20_000 }),
        unsupported(981_006),
      ],
    }),
    positive({
      key: 'same-source-multiple-operations',
      initialHpPermille: 400,
      functions: [
        generatedHpFunction({
          id: 981_007,
          buffs: [{ type: 'addMaxhp' }, { type: 'addMaxhp' }],
          value: 333,
        }),
        unsupported(981_008),
      ],
    }),
    positive({
      key: 'selected-choice-multiple-sources',
      initialHpPermille: 650,
      selectedChoice: 2,
      functions: [
        generatedHpFunction({
          id: 981_009,
          buffs: [{ type: 'addMaxhp' }],
          value: 8_000,
          choice: 1,
        }),
        generatedHpFunction({ id: 981_010, buffs: [{ type: 'addMaxhp' }], value: 550, choice: 2 }),
        generatedHpFunction({ id: 981_011, buffs: [{ type: 'subMaxhp' }], value: 90 }),
        unsupported(981_012),
      ],
    }),
    positive({
      key: stochasticResetKey,
      initialHpPermille: 500,
      functions: [
        ...withOcGrant(
          generatedHpFunction({ id: 981_013, buffs: [{ type: 'addMaxhp' }], value: 700 }),
          981_014,
          500,
        ),
        unsupported(981_015),
      ],
      commandCanonicalValues: (servantId) => ({
        [`oc:proc:${JSON.stringify(['attacker', `attacker:${servantId}`, String(fixtureIdentities.get(stochasticResetKey)!.targetSkillId), '981014:0', null, 0])}`]:
          {
            kind: 'integer',
            value: 0,
            origin: 'witness',
          },
      }),
    }),
    positive({
      key: 'native-invalid-after-first-write',
      initialHpPermille: 500,
      functions: invalidSecondMaximumFixedFunctions(981_016),
    }),
    positive({
      key: 'native-input-required-after-first-write',
      initialHpPermille: 500,
      functions: [
        ...withOcGrant(
          generatedHpFunction({ id: 981_017, buffs: [{ type: 'addMaxhp' }], value: 800 }),
          981_018,
          500,
        ),
      ],
    }),
  ];
  const boundary = (
    key: string,
    initialHpPermille: number,
    functions: AtlasFunction[],
    expected: MaximumFixedAttemptBoundary,
    resourceRequirement?: number,
  ): AttemptFixture => ({
    key,
    initialHpPermille,
    functions,
    ...(resourceRequirement === undefined ? {} : { resourceRequirement }),
    expectation: { kind: 'boundary', actionIndex: 1, boundary: expected },
  });
  const noOp = generatedHpFunction({ id: 981_020, buffs: [{ type: 'addMaxhp' }], value: 0 });
  const omittedSelection = generatedHpFunction({
    id: 981_022,
    buffs: [{ type: 'addMaxhp' }],
    value: 200,
  });
  const boundaries = [
    boundary('no-op-receipt-zero', 500, [noOp, unsupported(981_023)], 'maximumUnchanged'),
    boundary(
      'dead-current',
      0,
      [
        generatedHpFunction({ id: 981_024, buffs: [{ type: 'addMaxhp' }], value: 700 }),
        unsupported(981_025),
      ],
      'deadActor',
    ),
    boundary('writer-unreached', 500, [], 'writerUnreached'),
    boundary(
      'action-rejected-before-native',
      500,
      [generatedHpFunction({ id: 981_026, buffs: [{ type: 'addMaxhp' }], value: 700 })],
      'attemptBeforeNative',
      1_000,
    ),
    boundary('native-committed', 500, [omittedSelection], 'nativeCommitted'),
  ];
  return { positives, boundaries };
}

const sharedEntries = new Map<string, AttemptEntry>();
const sharedFixtures = attemptFixtures();
const sharedMaster = fixtureMaster([...sharedFixtures.positives, ...sharedFixtures.boundaries]);
function entry(spec: AttemptFixture, index: number, parity: boolean) {
  let value = sharedEntries.get(spec.key);
  if (!value) {
    value = buildAttempt(spec, index, parity, sharedMaster);
    sharedEntries.set(spec.key, value);
  }
  return value;
}

async function saveArtifact(task: { meta: unknown }, path: string, payload: unknown) {
  const encoded = encodeProductionAuditDiagnostic(payload);
  const receipt = await writeProductionAuditArtifact(task.meta, path, encoded);
  const bytes = await readStoredProductionAuditArtifact(path);
  const decoded = decodeStoredProductionAuditArtifact(bytes) as ReturnType<
    typeof encodeProductionAuditDiagnostic
  >;
  expect(receipt.expectedBytes).toBe(bytes.length);
  expect(receipt.expectedSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(isDeepStrictEqual(decodeProductionAuditDiagnostic(decoded), payload)).toBe(true);
}

function setAndRestore(owner: object, key: PropertyKey, value: unknown) {
  const previous: unknown = Reflect.get(owner, key) as unknown;
  const had = Object.hasOwn(owner, key);
  Reflect.set(owner, key, value);
  return () => {
    if (had) Reflect.set(owner, key, previous);
    else Reflect.deleteProperty(owner, key);
  };
}

describe('maximumFixed changed-attempt native noncommit isolation', () => {
  const fixtures = sharedFixtures;

  it(
    'connects pipeline-generated changed writers to the original native refusal and retained prefix',
    productionAuditTestOptions(['audit-maximum-fixed-attempt-changed-noncommit.json']),
    async ({ task }) => {
      const cases = fixtures.positives.map((spec, index) => entry(spec, index, true));
      const proofs = cases.map((item) => ({
        key: item.spec.key,
        gate: item.gate,
        proof: maximumFixedAttemptDiagnostic(item.source),
        parity: {
          normal: (item as AttemptEntry & { normal: { calculation: CalculationExecution } }).normal
            .calculation,
          capture: item.request.calculation,
          ranking: (item as AttemptEntry & { ranking: { calculation: CalculationExecution } })
            .ranking.calculation,
          rankingNormal: (
            item as AttemptEntry & { rankingNormal: { calculation: CalculationExecution } }
          ).rankingNormal.calculation,
        },
      }));
      await saveArtifact(task, 'audit-maximum-fixed-attempt-changed-noncommit.json', {
        generatedBy:
          'normalizeFunctions→masterSnapshotSchema→preparation reducer→original native owner',
        cases: proofs,
      });

      for (const item of cases) {
        const targetTransition = item.source.forwardSource.transitions?.[1];
        const action = targetTransition?.hpActions![0];
        const writes = action?.modifierWrites ?? [];
        expect(item.gate.status, JSON.stringify(item.gate.firstDifference)).toBe('passed');
        expect(item.gate.isolated).toEqual([item.program.identity]);
        expect(item.request.prepared.status).toBe('rejected');
        expect(item.request.calculation.status).toBe('rejected');
        expect(item.directResult.status).not.toBe('calculated');
        expect(targetTransition?.result.status).toBe('rejected');
        expect(action?.native?.status).toMatch(/^(invalid|unsupported|inputRequired)$/);
        expect(action?.returned).toBe(action?.start);
        expect(targetTransition?.result.state).toBe(targetTransition?.before);
        expect(action?.start.appliedActions).toHaveLength(1);
        expect(action?.start.hp?.modifiers).toHaveLength(1);
        expect(action?.start.hp?.receipts).toHaveLength(1);
        expect(action?.returned?.hp?.modifiers).toBe(action?.start.hp?.modifiers);
        expect(action?.returned?.hp?.receipts).toBe(action?.start.hp?.receipts);
        expect(writes.length).toBeGreaterThan(0);
        for (const write of writes) {
          expect(write.operation.action).toBe('maximumFixed');
          expect(write.operation.bounds).toEqual({ minimum: null, maximum: null });
          expect(write.operation.lifetime).toBe('active');
          expect(write.operation.route.target).toBe('sourceSelf');
          expect(
            write.operation.selection === undefined || write.operation.selection === 'direct',
          ).toBe(true);
          expect(write.source.origin).toBe('attacker');
          expect(write.source.valueSetIndex).toBe(0);
          expect(write.source.valueIndex).toBe(3);
          expect(write.receipts).toHaveLength(1);
          expect(write.receipts[0]).toMatchObject({ attempted: 0, actual: 0 });
          expect(write.before.actors.attacker).not.toEqual(write.after.actors.attacker);
        }
        const normal = (item as AttemptEntry & { normal: { calculation: CalculationExecution } })
          .normal.calculation;
        const ranking = (item as AttemptEntry & { ranking: { calculation: CalculationExecution } })
          .ranking.calculation;
        expect(normal.status).toBe('rejected');
        expect(ranking.status).toBe('rejected');
        expect(normal.result).toEqual(item.request.calculation.result);
        const rankingNormal = (
          item as AttemptEntry & {
            rankingNormal: { calculation: CalculationExecution };
          }
        ).rankingNormal.calculation;
        expect(ranking.result).toEqual(rankingNormal.result);
        expect(item.directResult).toEqual(item.request.calculation.result);
      }

      const reset = cases.find((item) => item.spec.key === 'source-local-stochastic-reset')!;
      const resetAction = reset.source.forwardSource.transitions![1]!.hpActions[0]!;
      const resetEnd = resetAction.sourceEnds.find((end) => end.stochasticFailureSteps?.length)!;
      expect(resetEnd.sourceStart).toBeDefined();
      expect(resetEnd.after.hp).toBe(resetEnd.sourceStart!.hp);
      expect({ ...resetEnd.after, sourceBindings: [] }).toEqual({
        ...resetEnd.sourceStart,
        sourceBindings: [],
      });
      const nativeResetSource = reset.source.forwardSource.transitions![1]!.result.sources.find(
        (source) => source.source === resetEnd.source,
      )!;
      expect(resetEnd.after.sourceBindings.at(-1)).toBe(nativeResetSource.binding);
      expect(resetEnd.stochasticFailureSteps?.length).toBeGreaterThan(0);
      expect(resetAction.attempted?.hp).toBe(resetEnd.after.hp);

      const choice = cases.find((item) => item.spec.key === 'selected-choice-multiple-sources')!;
      expect(
        choice.source.forwardSource.canonical.writers
          .filter((writer) => writer.actionIndex === 1)
          .map((writer) => playerChoiceForEffect(writer.effect)),
      ).toEqual([{ key: 'player-choice:1', candidate: '2' }, null]);
      expect(
        choice.source.forwardSource.canonical.writers.some(
          (writer) => writer.effect.id === '981009',
        ),
      ).toBe(false);
      const invalid = cases.find((item) => item.spec.key === 'native-invalid-after-first-write')!;
      expect(invalid.source.forwardSource.transitions![1]!.hpActions[0]!.native).toMatchObject({
        status: 'invalid',
        reason: 'hpMutation',
      });
      const inputRequired = cases.find(
        (item) => item.spec.key === 'native-input-required-after-first-write',
      )!;
      expect(inputRequired.source.forwardSource.transitions![1]!.hpActions[0]!.native?.status).toBe(
        'inputRequired',
      );
    },
  );

  it(
    'reports schema-legal no-op, dead, unreached, pre-native and committed boundaries separately',
    productionAuditTestOptions(['audit-maximum-fixed-attempt-boundaries.json']),
    async ({ task }) => {
      const cases = fixtures.boundaries.map((spec, index) => entry(spec, 100 + index, false));
      await saveArtifact(
        task,
        'audit-maximum-fixed-attempt-boundaries.json',
        cases.map((item) => ({
          key: item.spec.key,
          gate: item.gate,
          proof: maximumFixedAttemptDiagnostic(item.source),
        })),
      );
      for (const item of cases) {
        expect(item.gate.status, JSON.stringify(item.gate.firstDifference)).toBe('passed');
        expect(item.gate.isolated).toEqual([]);
        expect(item.gate.boundaries).toEqual([
          {
            identity: item.program.identity,
            reason: item.spec.expectation.kind === 'boundary' ? item.spec.expectation.boundary : '',
          },
        ]);
      }
      const noOp = cases.find((item) => item.spec.key === 'no-op-receipt-zero')!;
      const noOpWrite =
        noOp.source.forwardSource.transitions![1]!.hpActions[0]!.modifierWrites![0]!;
      expect(noOpWrite.modifiers).toHaveLength(1);
      expect(noOpWrite.receipts[0]).toMatchObject({ attempted: 0, actual: 0 });
      expect(noOpWrite.before.actors.attacker).toEqual(noOpWrite.after.actors.attacker);
      expect(noOp.gate.boundaries[0]?.reason).toBe('maximumUnchanged');
    },
  );

  it(
    'rejects responsibility-grouped capture, reducer, transport, population and downstream mutations',
    productionAuditTestOptions(['audit-maximum-fixed-attempt-negatives.json']),
    async ({ task }) => {
      const multiple = entry(
        fixtures.positives.find((spec) => spec.key === 'same-source-multiple-operations')!,
        200,
        false,
      );
      const reset = entry(
        fixtures.positives.find((spec) => spec.key === 'source-local-stochastic-reset')!,
        201,
        false,
      );
      const mutable = multiple.source.forwardSource.transitions![1]!.hpActions[0]!;
      const firstWrite = mutable.modifierWrites![0]!;
      const resetMutable = reset.source.forwardSource.transitions![1]!.hpActions[0]!;
      const resetWrite = resetMutable.modifierWrites![0]!;
      const resetEnd = resetMutable.sourceEnds.find((end) => end.stochasticFailureSteps?.length)!;
      const inputRequired = entry(
        fixtures.positives.find((spec) => spec.key === 'native-input-required-after-first-write')!,
        202,
        false,
      );
      const inputRequiredAction = inputRequired.source.forwardSource.transitions![1]!.hpActions[0]!;
      const rejection = multiple.source.forwardSource.transport!.rejection!;
      const targetTransition = multiple.source.forwardSource.transitions![1]!;
      const transport = multiple.source.forwardSource.transport!;
      const inputRequiredTransport = inputRequired.source.forwardSource.transport!;
      const fixturesToRun: {
        group: string;
        path: string;
        source: MaximumFixedAttemptSource;
        program: MaximumFixedAttemptProgram;
        request: MaximumFixedAttemptRequest;
        mutate: () => () => void;
        expectedPathFragment: string;
      }[] = [
        {
          group: 'canonical identity',
          path: 'modifier source actor',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.source, 'origin', 'passive'),
          expectedPathFragment: 'origin',
        },
        {
          group: 'canonical identity',
          path: 'source instance belongs to another actor',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.source, 'sourceInstanceId', 'attacker:other'),
          expectedPathFragment: 'sourceInstanceId',
        },
        {
          group: 'canonical identity',
          path: 'source occurrence',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.source.effect, 'occurrenceId', 'other:0'),
          expectedPathFragment: 'occurrenceId',
        },
        {
          group: 'canonical identity',
          path: 'operation index',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite, 'operationIndex', 9),
          expectedPathFragment: 'operationIndex',
        },
        {
          group: 'canonical identity',
          path: 'selected value cell',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite, 'valueIndex', 2),
          expectedPathFragment: 'valueIndex',
        },
        {
          group: 'canonical identity',
          path: 'value-set cell',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite, 'valueSetIndex', 1),
          expectedPathFragment: 'valueSetIndex',
        },
        {
          group: 'canonical identity',
          path: 'command and action form',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () =>
            setAndRestore(multiple.source.forwardSource.canonical.actions[1]!, 'form', {
              actorId: '999999',
              limitCount: 0,
            }),
          expectedPathFragment: 'actorId',
        },
        {
          group: 'canonical identity',
          path: 'recipient route',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.operation.route, 'target', 'partyMember'),
          expectedPathFragment: 'route',
        },
        {
          group: 'canonical identity',
          path: 'sign and lifecycle',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => {
            const undoSign = setAndRestore(firstWrite.operation, 'sign', -1);
            const undoLifetime = setAndRestore(firstWrite.operation, 'lifetime', 'constant');
            return () => {
              undoLifetime();
              undoSign();
            };
          },
          expectedPathFragment: 'sign|lifetime',
        },
        {
          group: 'canonical identity',
          path: 'bounds and traits',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => {
            const undoBounds = setAndRestore(firstWrite.operation.bounds, 'maximum', 10);
            const undoTraits = setAndRestore(firstWrite.operation, 'traits', ['positive']);
            return () => {
              undoTraits();
              undoBounds();
            };
          },
          expectedPathFragment: 'maximum|traits',
        },
        {
          group: 'write and receipt',
          path: 'before state',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.before.actors.attacker!, 'maximum', 12_345),
          expectedPathFragment: 'before|maximum',
        },
        {
          group: 'write and receipt',
          path: 'modifier slice order',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite, 'modifiers', []),
          expectedPathFragment: 'modifiers',
        },
        {
          group: 'write and receipt',
          path: 'modifier instance identity',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.modifiers[0]!, 'id', 'other-modifier'),
          expectedPathFragment: 'id',
        },
        {
          group: 'write and receipt',
          path: 'receipt slice duplicated',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () =>
            setAndRestore(firstWrite, 'receipts', [...firstWrite.receipts, firstWrite.receipts[0]]),
          expectedPathFragment: 'receipts',
        },
        {
          group: 'write and receipt',
          path: 'modifier writes reversed',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () =>
            setAndRestore(mutable, 'modifierWrites', [...mutable.modifierWrites!].reverse()),
          expectedPathFragment: 'modifierWrites|writeOrder',
        },
        {
          group: 'write and receipt',
          path: 'receipt actual zero',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(firstWrite.receipts[0]!, 'actual', 1),
          expectedPathFragment: 'actual',
        },
        {
          group: 'write and receipt',
          path: 'write operation reference',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () =>
            setAndRestore(firstWrite, 'operation', structuredClone(firstWrite.operation)),
          expectedPathFragment: 'operation',
        },
        {
          group: 'attempt end and reset',
          path: 'attempt end replaced by last write',
          source: reset.source,
          program: reset.program,
          request: reset.request,
          mutate: () => setAndRestore(resetMutable, 'attempted', resetWrite.after),
          expectedPathFragment: 'attempted',
        },
        {
          group: 'attempt end and reset',
          path: 'source restoration owner value',
          source: reset.source,
          program: reset.program,
          request: reset.request,
          mutate: () =>
            setAndRestore(resetEnd.sourceStart!.hp!.actors.attacker!, 'maximum', 12_345),
          expectedPathFragment: 'sourceStart|maximum',
        },
        {
          group: 'attempt end and reset',
          path: 'full action-start HP stale',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(mutable.start.hp!.actors.attacker!, 'maximum', 12_345),
          expectedPathFragment: 'actionStart|maximum',
        },
        {
          group: 'attempt end and reset',
          path: 'returned state replaced by attempted state',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(mutable, 'returned', mutable.attempted!),
          expectedPathFragment: 'returned',
        },
        {
          group: 'native and reducer',
          path: 'native falsely committed',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(mutable.native!, 'status', 'committed'),
          expectedPathFragment: 'status',
        },
        {
          group: 'native and reducer',
          path: 'reducer failure code',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(targetTransition.result, 'code', 'invalidHpExecution'),
          expectedPathFragment: 'code',
        },
        {
          group: 'native and reducer',
          path: 'typed refusal operation id',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () =>
            setAndRestore(rejection.rejection, 'operationId', 'preparation:other:useSkillSlot'),
          expectedPathFragment: 'operationId',
        },
        {
          group: 'native and reducer',
          path: 'typed refusal code',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(rejection.rejection, 'code', 'tamperedFailureCode'),
          expectedPathFragment: 'code',
        },
        {
          group: 'native and reducer',
          path: 'required input source key',
          source: inputRequired.source,
          program: inputRequired.program,
          request: inputRequired.request,
          mutate: () =>
            setAndRestore(inputRequiredAction.rejectionInput!.requiredInput, 'key', 'oc:other'),
          expectedPathFragment: 'requiredInput',
        },
        {
          group: 'native and reducer',
          path: 'required input occurrence',
          source: inputRequired.source,
          program: inputRequired.program,
          request: inputRequired.request,
          mutate: () =>
            setAndRestore(inputRequiredAction.rejectionInput!, 'occurrenceId', 'other:0'),
          expectedPathFragment: 'occurrenceId|requiredInputOccurrence',
        },
        {
          group: 'native and reducer',
          path: 'transport required inputs removed',
          source: inputRequired.source,
          program: inputRequired.program,
          request: inputRequired.request,
          mutate: () => setAndRestore(inputRequiredTransport.rejection!, 'requiredInputs', []),
          expectedPathFragment: 'requiredInputs|transportRequiredInputs',
        },
        {
          group: 'retained state and prefix',
          path: 'reducer retained prefix removed',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(targetTransition.result.state, 'appliedActions', []),
          expectedPathFragment: 'appliedActions',
        },
        {
          group: 'transport and downstream',
          path: 'fabricated ordered scenario',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(transport, 'orderedScenario', { operations: [] }),
          expectedPathFragment: 'orderedScenario',
        },
        {
          group: 'transport and downstream',
          path: 'fabricated damage input',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () =>
            setAndRestore(transport, 'damageInputGenerated', { damageFunction: 'hpRatioLow' }),
          expectedPathFragment: 'damageInputGenerated',
        },
        {
          group: 'transport and downstream',
          path: 'fabricated application result',
          source: multiple.source,
          program: multiple.program,
          request: multiple.request,
          mutate: () => setAndRestore(multiple.source.directResult, 'status', 'calculated'),
          expectedPathFragment: 'status',
        },
        {
          group: 'transport and downstream',
          path: 'different calculation execution',
          source: multiple.source,
          program: multiple.program,
          request: { prepared: multiple.request.prepared, calculation: reset.request.calculation },
          mutate: () => () => {},
          expectedPathFragment: 'request.references',
        },
      ];
      const negatives = [] as {
        group: string;
        path: string;
        gate: ReturnType<typeof auditMaximumFixedAttemptIsolation>;
        proof: unknown;
      }[];
      for (const item of fixturesToRun) {
        const restore = item.mutate();
        try {
          const gate = auditMaximumFixedAttemptIsolation({
            requests: [item.request],
            expected: [item.program],
            observations: [item.source],
          });
          negatives.push({
            group: item.group,
            path: item.path,
            gate,
            proof: maximumFixedAttemptDiagnostic(item.source),
          });
        } finally {
          restore();
        }
      }
      const missingPopulation = auditMaximumFixedAttemptIsolation({
        requests: [],
        expected: [multiple.program],
        observations: [multiple.source],
      });
      const missingObservation = auditMaximumFixedAttemptIsolation({
        requests: [multiple.request],
        expected: [multiple.program],
        observations: [],
      });
      const missingProgram = auditMaximumFixedAttemptIsolation({
        requests: [multiple.request],
        expected: [],
        observations: [multiple.source],
      });
      const negativeReports = [
        ...negatives.map(({ group, path, gate, proof }) => ({ group, path, gate, proof })),
        {
          group: 'population',
          path: 'missing request',
          gate: missingPopulation,
          proof: maximumFixedAttemptDiagnostic(multiple.source),
        },
        {
          group: 'population',
          path: 'missing observation',
          gate: missingObservation,
          proof: maximumFixedAttemptDiagnostic(multiple.source),
        },
        {
          group: 'population',
          path: 'missing program',
          gate: missingProgram,
          proof: maximumFixedAttemptDiagnostic(multiple.source),
        },
      ];
      await saveArtifact(task, 'audit-maximum-fixed-attempt-negatives.json', negativeReports);
      for (const item of negativeReports) {
        expect(item.gate.status, `${item.group}:${item.path}`).toBe('failed');
        expect(item.gate.failures.length, `${item.group}:${item.path}`).toBeGreaterThan(0);
        expect(item.gate.failures.some((failure) => failure.firstDifference.path.length > 0)).toBe(
          true,
        );
      }
      for (const item of fixturesToRun) {
        const matchingFailure = negatives
          .find((negative) => negative.path === item.path)!
          .gate.failures.find((failure) =>
            item.expectedPathFragment
              .split('|')
              .some((fragment) => failure.checkPath.includes(fragment)),
          );
        expect(matchingFailure, `${item.group}:${item.path}`).toBeDefined();
        expect(matchingFailure?.reason).toMatch(/^maximumFixedAttempt/);
        expect(matchingFailure?.firstDifference.path.length).toBeGreaterThan(0);
      }
    },
  );
});
