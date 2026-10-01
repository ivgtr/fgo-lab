import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import * as portableOwner from './portableCalculation';
import * as scenarioOwner from './scenario';
import * as rankingOwner from './rankingPolicyCalculation';
import { inspectProductionAuditValue } from './productionAuditValue';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createTsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import type {
  ProductionPreparationTransactionAction,
  ProductionPreparationTransactionObservation,
  ProductionUserControlObservation,
} from './productionParityDiagnostics';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import tsk065Evidence from '../../../docs/evidence/tsk-06-5-production-closure.json';
import {
  auditProductionClosure,
  type ProductionClosureAudit,
  productionClosureConditionKey,
  productionClosureConditions,
  productionParityActions,
} from './productionClosureAudit';
import {
  evaluateProductionFinalOutcomeGate,
  auditProductionPreparationTransactionObservations,
  compareProductionParity,
  evaluateProductionPreparationTransactionGate,
  evaluateProductionParityGate,
  auditProductionUserControlObservations,
} from './productionParityDiagnostics';
import { combineRankingEligibilityPartitionDigests } from './rankingEligibilityAudit';
import {
  compareProductionMatrixAggregates,
  inspectProductionShardAuditShapes,
} from './productionClosureRecordIntegrity';
import {
  acceptProductionShardManifests,
  observeProductionShardRecords,
  compareProductionShardGateBodies,
  type ProductionSerializedShard,
} from './productionShardAcceptance';
import { productionRecordComparisonFailure } from './productionParityDiagnostics';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

async function writeProductionClosureDiagnosticArtifact(
  taskMetadata: unknown,
  path: string,
  value: unknown,
) {
  return writeProductionAuditArtifact(taskMetadata, path, value);
}

async function writeParityDiagnosticArtifact(taskMetadata: unknown, value: unknown): Promise<void> {
  await writeProductionClosureDiagnosticArtifact(
    taskMetadata,
    'production-closure-parity-diagnostics.json',
    value,
  );
}

async function writePreparationTransactionDiagnosticArtifact(
  taskMetadata: unknown,
  value: unknown,
): Promise<void> {
  await writeProductionClosureDiagnosticArtifact(
    taskMetadata,
    'production-preparation-transaction-diagnostics.json',
    value,
  );
}

async function writeUserControlDiagnosticArtifact(
  taskMetadata: unknown,
  value: unknown,
): Promise<void> {
  await writeProductionClosureDiagnosticArtifact(
    taskMetadata,
    'production-inert-control-fixture.json',
    value,
  );
}

function assertFailureProbe(
  failureClass: string,
  gate: {
    status: 'passed' | 'failed';
    reason?: string;
    canonicalIdentity: string;
    firstDifference: unknown;
    failures: readonly { reason: string; canonicalIdentity: string; firstDifference: unknown }[];
  },
  reason?: string,
): void {
  if (process.env['FGO_TSK08_FAILURE_CLASS_PROBE'] !== failureClass) return;
  const failure =
    reason === undefined ? gate.failures[0] : gate.failures.find((item) => item.reason === reason);
  expect(
    gate.status,
    JSON.stringify({
      failureClass,
      gateReason: gate.reason ?? null,
      reason: failure?.reason ?? reason ?? null,
      canonicalIdentity: failure?.canonicalIdentity ?? gate.canonicalIdentity,
      firstDifference: failure?.firstDifference ?? gate.firstDifference,
    }),
  ).toBe('passed');
}

it('combines eligibility partition digests in canonical order and rejects incomplete merges', () => {
  const partitions = Array.from({ length: 8 }, (_, partition) => ({
    partition,
    digest: createHash('sha256')
      .update(`eligibility-partition-${String(partition)}`)
      .digest('hex'),
  }));
  const expected = createHash('sha256')
    .update(JSON.stringify(partitions.map(({ digest }) => digest)))
    .digest('hex');

  expect(combineRankingEligibilityPartitionDigests([...partitions].reverse())).toBe(expected);
  expect(combineRankingEligibilityPartitionDigests([partitions[3]!])).toBe(partitions[3]!.digest);
  expect(() => combineRankingEligibilityPartitionDigests(partitions.slice(0, 7))).toThrow(
    'ranking_eligibility_partition_digest_count_mismatch',
  );
  expect(() =>
    combineRankingEligibilityPartitionDigests(
      partitions.map((partition, index) =>
        index === 7 ? { ...partition, partition: 6 } : partition,
      ),
    ),
  ).toThrow('ranking_eligibility_partition_digest_invalid');
});

function emptyProductionAudit() {
  return {
    conditionCount: 0,
    attackProfileCount: 0,
    outcomeCount: 0,
    outcomes: {
      calculated: 0,
      unavailableUnderPolicy: 0,
      inputRequired: 0,
      invalid: 0,
      unsupported: 0,
    },
    parityCount: 0,
    parityFailures: [],
    unavailable: [],
    conditionSummaries: [],
    digest: '0'.repeat(64),
    eligibility: {
      conditionCount: 0,
      digest: '0'.repeat(64),
      staticSemantics: {
        servants: 0,
        attackProfiles: 0,
        sourcePrograms: 0,
        sourceUses: 0,
        skillSources: 0,
        noblePhantasmSources: 0,
        effects: 0,
        semanticPrograms: 0,
        operations: 0,
        conditions: 0,
        inputDefinitions: 0,
        unsupportedPrograms: 0,
        invalidPrograms: 0,
        sourceKinds: {},
        operationKinds: {},
        digest: '0'.repeat(64),
      },
      admissions: {
        observations: 0,
        dispositions: 0,
        byPolicy: {},
        byKind: {},
        digest: '0'.repeat(64),
      },
      candidates: {
        observations: 0,
        candidatePlans: 0,
        generated: 0,
        deduplicated: 0,
        upperBound: 0,
        maximumSingleProfileUpperBound: 0,
        maximumSingleProfileGenerated: 0,
        byStatus: { calculated: 0, unreachable: 0, inputRequired: 0, invalid: 0, unsupported: 0 },
        byPolicy: {},
        candidateSpaceStatus: {},
        digest: '0'.repeat(64),
      },
    },
  };
}

it(
  'rejects malformed producer shard structures before projection and preserves map contracts',
  productionAuditTestOptions(['production-shard-shape-diagnostics.json']),
  async ({ task }) => {
    const valid = emptyProductionAudit();
    expect(inspectProductionShardAuditShapes([valid])).toMatchObject({
      status: 'passed',
      failures: [],
    });
    const cases: [string, string, unknown, boolean][] = [
      ['audit', 'additionalAggregate', 1, false],
      ['eligibility', 'eligibility.additionalAggregate', 1, false],
      ['admissions', 'eligibility.admissions.additionalAggregate', 1, false],
      ['candidates', 'eligibility.candidates.additionalAggregate', 1, false],
      ['outcomes', 'outcomes.additionalAggregate', 1, false],
      ['static', 'eligibility.staticSemantics.additionalAggregate', 1, false],
      ['status', 'eligibility.candidates.byStatus.additionalAggregate', 1, false],
      ['mergedMetadata', 'eligibility.admissions.shardDigests', ['0'.repeat(64)], false],
      ['missingDigest', 'eligibility.digest', undefined, true],
      ['wrongObject', 'eligibility.candidates', null, false],
      ['wrongCount', 'eligibility.admissions.observations', -1, false],
      ['wrongDigest', 'digest', 'invalid-sha', false],
      ['wrongMapValue', 'eligibility.admissions.byPolicy.fixture', 'one', false],
    ];
    const results = cases.map(([name, path, value, missing]) => {
      const actual = structuredClone(valid) as Record<string, unknown>;
      const keys = path.split('.');
      const field = keys.pop()!;
      let parent = actual;
      for (const key of keys) parent = parent[key] as Record<string, unknown>;
      if (missing) Reflect.deleteProperty(parent, field);
      else parent[field] = value;
      const comparison = inspectProductionShardAuditShapes([valid, actual]);
      const gate = productionRecordComparisonFailure(comparison);
      const unknown = [
        'audit',
        'eligibility',
        'admissions',
        'candidates',
        'outcomes',
        'static',
        'status',
        'mergedMetadata',
      ].includes(name);
      expect(gate, name).toMatchObject({
        status: 'failed',
        reason: unknown ? 'shardAuditUnknownField' : 'shardAuditShapeInvalid',
        canonicalIdentity: 'tsk-08:shard:1',
        firstDifference: { path: `audit.${path}${unknown ? '' : '.type'}` },
      });
      return { name, actual, comparison, gate };
    });
    const maps = structuredClone(valid);
    maps.eligibility.admissions.byPolicy = Object.fromEntries([
      ['additionalAggregate', 1],
      ['__proto__', 1],
    ]);
    maps.eligibility.admissions.byKind = { fixtureKind: 1 };
    maps.eligibility.candidates.byPolicy = { fixturePolicy: 1 };
    maps.eligibility.staticSemantics.sourceKinds = { fixtureSource: 1 };
    expect(inspectProductionShardAuditShapes([maps]).failures).toEqual([]);
    const prototypeField = { ...valid, ...Object.fromEntries([['__proto__', {}]]) };
    expect(
      productionRecordComparisonFailure(inspectProductionShardAuditShapes([prototypeField])),
    ).toMatchObject({
      status: 'failed',
      reason: 'shardAuditUnknownField',
      firstDifference: { path: 'audit.__proto__', actual: {} },
    });
    const many = {
      ...valid,
      ...Object.fromEntries(Array.from({ length: 1024 }, (_, index) => [`extra${index}`, index])),
    };
    const manyComparison = inspectProductionShardAuditShapes([many]);
    expect(manyComparison.failures).toHaveLength(1024);
    expect(
      manyComparison.failures.every((failure) => failure.reason === 'shardAuditUnknownField'),
    ).toBe(true);
    await writeProductionClosureDiagnosticArtifact(
      task.meta,
      'production-shard-shape-diagnostics.json',
      { valid, results, maps, manyComparison },
    );
  },
);

it(
  'diagnoses complete matrix aggregates before derived checksums through the parity gate',
  productionAuditTestOptions(['production-matrix-aggregate-diagnostics.json']),
  async ({ task }) => {
    // Independent values, not expectations computed by the comparison or merge.
    const expected = {
      conditionCount: 80,
      attackProfileCount: 433,
      outcomeCount: 34640,
      outcomes: { calculated: 34600, unavailableUnderPolicy: 40 },
      parityCount: 34600,
      parityFailures: [],
      unavailable: [
        {
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile',
          reason: 'policyExcluded',
        },
      ],
      conditionSummaries: [
        {
          key: 'fixture-condition',
          elapsedMs: 1,
          digest: 'record-sha',
          damageCache: { cacheHitCount: 3 },
        },
      ],
      eligibility: {
        conditionCount: 80,
        staticSemantics: { operations: 7, digest: 'static-sha' },
        admissions: {
          observations: 33760,
          dispositions: { admitted: 4 },
          digest: 'admission-sha',
          shardDigests: ['partition-sha'],
        },
        candidates: {
          generated: 12,
          byPolicy: { baseline: 3 },
          digest: 'candidate-sha',
          shardDigests: ['partition-sha'],
        },
      },
      digest: 'matrix-sha',
    };
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: 'fixture-master',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    const audit = {
      conditionCount: source.matrix.conditionCount,
      attackProfileCount: source.matrix.attackProfileCount,
      outcomeCount: source.matrix.outcomeCount,
      outcomes: source.matrix.outcomes,
      parityCount: source.matrix.parityCount,
      parityFailures: [],
      digest: '0'.repeat(64),
      eligibility: { candidates: { digest: 'changed-candidate-sha' } },
    };
    const cases: [string, unknown, string][] = [
      [
        'reason',
        { ...expected, unavailable: [{ ...expected.unavailable[0], reason: 'changed' }] },
        'unavailable[0].reason',
      ],
      [
        'observations',
        {
          ...expected,
          eligibility: {
            ...expected.eligibility,
            admissions: {
              ...expected.eligibility.admissions,
              observations: 33761,
              digest: 'changed-sha',
            },
          },
        },
        'eligibility.admissions.observations',
      ],
      [
        'static',
        {
          ...expected,
          eligibility: {
            ...expected.eligibility,
            staticSemantics: { operations: 8, digest: 'changed-sha' },
          },
        },
        'eligibility.staticSemantics.operations',
      ],
      [
        'candidate',
        {
          ...expected,
          eligibility: {
            ...expected.eligibility,
            candidates: {
              ...expected.eligibility.candidates,
              generated: 13,
              digest: 'changed-sha',
            },
          },
        },
        'eligibility.candidates.generated',
      ],
      [
        'disposition',
        {
          ...expected,
          eligibility: {
            ...expected.eligibility,
            admissions: { ...expected.eligibility.admissions, dispositions: { admitted: 5 } },
          },
        },
        'eligibility.admissions.dispositions.admitted',
      ],
      [
        'candidatePolicy',
        {
          ...expected,
          eligibility: {
            ...expected.eligibility,
            candidates: { ...expected.eligibility.candidates, byPolicy: { baseline: 4 } },
          },
        },
        'eligibility.candidates.byPolicy.baseline',
      ],
      [
        'summary',
        {
          ...expected,
          conditionSummaries: [
            { ...expected.conditionSummaries[0], damageCache: { cacheHitCount: 4 } },
          ],
        },
        'conditionSummaries[0].damageCache.cacheHitCount',
      ],
      ['unknownField', { ...expected, additionalAggregate: 1 }, 'additionalAggregate'],
      [
        'outcomes',
        { ...expected, outcomes: { ...expected.outcomes, calculated: 34601 } },
        'outcomes.calculated',
      ],
      [
        'missing',
        { ...expected, eligibility: { ...expected.eligibility, admissions: {} } },
        'eligibility.admissions.dispositions',
      ],
      [
        'checksumOnly',
        {
          ...expected,
          eligibility: {
            ...expected.eligibility,
            candidates: { ...expected.eligibility.candidates, digest: 'changed-sha' },
          },
        },
        'eligibility.candidates.digest',
      ],
    ];
    const results = cases.map(([name, actual, path]) => {
      const failures = compareProductionMatrixAggregates(expected, actual);
      const gate = evaluateProductionParityGate(source, audit, {
        status: 'failed',
        failures,
        firstDifference: failures[0]?.firstDifference ?? null,
      });
      expect(gate, name).toMatchObject({
        status: 'failed',
        reason: 'canonicalAggregateMismatch',
        firstDifference: { identity: 'tsk-06.5:production-matrix', path },
      });
      expect(gate.failures, name).toHaveLength(1);
      return { name, actual, gate };
    });
    expect(results[1]?.gate.firstDifference).toMatchObject({ expected: 33760, actual: 33761 });
    const measured = {
      ...expected,
      conditionSummaries: [{ ...expected.conditionSummaries[0], elapsedMs: 999 }],
    };
    expect(compareProductionMatrixAggregates(expected, measured)).toEqual([]);
    await writeProductionClosureDiagnosticArtifact(
      task.meta,
      'production-matrix-aggregate-diagnostics.json',
      { expected, results, measured },
    );
  },
);

it(
  'constructs exactly the 80 legal production conditions and reuses one supplied inventory',
  productionAuditTestOptions(['production-closure-parity-diagnostics.json']),
  async ({ task }) => {
    const conditions = productionClosureConditions();
    const conditionCount = conditions.length;
    const uniqueConditionCount = new Set(conditions.map(productionClosureConditionKey)).size;
    const conditionInputsLegal = conditions.every(
      (condition) =>
        condition.npLevelBasis.kind === 'specified' &&
        condition.initialOvercharge <=
          (condition.npLevelBasis.npLevel === 1 ? 1 : condition.npLevelBasis.npLevel === 5 ? 3 : 2),
    );

    const master = masterSnapshotSchema.parse(fixture);
    const preparationObservations: ProductionPreparationTransactionObservation[] = [];
    const audit = await auditProductionClosure(
      master,
      { servantBuilds: {} },
      {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        appVersion: APP_VERSION,
        masterDataVersion: master.version,
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      },
      ({ records, ...summary }) => {
        for (const value of records) {
          if (
            typeof value === 'object' &&
            value !== null &&
            'status' in value &&
            value.status === 'calculated' &&
            'profileKey' in value &&
            typeof value.profileKey === 'string' &&
            'scenario' in value &&
            typeof value.scenario === 'object' &&
            value.scenario !== null &&
            'preNoblePhantasmPlan' in value.scenario &&
            Array.isArray(value.scenario.preNoblePhantasmPlan) &&
            'appliedPreparationActions' in value &&
            Array.isArray(value.appliedPreparationActions)
          )
            preparationObservations.push({
              conditionKey: summary.key,
              profileKey: value.profileKey,
              commands: value.scenario
                .preNoblePhantasmPlan as ProductionPreparationTransactionObservation['commands'],
              actions:
                value.appliedPreparationActions as ProductionPreparationTransactionObservation['actions'],
            });
        }
      },
      conditions.slice(0, 1),
    );
    const preparationTransactionAudit =
      auditProductionPreparationTransactionObservations(preparationObservations);
    const preparationGate = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: audit.outcomes.calculated,
      ...preparationTransactionAudit,
    });

    const canonicalFailure = compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'portable',
      actualStatus: 'executable',
      expected: { scenario: { phase: 'expected', value: 1 } },
      actual: { scenario: { phase: 'actual', value: 1 } },
    });
    const statusFailure = compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'calculator',
      actualStatus: 'rejected',
      expected: { scenario: { phase: 'expected', value: 1 } },
      actual: null,
    });
    const matchingParity = compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'calculator',
      actualStatus: 'executable',
      expected: { scenario: { phase: 'same' } },
      actual: { scenario: { phase: 'same' } },
    });
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: 'fixture-master',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    const matrixInput = {
      conditionCount: source.matrix.conditionCount,
      attackProfileCount: source.matrix.attackProfileCount,
      outcomeCount: source.matrix.outcomeCount,
      outcomes: source.matrix.outcomes,
      parityCount: source.matrix.parityCount,
      digest: source.matrix.mergedDigest,
      eligibility: { candidates: { digest: source.matrix.eligibilityDigest } },
    };
    const parityGate = evaluateProductionParityGate(source, {
      ...matrixInput,
      parityFailures: canonicalFailure ? [canonicalFailure] : [],
    });
    const passingParityGate = evaluateProductionParityGate(source, {
      ...matrixInput,
      parityFailures: [],
    });
    const digestMismatch = evaluateProductionParityGate(source, {
      ...matrixInput,
      digest: '0'.repeat(64),
      parityFailures: [],
    });
    const eligibilityMismatch = evaluateProductionParityGate(source, {
      ...matrixInput,
      eligibility: { candidates: { digest: '0'.repeat(64) } },
      parityFailures: [],
    });
    const missingEligibilityMismatch = evaluateProductionParityGate(source, {
      ...matrixInput,
      eligibility: {} as typeof matrixInput.eligibility,
      parityFailures: [],
    });
    const portableRequests: {
      original: Parameters<typeof portableOwner.executePortableCalculation>[0];
      forwarded: Parameters<typeof portableOwner.executePortableCalculation>[0];
      preparedScenarios: Parameters<typeof scenarioOwner.prepareCalculationScenarioWithPolicy>[0][];
      result: ReturnType<typeof portableOwner.executePortableCalculation>;
    }[] = [];
    const realPortable = portableOwner.executePortableCalculation;
    const fault = vi
      .spyOn(portableOwner, 'executePortableCalculation')
      .mockImplementation((request, data) => {
        const forwarded = structuredClone(request);
        const preparedScenarios: Parameters<
          typeof scenarioOwner.prepareCalculationScenarioWithPolicy
        >[0][] = [];
        const realPrepare = scenarioOwner.prepareCalculationScenarioWithPolicy;
        const preparationFault = vi
          .spyOn(scenarioOwner, 'prepareCalculationScenarioWithPolicy')
          .mockImplementation((scenario, ...args) => {
            const changed = structuredClone(scenario);
            if (portableRequests.length === 0 && changed.mode === 'resolved')
              changed.attacker.fouAtk += 1;
            preparedScenarios.push(changed);
            return realPrepare(changed, ...args);
          });
        try {
          const result = realPortable(forwarded, data);
          portableRequests.push({ original: request, forwarded, preparedScenarios, result });
          return result;
        } finally {
          preparationFault.mockRestore();
        }
      });
    let executionParity;
    try {
      executionParity = await auditProductionClosure(
        master,
        { servantBuilds: {} },
        {
          schemaVersion: SCHEMA_VERSION,
          engineVersion: ENGINE_VERSION,
          appVersion: APP_VERSION,
          masterDataVersion: master.version,
          gameRegion: 'JP',
          masterDataLocale: 'ja-JP',
        },
        undefined,
        conditions.slice(0, 1),
      );
    } finally {
      fault.mockRestore();
    }
    await writeParityDiagnosticArtifact(task.meta, {
      schemaVersion: 1,
      boundary: 'calculation-application-production-parity',
      source: 'productionClosureAudit.test.ts',
      audit,
      preparationObservations,
      preparationGate,
      passingParityGate,
      parityGate,
      digestMismatch,
      eligibilityMismatch,
      missingEligibilityMismatch,
      comparisons: { canonicalFailure, statusFailure, matchingParity },
      failures: [canonicalFailure, statusFailure].filter(Boolean),
      firstDifference: canonicalFailure?.firstDifference,
      executionFailure: { portableRequests, audit: executionParity },
    });
    assertFailureProbe('parityGateSensitivity', parityGate);
    expect(portableRequests.length).toBeGreaterThan(0);
    expect(executionParity.parityFailures).toHaveLength(1);
    expect(executionParity.parityFailures[0]).toMatchObject({
      path: 'portable',
      reason: 'canonicalMismatch',
      firstDifference: { path: 'input.fouAtk', expected: 1000, actual: 1001 },
    });
    if (process.env['FGO_TSK08_FAILURE_CLASS_PROBE'] === 'parity')
      expect(
        executionParity.parityFailures,
        JSON.stringify({
          failureClass: 'parity',
          reason: executionParity.parityFailures[0]?.reason,
          canonicalIdentity: executionParity.parityFailures[0]?.canonicalIdentity,
          firstDifference: executionParity.parityFailures[0]?.firstDifference,
        }),
      ).toEqual([]);
    expect(conditionCount).toBe(80);
    expect(uniqueConditionCount).toBe(80);
    expect(conditionInputsLegal).toBe(true);
    expect(audit).toMatchObject({
      conditionCount: 1,
      outcomeCount: audit.attackProfileCount,
      outcomes: { invalid: 0, unsupported: 0, inputRequired: 0 },
      parityFailures: [],
    });
    expect(audit.parityCount).toBe(audit.outcomes.calculated);
    expect(audit.eligibility.conditionCount).toBe(1);
    expect(audit.eligibility.staticSemantics.servants).toBe(master.servants.length);
    expect(audit.eligibility.staticSemantics.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.admissions.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.candidates.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.eligibility.staticSemantics.sourcePrograms).toBeGreaterThan(0);
    expect(audit.eligibility.admissions.dispositions).toBeGreaterThan(0);
    expect(audit.eligibility.candidates.generated).toBeGreaterThan(0);
    expect(preparationGate).toMatchObject({
      status: 'passed',
      summary: {
        calculatedProfiles: audit.outcomes.calculated,
        commandCount: preparationObservations.reduce(
          (count, observation) => count + observation.commands.length,
          0,
        ),
        actionCount: preparationObservations.reduce(
          (count, observation) => count + observation.actions.length,
          0,
        ),
      },
      firstDifference: null,
    });
    expect(canonicalFailure).toMatchObject({
      reason: 'canonicalMismatch',
      canonicalIdentity: 'production:fixture-condition:profile:fixture-profile:parity:portable',
      firstDifference: {
        identity: 'production:fixture-condition:profile:fixture-profile:parity:portable',
        path: 'scenario.phase',
        expected: 'expected',
        actual: 'actual',
      },
    });
    expect(statusFailure).toMatchObject({
      reason: 'executionNotExecutable',
      firstDifference: { path: 'status', expected: 'executable', actual: 'rejected' },
    });
    expect(matchingParity).toBeNull();
    expect(passingParityGate).toMatchObject({
      status: 'passed',
      canonicalIdentity: 'tsk-06.5:production-matrix',
      firstDifference: null,
    });
    expect(parityGate).toMatchObject({
      status: 'failed',
      reason: 'parityFailure',
      canonicalIdentity: 'tsk-06.5:production-matrix',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'parityFailures',
        expected: 0,
        actual: 1,
      },
      failures: [canonicalFailure],
    });
    expect(digestMismatch).toMatchObject({
      status: 'failed',
      reason: 'canonicalRecordsMissing',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'digest',
        expected: source.matrix.mergedDigest,
        actual: '0'.repeat(64),
      },
      failures: [],
    });
    expect(eligibilityMismatch).toMatchObject({
      status: 'failed',
      reason: 'matrixMismatch',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'eligibilityDigest',
        expected: source.matrix.eligibilityDigest,
        actual: '0'.repeat(64),
      },
    });
    expect(missingEligibilityMismatch).toMatchObject({
      status: 'failed',
      reason: 'matrixMismatch',
      firstDifference: {
        identity: 'tsk-06.5:production-matrix',
        path: 'eligibilityDigest',
        expected: source.matrix.eligibilityDigest,
        actual: undefined,
      },
    });
  },
);

it(
  'fails closed on final profile statuses and retains unique profile identities',
  productionAuditTestOptions(['production-final-outcome-diagnostics.json']),
  async ({ task }) => {
    const passing = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 0, invalid: 0, inputRequired: 0 },
      failures: [],
    });
    const failed = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 1, invalid: 1, inputRequired: 1 },
      failures: [
        {
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-u',
          status: 'unsupported',
        },
        { conditionKey: 'fixture-condition', profileKey: 'fixture-profile-i', status: 'invalid' },
        {
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-r',
          status: 'inputRequired',
        },
      ],
    });
    const missingIdentity = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 1, invalid: 0, inputRequired: 0 },
      failures: [],
    });
    const duplicateIdentity = evaluateProductionFinalOutcomeGate({
      outcomes: { unsupported: 2, invalid: 0, inputRequired: 0 },
      failures: [
        { conditionKey: 'fixture-condition', profileKey: 'fixture-profile', status: 'unsupported' },
        { conditionKey: 'fixture-condition', profileKey: 'fixture-profile', status: 'unsupported' },
      ],
    });
    await writeProductionClosureDiagnosticArtifact(
      task.meta,
      'production-final-outcome-diagnostics.json',
      {
        schemaVersion: 1,
        boundary: 'calculation-application-final-profile-outcomes',
        canonicalIdentity: passing.canonicalIdentity,
        passing,
        intentionalFailures: [failed, missingIdentity, duplicateIdentity],
      },
    );
    assertFailureProbe('unsupportedGateSensitivity', failed, 'finalProfileStatusPresent');
    if (process.env['FGO_TSK08_FAILURE_CLASS_PROBE'] === 'invalidGateSensitivity') {
      const invalidFailure = failed.failures.find(
        (failure) => failure.reason === 'finalProfileStatusPresent' && failure.status === 'invalid',
      );
      expect(
        failed.status,
        JSON.stringify({
          failureClass: 'invalid',
          reason: invalidFailure?.reason ?? null,
          canonicalIdentity: invalidFailure?.canonicalIdentity ?? null,
          firstDifference: invalidFailure?.firstDifference ?? null,
        }),
      ).toBe('passed');
    }
    expect(passing).toMatchObject({
      status: 'passed',
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
      firstDifference: null,
      failures: [],
    });
    expect(failed).toMatchObject({
      status: 'failed',
      canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
      firstDifference: {
        identity: 'tsk-06.5:final-profile-outcomes',
        path: 'inputRequired',
        expected: 0,
        actual: 1,
      },
      failures: [
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile-u:final-outcome',
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-u',
          status: 'unsupported',
          expected: 'calculated',
          actual: 'unsupported',
          firstDifference: { path: 'status', expected: 'calculated', actual: 'unsupported' },
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile-i:final-outcome',
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-i',
          status: 'invalid',
          expected: 'calculated',
          actual: 'invalid',
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile-r:final-outcome',
          conditionKey: 'fixture-condition',
          profileKey: 'fixture-profile-r',
          status: 'inputRequired',
          expected: 'calculated',
          actual: 'inputRequired',
        },
      ],
    });
    expect(missingIdentity).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'finalProfileOutcomeIdentityMismatch',
          canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
        },
      ],
    });
    expect(duplicateIdentity).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'finalProfileOutcomeIdentityMismatch',
          firstDifference: { path: 'distinctProfileFailures', expected: 2, actual: 1 },
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile:final-outcome',
          status: 'unsupported',
        },
        {
          reason: 'finalProfileStatusPresent',
          canonicalIdentity: 'production:fixture-condition:profile:fixture-profile:final-outcome',
          status: 'unsupported',
        },
      ],
    });
  },
);

it(
  'ties production preparation commands to their committed action and NP-use receipt',
  productionAuditTestOptions(['production-preparation-transaction-diagnostics.json']),
  async ({ task }) => {
    const skillCommand = {
      kind: 'useSkillSlot',
      slot: 1,
      skillLevel: 10,
      choice: null,
    } as const;
    const attackCommand = { kind: 'executeAttackNoblePhantasm' } as const;
    const initialResource = { npLevel: 1 as const, capacity: 10_000, gauge: 10_000 };
    const consumedResource = { ...initialResource, gauge: 0 };
    const receipt = {
      actionId: 'preparation:1:executeAttackNoblePhantasm',
      gaugeBefore: 10_000,
      baseOc: 1,
      boostTotal: 0,
      effectiveOc: 1,
      participatingInstances: [],
      excludedInstances: [],
      boostUses: [],
    };
    const skillAction: ProductionPreparationTransactionAction = {
      command: skillCommand,
      sourceKind: 'skill',
      baseOvercharge: null,
      ocUse: null,
      resourceBefore: initialResource,
      resourceAfter: initialResource,
      resourceTransaction: { afterConsumption: initialResource, mutations: [] },
      ocOutcomes: [],
    };
    const attackAction: ProductionPreparationTransactionAction = {
      command: attackCommand,
      sourceKind: 'attackNoblePhantasm',
      baseOvercharge: 1,
      ocUse: receipt,
      resourceBefore: initialResource,
      resourceAfter: consumedResource,
      resourceTransaction: { afterConsumption: consumedResource, mutations: [] },
      ocOutcomes: [],
    };
    const observation = {
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      commands: [skillCommand, attackCommand],
      actions: [skillAction, attackAction],
    };
    const audit = auditProductionPreparationTransactionObservations([observation]);
    const gainedResource = { ...consumedResource, gauge: 2_000 };
    const gainAction: ProductionPreparationTransactionAction = {
      ...attackAction,
      resourceAfter: gainedResource,
      ocOutcomes: [{ step: 0, outcome: 'notApplicable' }],
      resourceTransaction: {
        afterConsumption: consumedResource,
        mutations: [
          {
            step: 0,
            occurrenceId: 'np-before-damage-gain',
            before: consumedResource,
            after: gainedResource,
          },
        ],
      },
    };
    expect(
      auditProductionPreparationTransactionObservations([
        { ...observation, actions: [skillAction, gainAction] },
      ]).failures,
    ).toEqual([]);
    const partialCommitObservation = {
      ...observation,
      actions: [
        skillAction,
        {
          ...gainAction,
          resourceTransaction: {
            ...gainAction.resourceTransaction,
            mutations: [
              { ...gainAction.resourceTransaction.mutations[0]!, before: initialResource },
            ],
          },
        },
      ],
    };
    const partialCommitAudit = auditProductionPreparationTransactionObservations([
      partialCommitObservation,
    ]);
    const partialCommit = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...partialCommitAudit,
    });
    const passing = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...audit,
    });
    const staleReceiptAction = {
      ...attackAction,
      ocUse: { ...receipt, actionId: 'preparation:0:executeAttackNoblePhantasm' },
    };
    const staleReceiptObservation = { ...observation, actions: [skillAction, staleReceiptAction] };
    const failedAudit = auditProductionPreparationTransactionObservations([
      staleReceiptObservation,
    ]);
    const failed = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...failedAudit,
    });
    const missingProfile = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 2,
      ...audit,
    });
    const discontinuousResourceObservation = {
      ...observation,
      actions: [
        { ...skillAction, resourceAfter: { ...initialResource, gauge: 15_000 } },
        attackAction,
      ],
    };
    const discontinuousResourceAudit = auditProductionPreparationTransactionObservations([
      discontinuousResourceObservation,
    ]);
    const discontinuousResource = evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: 1,
      ...discontinuousResourceAudit,
    });
    await writePreparationTransactionDiagnosticArtifact(task.meta, {
      schemaVersion: 1,
      boundary: 'calculation-application-production-preparation-transaction',
      source: 'productionClosureAudit.test.ts',
      canonicalIdentity: 'tsk-08:preparation-transactions',
      observations: [
        observation,
        partialCommitObservation,
        staleReceiptObservation,
        discontinuousResourceObservation,
      ],
      audit,
      partialCommitAudit,
      failedAudit,
      discontinuousResourceAudit,
      passing,
      intentionalFailures: [partialCommit, failed, missingProfile, discontinuousResource],
    });
    // Receipt/resource sensitivity is distinct from execution-level rejection and stale reads.
    expect(partialCommit).toMatchObject({
      status: 'failed',
      firstDifference: {
        identity: 'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        path: 'valid',
        expected: true,
        actual: false,
      },
      failures: [
        {
          reason: 'preparationResourceCommitMismatch',
          canonicalIdentity:
            'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        },
      ],
    });
    expect(passing).toMatchObject({
      status: 'passed',
      canonicalIdentity: 'tsk-08:preparation-transactions',
      summary: {
        calculatedProfiles: 1,
        commandCount: 2,
        actionCount: 2,
        npUseReceiptCount: 1,
      },
      firstDifference: null,
      failures: [],
    });
    expect(failed).toMatchObject({
      status: 'failed',
      firstDifference: {
        identity: 'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        path: 'actionId',
        expected: 'preparation:1:executeAttackNoblePhantasm',
        actual: 'preparation:0:executeAttackNoblePhantasm',
      },
      failures: [
        {
          reason: 'preparationReceiptMismatch',
          canonicalIdentity:
            'production:fixture-condition:profile:fixture-profile:preparation:action:1',
        },
      ],
    });
    expect(missingProfile).toMatchObject({
      status: 'failed',
      firstDifference: {
        identity: 'tsk-08:preparation-transactions',
        path: 'calculatedProfiles',
        expected: 2,
        actual: 1,
      },
      failures: [
        {
          reason: 'preparationProfileCoverageMismatch',
          canonicalIdentity: 'tsk-08:preparation-transactions',
        },
      ],
    });
    expect(
      discontinuousResourceAudit.failures.find(
        ({ reason }) => reason === 'preparationResourceSequenceMismatch',
      ),
    ).toMatchObject({
      reason: 'preparationResourceSequenceMismatch',
      canonicalIdentity:
        'production:fixture-condition:profile:fixture-profile:preparation:action:1',
      firstDifference: { path: 'gauge', expected: 15_000, actual: 10_000 },
    });
    expect(discontinuousResource).toMatchObject({ status: 'failed' });
  },
);

it(
  'requires user controls to reach their ordered operation or bound damage input',
  productionAuditTestOptions(['production-inert-control-fixture.json']),
  async ({ task }) => {
    const identity: ProductionUserControlObservation['identity'] = {
      ownerId: 'fixture-servant',
      profileKey: 'fixture-profile',
      path: 'selectedProfile',
      projectionKey: 'np:fixture:traitCount:trait:burn',
      operationId: 'np:fixture:damage',
      contributionId: 'np:fixture:damage:npSpecial',
      modifier: 'npSpecial',
      contributionControl: 'worldAssumption',
    };
    const event = (
      projectionKey: string,
      projectionOutcome: ProductionUserControlObservation['enabled']['operationEvents'][number]['projectionOutcome'],
    ): ProductionUserControlObservation['enabled']['operationEvents'][number] => ({
      projectionKey,
      operationId: identity.operationId,
      contributionId: 'np:fixture:damage:npBase',
      kind: 'executeNpDamage',
      operationOutcome: 'applied',
      projectionOutcome,
      projectionValuePermille: null,
    });
    const executionObservation = (
      operationEvents: readonly ProductionUserControlObservation['enabled']['operationEvents'][number][],
    ): ProductionUserControlObservation['enabled']['executionObservation'] => ({
      battlePointWitness: null,
      targetExecution: {
        selection: 'selected',
        candidateIndex: 0,
        targetCandidate: {
          classId: 'saber',
          attribute: 'man',
          families: [],
          facts: [],
        },
        operationEvents: operationEvents.map((operationEvent, sequence) => ({
          sequence,
          operationId: operationEvent.operationId,
          projectionKey: operationEvent.projectionKey,
          contributionId: operationEvent.contributionId,
          operationKind: operationEvent.kind,
          operationOutcome: operationEvent.operationOutcome,
          projectionOutcome: operationEvent.projectionOutcome,
          condition: 'satisfied',
          projectionValuePermille: operationEvent.projectionValuePermille,
        })),
      },
    });
    const projection = (
      outcome: ProductionUserControlObservation['enabled']['projections'][number]['outcome'],
    ): ProductionUserControlObservation['enabled']['projections'][number] => ({
      projectionKey: identity.projectionKey,
      operationId: identity.operationId,
      contributionId: identity.contributionId,
      outcome,
      valuePermille: 1_500,
    });
    const contribution = (
      effective: boolean,
      executionOutcome: ProductionUserControlObservation['enabled']['effectiveContributions'][number]['executionOutcome'],
    ): ProductionUserControlObservation['enabled']['effectiveContributions'][number] => ({
      operationId: identity.operationId,
      contributionId: identity.contributionId!,
      modifier: 'npSpecial',
      resolvedValue: null,
      executionOutcome,
      effective,
    });
    const observation: ProductionUserControlObservation = {
      identity,
      enabled: {
        executionObservation: executionObservation([event('np:fixture:operation', 'applied')]),
        operationEvents: [event('np:fixture:operation', 'applied')],
        projections: [projection('applied')],
        inputBinding: {
          kind: 'bound',
          address: 'npSpecialMultipliers',
          value: [1.5, 1.5, 1.5, 1.5, 1.5],
        },
        effectiveContributions: [contribution(true, 'applied')],
        damageResult: { status: 'calculated', rows: [{ average: 1_500 }] },
      },
      excluded: {
        executionObservation: executionObservation([event('np:fixture:operation', 'notApplied')]),
        operationEvents: [event('np:fixture:operation', 'notApplied')],
        projections: [projection('notApplied')],
        inputBinding: {
          kind: 'bound',
          address: 'npSpecialMultipliers',
          value: [1, 1, 1, 1, 1],
        },
        effectiveContributions: [contribution(false, 'notApplied')],
        damageResult: { status: 'calculated', rows: [{ average: 1_000 }] },
      },
    };
    const passing = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      expectedIdentities: [identity],
      observations: [observation],
    });
    const inertNpSpecialObservation: ProductionUserControlObservation = {
      ...observation,
      excluded: {
        ...observation.excluded,
        executionObservation: executionObservation([event('np:fixture:operation', 'applied')]),
        operationEvents: [event('np:fixture:operation', 'applied')],
        projections: [projection('applied')],
        inputBinding: observation.enabled.inputBinding,
        effectiveContributions: [contribution(true, 'applied')],
        damageResult: observation.enabled.damageResult,
      },
    };
    const inertNpSpecial = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      expectedIdentities: [identity],
      observations: [inertNpSpecialObservation],
    });

    const modifierContributionId = 'skill:fixture:operation:modifier' as const;
    const modifierIdentity: ProductionUserControlObservation['identity'] = {
      ...identity,
      projectionKey: 'skill:fixture:attackBuff',
      operationId: 'skill:fixture:operation',
      contributionId: modifierContributionId,
      modifier: 'attackBuff',
      contributionControl: 'operation' as const,
    };
    const inertModifier: ProductionUserControlObservation = {
      identity: modifierIdentity,
      enabled: {
        executionObservation: executionObservation([
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ]),
        operationEvents: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ],
        projections: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            outcome: 'applied',
            valuePermille: 200,
          },
        ],
        inputBinding: { kind: 'bound', address: 'attackBuff', value: 0.2 },
        effectiveContributions: [
          {
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            modifier: 'attackBuff',
            resolvedValue: 200,
            executionOutcome: 'applied',
            effective: true,
          },
        ],
        damageResult: { status: 'calculated', rows: [{ average: 1_200 }] },
      },
      excluded: {
        executionObservation: executionObservation([
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ]),
        operationEvents: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            kind: 'addModifier',
            operationOutcome: 'applied',
            projectionOutcome: 'applied',
            projectionValuePermille: 200,
          },
        ],
        projections: [
          {
            projectionKey: modifierIdentity.projectionKey,
            operationId: modifierIdentity.operationId,
            contributionId: modifierIdentity.contributionId,
            outcome: 'applied',
            valuePermille: 200,
          },
        ],
        inputBinding: { kind: 'bound', address: 'attackBuff', value: 0.2 },
        effectiveContributions: [
          {
            operationId: modifierIdentity.operationId,
            contributionId: modifierContributionId,
            modifier: 'attackBuff',
            resolvedValue: 200,
            executionOutcome: 'applied',
            effective: true,
          },
        ],
        damageResult: { status: 'calculated', rows: [{ average: 1_200 }] },
      },
    };
    const inertOperation = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      expectedIdentities: [modifierIdentity],
      observations: [inertModifier],
    });
    const unresolvedSelectionObservation: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        executionObservation: {
          battlePointWitness: null,
          targetExecution: {
            selection: 'unresolved',
            targetResolution: { kind: 'impossible', sourceKeys: ['fixture-target'] },
            operationEvents: [],
          },
        },
      },
    };
    const unresolvedSelection = auditProductionUserControlObservations({
      expectedProjectionCount: 1,
      expectedIdentities: [identity],
      observations: [unresolvedSelectionObservation],
    });
    const auditOne = (candidate: ProductionUserControlObservation) =>
      auditProductionUserControlObservations({
        expectedProjectionCount: 1,
        expectedIdentities: [candidate.identity],
        observations: [candidate],
      });
    const nonAppliedEvent: ProductionUserControlObservation['excluded']['operationEvents'][number] =
      {
        ...inertModifier.excluded.operationEvents[0]!,
        operationOutcome: 'notApplied',
        projectionOutcome: 'notApplied',
      };
    const normalNonApplication: ProductionUserControlObservation = {
      ...inertModifier,
      excluded: {
        ...inertModifier.excluded,
        executionObservation: executionObservation([nonAppliedEvent]),
        operationEvents: [nonAppliedEvent],
        projections: [{ ...inertModifier.excluded.projections[0]!, outcome: 'notApplied' }],
        effectiveContributions: [
          {
            ...inertModifier.excluded.effectiveContributions[0]!,
            executionOutcome: 'notApplied',
            effective: false,
          },
        ],
      },
    };
    const normalNonApplicationGate = auditOne(normalNonApplication);
    const excludedOutcomeGate = (outcome: 'notRelevant' | 'impossible') => {
      const alternateEvent = {
        ...nonAppliedEvent,
        operationOutcome: outcome,
        projectionOutcome: outcome,
      };
      return auditOne({
        ...normalNonApplication,
        excluded: {
          ...normalNonApplication.excluded,
          executionObservation: executionObservation([alternateEvent]),
          operationEvents: [alternateEvent],
          projections: [{ ...normalNonApplication.excluded.projections[0]!, outcome }],
          effectiveContributions: [
            {
              ...normalNonApplication.excluded.effectiveContributions[0]!,
              executionOutcome: outcome,
            },
          ],
        },
      });
    };
    const notRelevantGate = excludedOutcomeGate('notRelevant');
    const impossibleGate = excludedOutcomeGate('impossible');
    const alternateGate = auditOne({
      ...normalNonApplication,
      identity: { ...normalNonApplication.identity, path: 'withoutAreaAlternate' },
    });
    const withoutBinding: ProductionUserControlObservation = {
      ...normalNonApplication,
      identity: {
        ...normalNonApplication.identity,
        contributionId: null,
        modifier: null,
      },
      enabled: {
        ...normalNonApplication.enabled,
        executionObservation: executionObservation([
          {
            ...normalNonApplication.enabled.operationEvents[0]!,
            contributionId: null,
            kind: 'addQuantity',
          },
        ]),
        operationEvents: [
          {
            ...normalNonApplication.enabled.operationEvents[0]!,
            contributionId: null,
            kind: 'addQuantity',
          },
        ],
        projections: [{ ...normalNonApplication.enabled.projections[0]!, contributionId: null }],
        inputBinding: { kind: 'unbound', reason: 'projection_has_no_damage_input_binding' },
        effectiveContributions: [],
      },
      excluded: {
        ...normalNonApplication.excluded,
        executionObservation: executionObservation([
          {
            ...nonAppliedEvent,
            contributionId: null,
            kind: 'addQuantity',
          },
        ]),
        operationEvents: [{ ...nonAppliedEvent, contributionId: null, kind: 'addQuantity' }],
        projections: [{ ...normalNonApplication.excluded.projections[0]!, contributionId: null }],
        inputBinding: { kind: 'unbound', reason: 'projection_has_no_damage_input_binding' },
        effectiveContributions: [],
      },
    };
    const withoutBindingGate = auditOne(withoutBinding);
    const missingProjection: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, projections: [] },
    };
    const missingEvent: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, operationEvents: [] },
    };
    const missingContribution: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, effectiveContributions: [] },
    };
    const eventContradiction: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        operationEvents: [
          { ...observation.enabled.operationEvents[0]!, projectionOutcome: 'notApplied' },
        ],
      },
    };
    const contributionContradiction: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        effectiveContributions: [
          {
            ...observation.enabled.effectiveContributions[0]!,
            modifier: 'attackBuff',
          },
        ],
      },
    };
    const partialContribution: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        effectiveContributions: [
          {
            ...observation.enabled.effectiveContributions[0]!,
            effective: false,
          },
        ],
      },
    };
    const bindingContradiction: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff', value: [1.5] as never },
      },
    };
    const explicitlyUndefined: ProductionUserControlObservation = {
      ...normalNonApplication,
      enabled: {
        ...normalNonApplication.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff', value: undefined as never },
      },
    };
    const absentValue: ProductionUserControlObservation = {
      ...explicitlyUndefined,
      enabled: {
        ...explicitlyUndefined.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff' } as never,
      },
    };
    const nullValue: ProductionUserControlObservation = {
      ...normalNonApplication,
      enabled: {
        ...normalNonApplication.enabled,
        inputBinding: { kind: 'bound', address: 'attackBuff', value: null as never },
      },
    };
    const unresolvedDamage: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, damageResult: { status: 'unsupported', rows: [] } },
    };
    const invalidDamage: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, damageResult: { status: 'invalid', rows: [] } },
    };
    const inputRequiredDamage: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled, damageResult: { status: 'inputRequired', rows: [] } },
    };
    const unsupportedProjection: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        projections: [{ ...observation.enabled.projections[0]!, outcome: 'unsupported' }],
      },
    };
    const ambiguousTarget: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        executionObservation: {
          battlePointWitness: null,
          targetExecution: {
            selection: 'ambiguous',
            candidates: [0, 1].map((candidateIndex) => ({
              candidateIndex,
              targetCandidate: { classId: 'saber', attribute: 'man', families: [], facts: [] },
              operationEvents: [],
            })),
          },
        },
      },
    };
    const unsupportedTarget: ProductionUserControlObservation = {
      ...unresolvedSelectionObservation,
      enabled: {
        ...unresolvedSelectionObservation.enabled,
        executionObservation: {
          battlePointWitness: null,
          targetExecution: {
            selection: 'unresolved',
            targetResolution: { kind: 'unsupported', reason: 'targetSearchLimit', sourceKeys: [] },
            operationEvents: [],
          },
        },
      },
    };
    const absentTarget: ProductionUserControlObservation = {
      ...observation,
      enabled: {
        ...observation.enabled,
        executionObservation: { battlePointWitness: null, targetExecution: null },
      },
    };
    const missingFields: ProductionUserControlObservation = {
      ...observation,
      enabled: { ...observation.enabled },
    };
    Reflect.deleteProperty(missingFields.enabled, 'projections');
    const absentIdentity: ProductionUserControlObservation = {
      ...observation,
      identity: { ...observation.identity },
    };
    Reflect.deleteProperty(absentIdentity.identity, 'contributionId');
    const undefinedIdentity: ProductionUserControlObservation = {
      ...observation,
      identity: { ...observation.identity, contributionId: undefined as never },
    };
    const absentInputValueGate = auditOne(absentValue);
    const undefinedInputValueGate = auditOne(explicitlyUndefined);
    const nullInputValueGate = auditOne(nullValue);
    const failureCases = {
      inventoryCount: auditProductionUserControlObservations({
        expectedProjectionCount: 2,
        expectedIdentities: [identity, modifierIdentity],
        observations: [observation],
      }),
      duplicateIdentity: auditProductionUserControlObservations({
        expectedProjectionCount: 2,
        expectedIdentities: [identity, modifierIdentity],
        observations: [observation, observation],
      }),
      sameCountDifferentIdentity: auditProductionUserControlObservations({
        expectedProjectionCount: 1,
        expectedIdentities: [identity],
        observations: [normalNonApplication],
      }),
      missingProjection: auditOne(missingProjection),
      missingEvent: auditOne(missingEvent),
      missingContribution: auditOne(missingContribution),
      eventContradiction: auditOne(eventContradiction),
      contributionContradiction: auditOne(contributionContradiction),
      partialContribution: auditOne(partialContribution),
      bindingContradiction: auditOne(bindingContradiction),
      absentInputValue: absentInputValueGate,
      undefinedInputValue: undefinedInputValueGate,
      nullInputValue: nullInputValueGate,
      missingFields: auditOne(missingFields),
      absentIdentity: auditOne(absentIdentity),
      undefinedIdentity: auditOne(undefinedIdentity),
      unresolvedDamage: auditOne(unresolvedDamage),
      invalidDamage: auditOne(invalidDamage),
      inputRequiredDamage: auditOne(inputRequiredDamage),
      unsupportedProjection: auditOne(unsupportedProjection),
      ambiguousTarget: auditOne(ambiguousTarget),
      unsupportedTarget: auditOne(unsupportedTarget),
      absentTarget: auditOne(absentTarget),
    };
    await writeUserControlDiagnosticArtifact(task.meta, {
      schemaVersion: 1,
      boundary: 'calculation-application-production-inert-control',
      source: 'productionClosureAudit.test.ts',
      passing,
      observations: [
        observation,
        inertNpSpecialObservation,
        inertModifier,
        unresolvedSelectionObservation,
      ],
      passingCases: {
        normalNonApplicationGate,
        notRelevantGate,
        impossibleGate,
        withoutBindingGate,
      },
      failureCases,
      intentionalFailures: [inertNpSpecial, inertOperation, unresolvedSelection, alternateGate],
    });
    expect(passing).toMatchObject({
      status: 'passed',
      summary: {
        projectionCount: 1,
        selectedProfileCount: 1,
        operationEventCount: 2,
        effectiveContributionCount: 2,
        directInputDifferenceCount: 1,
        eventProjectionOutcomeDifferenceCount: 1,
        damageResultDifferenceCount: 1,
      },
      failures: [],
    });
    expect(observation.excluded.effectiveContributions[0]?.resolvedValue).toBeNull();
    expect(passing.firstDifference).toBeNull();
    expect(
      auditProductionUserControlObservations({
        expectedProjectionCount: 1,
        expectedIdentities: [identity],
        observations: [
          {
            ...observation,
            preparationSelection: {
              kind: 'reachableAlternate',
              plan: [{ kind: 'executeAttackNoblePhantasm' }],
            },
          },
        ],
      }),
    ).toMatchObject({
      status: 'failed',
      failures: [{ reason: 'userControlConflictCounterexampleInvalid' }],
    });
    expect(inertNpSpecial).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'userControlNpSpecialInputNotChanged',
          firstDifference: { path: 'changed', expected: true, actual: false },
        },
      ],
    });
    assertFailureProbe('inertControl', inertOperation);
    expect(inertOperation).toMatchObject({
      status: 'failed',
      failures: [
        {
          reason: 'userControlDidNotReachOperationOrDamage',
          firstDifference: {
            path: 'reached',
            expected: true,
            actual: false,
          },
        },
      ],
    });
    expect(unresolvedSelection.failures).toContainEqual(
      expect.objectContaining({ reason: 'userControlExecutionSelectionNotUnique' }),
    );
    for (const gate of [
      normalNonApplicationGate,
      notRelevantGate,
      impossibleGate,
      withoutBindingGate,
    ])
      expect(gate).toMatchObject({ status: 'passed', firstDifference: null, failures: [] });
    // A path tag without the actual ranking producer binding is not alternate proof.
    expect(alternateGate.status).toBe('failed');
    expect(alternateGate.failures).toContainEqual(
      expect.objectContaining({ reason: 'userControlRankingSourceMismatch' }),
    );
    const reasons = {
      inventoryCount: 'userControlInventoryCoverageMismatch',
      duplicateIdentity: 'userControlDuplicateIdentity',
      sameCountDifferentIdentity: 'userControlInventoryCoverageMismatch',
      missingProjection: 'userControlProjectionIdentityMismatch',
      missingEvent: 'userControlOperationEventMissing',
      missingContribution: 'userControlEffectiveContributionMissing',
      eventContradiction: 'userControlObservationInconsistent',
      contributionContradiction: 'userControlObservationInconsistent',
      partialContribution: 'userControlObservationInconsistent',
      bindingContradiction: 'userControlInputBindingUnsupported',
      absentInputValue: 'userControlInputBindingUnsupported',
      undefinedInputValue: 'userControlInputBindingUnsupported',
      nullInputValue: 'userControlInputBindingUnsupported',
      missingFields: 'userControlObservationInconsistent',
      absentIdentity: 'userControlProjectionIdentityMismatch',
      undefinedIdentity: 'userControlProjectionIdentityMismatch',
      unresolvedDamage: 'userControlDamageOutcomeNotCalculated',
      invalidDamage: 'userControlDamageOutcomeNotCalculated',
      inputRequiredDamage: 'userControlDamageOutcomeNotCalculated',
      unsupportedProjection: 'userControlObservationInconsistent',
      ambiguousTarget: 'userControlExecutionSelectionNotUnique',
      unsupportedTarget: 'userControlExecutionSelectionNotUnique',
      absentTarget: 'userControlExecutionObservationMissing',
    } as const;
    for (const [name, gate] of Object.entries(failureCases)) {
      const reason = reasons[name as keyof typeof reasons];
      expect(gate.status, name).toBe('failed');
      expect(
        gate.failures.map((failure) => failure.reason),
        name,
      ).toContain(reason);
      expect(gate.firstDifference?.identity, name).toBe(gate.failures[0]?.canonicalIdentity);
    }
    expect(absentInputValueGate.failures[0]?.firstDifference.path).toBe('present');
    expect(undefinedInputValueGate.failures[0]?.firstDifference.path).toBe('valueDefined');
    expect(nullInputValueGate.failures[0]?.firstDifference.path).toBe('valueValid');
    expect(failureCases.ambiguousTarget.failures[0]?.firstDifference.path).toBe('selection');
    expect(failureCases.unsupportedTarget.failures[0]?.firstDifference.path).toBe('selection');
    expect(failureCases.absentIdentity.failures[0]?.firstDifference.path).toBe(
      'contributionIdPresent',
    );
    expect(failureCases.undefinedIdentity.failures[0]?.firstDifference.path).toBe(
      'contributionIdType',
    );
    expect(failureCases.sameCountDifferentIdentity.failures[0]?.firstDifference.path).toContain(
      'identities',
    );
  },
);

it(
  'rejects contradictory canonical record bodies and drills down before matrix SHA diagnostics',
  productionAuditTestOptions(['production-record-integrity.json']),
  async ({ task }) => {
    const { inspectProductionConditionRecord, compareProductionConditionRecords } =
      await import('./productionClosureRecordIntegrity');
    const record = {
      profileKey: 'fixture-profile',
      status: 'calculated',
      canonicalInput: { fouAtk: 1000 },
    };
    const records = [record];
    const identity = { masterDataVersion: 'fixture-master', masterSha256: '1'.repeat(64) };
    const summary = {
      key: 'fixture-condition',
      conditions: productionClosureConditions()[0]!,
      elapsedMs: 0,
      calculated: 1,
      unavailableUnderPolicy: 0,
      inputRequired: 0,
      invalid: 0,
      unsupported: 0,
      parityCount: 1,
      parityFailures: [],
      damageCache: {
        requestCount: 1,
        distinctDamageInputCount: 1,
        cacheHitCount: 0,
        cacheHitRate: 0,
      },
      candidateInventory: {
        semanticUpperBound: 1,
        generatedCount: 1,
        deduplicatedCount: 1,
        damageRequestUpperBound: 1,
        damageRequestCount: 1,
        distinctDamageInputCount: 1,
      },
      digest: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
    };
    const inspect = (value: unknown) =>
      inspectProductionConditionRecord({
        value,
        identity,
        summary,
        conditionKey: summary.key,
        profileCount: 1,
      });
    const expected = inspect({ identity, summary, records });
    expect(expected.failures).toEqual([]);
    const changed = { ...record, canonicalInput: { fouAtk: 1001 } };
    const broken = inspect({ identity, summary, records: [changed] });
    expect(broken.failures.map((failure) => failure.reason)).toContain('recordDigestMismatch');
    const bodyFailures = compareProductionConditionRecords(expected.records, broken.records);
    expect(bodyFailures).toMatchObject([
      {
        reason: 'canonicalRecordMismatch',
        firstDifference: {
          identity: 'production:fixture-condition:profile:fixture-profile',
          path: 'canonicalInput.fouAtk',
          expected: 1000,
          actual: 1001,
        },
      },
    ]);
    const repairedSummary = {
      ...summary,
      digest: createHash('sha256')
        .update(JSON.stringify([changed]))
        .digest('hex'),
    };
    const internallyConsistent = inspectProductionConditionRecord({
      value: { identity, summary: repairedSummary, records: [changed] },
      identity,
      summary: repairedSummary,
      conditionKey: summary.key,
      profileCount: 1,
    });
    expect(internallyConsistent.failures).toEqual([]);
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: 'fixture-master',
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    const gate = evaluateProductionParityGate(
      source,
      {
        conditionCount: source.matrix.conditionCount,
        attackProfileCount: source.matrix.attackProfileCount,
        outcomeCount: source.matrix.outcomeCount,
        outcomes: source.matrix.outcomes,
        parityCount: source.matrix.parityCount,
        parityFailures: [],
        digest: '0'.repeat(64),
        eligibility: { candidates: { digest: source.matrix.eligibilityDigest } },
      },
      {
        status: 'failed',
        failures: bodyFailures,
        firstDifference: bodyFailures[0]!.firstDifference,
      },
    );
    expect(gate).toMatchObject({
      status: 'failed',
      reason: 'canonicalRecordMismatch',
      firstDifference: { path: 'canonicalInput.fouAtk', expected: 1000, actual: 1001 },
    });
    const missing = inspect({ identity, summary, records: [] });
    const duplicate = inspect({ identity, summary, records: [record, record] });
    const wrongIdentity = inspect({
      identity: { ...identity, masterDataVersion: 'wrong' },
      summary,
      records,
    });
    const wrongStatus = inspect({ identity, summary, records: [{ ...record, status: 'unknown' }] });
    const missingProfile = compareProductionConditionRecords(expected.records, missing.records);
    expect(missing.failures.map((f) => f.reason)).toContain('recordSummaryMismatch');
    expect(missingProfile[0]?.firstDifference).toMatchObject({
      identity: 'production:fixture-condition:profile:fixture-profile',
      path: 'present',
      actual: false,
    });
    expect(duplicate.failures.map((f) => f.reason)).toContain('recordProfileDuplicate');
    expect(wrongIdentity.failures.map((f) => f.reason)).toContain('recordIdentityMismatch');
    expect(wrongStatus.failures.map((f) => f.reason)).toContain('recordShapeInvalid');
    const manyExpected = Array.from({ length: 1024 }, (_, index) => ({
      identity: `production:fixture-condition:profile:${index}`,
      value: { canonicalInput: { fouAtk: 1000 } },
    }));
    const manyActual = manyExpected.map(({ identity }) => ({
      identity,
      value: { canonicalInput: { fouAtk: 1001 } },
    }));
    const manyFailures = compareProductionConditionRecords(manyExpected, manyActual);
    expect(manyFailures).toHaveLength(1024);
    expect(manyFailures.every((f) => f.firstDifference.path === 'canonicalInput.fouAtk')).toBe(
      true,
    );
    await writeProductionClosureDiagnosticArtifact(task.meta, 'production-record-integrity.json', {
      expected,
      broken,
      internallyConsistent,
      gate,
      missing,
      duplicate,
      wrongIdentity,
      wrongStatus,
      missingProfile,
      manyFailures,
    });
  },
);

function acceptSerializedFixture(values: readonly unknown[]) {
  return acceptProductionShardManifests(
    values,
    values.map(() => ['fixture-condition']),
  );
}
function serializedShardFixture(): ProductionSerializedShard {
  const audit: ProductionClosureAudit = emptyProductionAudit();
  audit.conditionCount = 1;
  audit.eligibility.conditionCount = 1;
  audit.conditionSummaries = [
    {
      key: 'fixture-condition',
      conditions: productionClosureConditions()[0]!,
      elapsedMs: 0,
      ...audit.outcomes,
      parityCount: 0,
      parityFailures: [],
      damageCache: {
        requestCount: 0,
        distinctDamageInputCount: 0,
        cacheHitCount: 0,
        cacheHitRate: 0,
      },
      candidateInventory: {
        semanticUpperBound: 0,
        generatedCount: 0,
        deduplicatedCount: 0,
        damageRequestUpperBound: 0,
        damageRequestCount: 0,
        distinctDamageInputCount: 0,
      },
      digest: '0'.repeat(64),
    },
  ];
  return {
    identity: {
      head: '0'.repeat(40),
      worktree: '',
      masterDataVersion: 'fixture',
      masterSha256: '0'.repeat(64),
      command: 'canonical producer',
      matrix: 'canonical matrix',
    },
    audit,
    productionArtifacts: {
      conditionRecords: [
        {
          conditionKey: 'fixture-condition',
          path: 'fixture-condition.json',
          bytes: 1,
          sha256: '0'.repeat(64),
        },
      ],
    },
    artifactVerification: {
      verified: [
        {
          path: 'fixture-condition.json',
          format: 'json',
          allowEmpty: false,
          bytes: 1,
          sha256: '0'.repeat(64),
        },
      ],
      errors: [],
      firstDifference: null,
    },
    executionRatchets: {
      finalProfileOutcomes: evaluateProductionFinalOutcomeGate({
        outcomes: audit.outcomes,
        failures: [],
      }),
      preparationTransactions: evaluateProductionPreparationTransactionGate({
        expectedCalculatedProfiles: 0,
        summary: { calculatedProfiles: 0, commandCount: 0, actionCount: 0, npUseReceiptCount: 0 },
        failures: [],
      }),
    },
  };
}
function changeSerializedFixture(
  value: unknown,
  path: string,
  replacement: unknown,
  remove = false,
): unknown {
  const copy = structuredClone(value);
  const keys = path.split('.');
  let parent = copy as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  const field = keys.at(-1)!;
  if (remove) Reflect.deleteProperty(parent, field);
  else parent[field] = replacement;
  return copy;
}

it.each([
  ['root unknown', 'foreign', 1, false, 'shardManifestUnknownField'],
  [
    'ratchets unknown',
    'executionRatchets.foreign',
    { status: 'failed' },
    false,
    'shardManifestUnknownField',
  ],
  ['artifacts unknown', 'productionArtifacts.foreign', 1, false, 'shardManifestUnknownField'],
  ['identity unknown', 'identity.foreign', 1, false, 'shardManifestUnknownField'],
  ['identity absent', 'identity', null, true, 'shardManifestShapeInvalid'],
  [
    'gate absent',
    'executionRatchets.preparationTransactions',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction failures absent',
    'executionRatchets.preparationTransactions.failures',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction actual absent',
    'executionRatchets.preparationTransactions.actual',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction summary count absent',
    'executionRatchets.preparationTransactions.summary.commandCount',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'foreign transaction identity',
    'executionRatchets.preparationTransactions.canonicalIdentity',
    'foreign-owner',
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'unknown transaction count',
    'executionRatchets.preparationTransactions.actual.foreign',
    1,
    false,
    'shardManifestUnknownField',
  ],
  [
    'transaction contradiction',
    'executionRatchets.preparationTransactions.actual.resourceCommitMismatches',
    1,
    false,
    'shardGateContractMismatch',
  ],
  [
    'transaction string count',
    'executionRatchets.preparationTransactions.summary.actionCount',
    '0',
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction negative count',
    'executionRatchets.preparationTransactions.summary.npUseReceiptCount',
    -1,
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction fractional count',
    'executionRatchets.preparationTransactions.summary.commandCount',
    0.5,
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction unsafe count',
    'executionRatchets.preparationTransactions.summary.commandCount',
    Number.MAX_SAFE_INTEGER + 1,
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'transaction null count',
    'executionRatchets.preparationTransactions.summary.commandCount',
    null,
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'final failures absent',
    'executionRatchets.finalProfileOutcomes.failures',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'final expected absent',
    'executionRatchets.finalProfileOutcomes.expected',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'final difference absent',
    'executionRatchets.finalProfileOutcomes.firstDifference',
    null,
    true,
    'shardManifestShapeInvalid',
  ],
  [
    'unknown final count',
    'executionRatchets.finalProfileOutcomes.actual.foreign',
    1,
    false,
    'shardManifestUnknownField',
  ],
  [
    'final string count',
    'executionRatchets.finalProfileOutcomes.actual.unsupported',
    '0',
    false,
    'shardManifestShapeInvalid',
  ],
  [
    'failed without final failure',
    'executionRatchets.finalProfileOutcomes.status',
    'failed',
    false,
    'shardGateContractMismatch',
  ],
  [
    'failed without transaction failure',
    'executionRatchets.preparationTransactions.status',
    'failed',
    false,
    'shardGateContractMismatch',
  ],
  [
    'invalid final status',
    'executionRatchets.finalProfileOutcomes.status',
    'ignored',
    false,
    'shardManifestShapeInvalid',
  ],
  ['summary entry null', 'audit.conditionSummaries', [null], false, 'shardManifestShapeInvalid'],
  [
    'invalid receipt',
    'artifactVerification.verified',
    [{ path: 'foreign' }],
    false,
    'shardManifestShapeInvalid',
  ],
] as const)(
  'rejects serialized shard %s before projection',
  (_name, path, value, remove, reason) => {
    const result = acceptSerializedFixture([
      changeSerializedFixture(serializedShardFixture(), path, value, remove),
    ]);
    expect(result.shards).toBeNull();
    const differencePaths: Record<string, string> = {
      'executionRatchets.finalProfileOutcomes.status':
        'executionRatchets.finalProfileOutcomes.failures',
      'executionRatchets.preparationTransactions.status':
        'executionRatchets.preparationTransactions.failures',
      'audit.conditionSummaries': 'audit.conditionSummaries[0]',
      'artifactVerification.verified': 'artifactVerification.verified[0].format',
    };
    const expectedPath =
      reason === 'shardGateContractMismatch' ||
      path === 'audit.conditionSummaries' ||
      path === 'artifactVerification.verified'
        ? (differencePaths[path] ?? path)
        : path;
    expect(result.comparison.failures).toContainEqual(
      expect.objectContaining({
        reason,
        canonicalIdentity: 'tsk-08:shard:0',
        firstDifference: expect.objectContaining({ path: expectedPath }) as unknown,
      }),
    );
  },
);

it('rejects matching nonzero expectations and receipt-consistent declaration forgery', () => {
  const final = serializedShardFixture();
  final.audit.outcomes.unsupported = 1;
  final.audit.conditionSummaries[0]!.unsupported = 1;
  final.audit.outcomeCount = 1;
  final.executionRatchets.finalProfileOutcomes = evaluateProductionFinalOutcomeGate({
    outcomes: final.audit.outcomes,
    failures: [{ conditionKey: 'fixture', profileKey: 'fixture-u', status: 'unsupported' }],
  });
  final.executionRatchets.finalProfileOutcomes.expected =
    final.executionRatchets.finalProfileOutcomes.actual;
  expect(acceptSerializedFixture([final]).comparison.failures).toContainEqual(
    expect.objectContaining({
      reason: 'shardGateContractMismatch',
      firstDifference: expect.objectContaining({
        path: 'executionRatchets.finalProfileOutcomes.expected.unsupported',
      }) as unknown,
    }),
  );
  const transaction = serializedShardFixture();
  transaction.executionRatchets.preparationTransactions.expected = {
    ...(transaction.executionRatchets.preparationTransactions.expected as object),
    resourceCommitMismatches: 1,
  };
  transaction.executionRatchets.preparationTransactions.actual =
    transaction.executionRatchets.preparationTransactions.expected;
  expect(acceptSerializedFixture([transaction]).comparison.failures).toContainEqual(
    expect.objectContaining({
      reason: 'shardGateContractMismatch',
      firstDifference: expect.objectContaining({
        path: 'executionRatchets.preparationTransactions.expected.resourceCommitMismatches',
      }) as unknown,
    }),
  );
  const declaration = serializedShardFixture();
  declaration.audit.conditionSummaries[0]!.key = 'fixture';
  declaration.productionArtifacts.conditionRecords = [];
  declaration.artifactVerification.verified = [];
  declaration.productionArtifacts.conditionRecords.push({
    conditionKey: 'fixture',
    path: 'fixture.json',
    bytes: 1,
    sha256: '0'.repeat(64),
  });
  declaration.artifactVerification.verified.push({
    path: 'fixture.json',
    format: 'json',
    allowEmpty: false,
    bytes: 1,
    sha256: '0'.repeat(64),
  });
  expect(acceptProductionShardManifests([declaration], [['fixture']]).comparison.status).toBe(
    'passed',
  );
  expect(
    acceptSerializedFixture([
      changeSerializedFixture(declaration, 'productionArtifacts.conditionRecords.0.foreign', true),
    ]).comparison.failures[0],
  ).toMatchObject({
    reason: 'shardManifestUnknownField',
    firstDifference: { path: 'productionArtifacts.conditionRecords[0].foreign' },
  });
});

function preparationRecordFixture() {
  const command = { kind: 'useSkillSlot', slot: 1, skillLevel: 10, choice: null } as const;
  const resource = { npLevel: 1, capacity: 10000, gauge: 10000 };
  return {
    profileKey: 'fixture-profile',
    status: 'calculated',
    scenario: { preNoblePhantasmPlan: [command] },
    appliedPreparationActions: [
      {
        command,
        sourceKind: 'skill',
        sourceId: 'fixture-source',
        actorFormId: { actorId: 'fixture-actor', limitCount: 0 },
        selectedEffects: [],
        activationFacts: [],
        transition: null,
        resourceBefore: resource,
        resourceAfter: resource,
        resourceTransaction: { afterConsumption: resource, mutations: [] },
        baseOvercharge: null,
        ocUse: null,
        ocOutcomes: [],
      },
    ],
  };
}

it('joins both failed gate unions to original body identities and retains real failures', () => {
  const shard = serializedShardFixture();
  const record = preparationRecordFixture();
  const initial = observeProductionShardRecords({ records: [record] }, 'fixture-condition', 7);
  expect(initial.failures).toEqual([]);
  shard.audit.outcomes.calculated = 1;
  shard.audit.conditionSummaries[0]!.calculated = 1;
  shard.audit.outcomeCount = 1;
  const transaction = auditProductionPreparationTransactionObservations(initial.preparation);
  shard.executionRatchets.preparationTransactions = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: 1,
    ...transaction,
  });
  expect(acceptSerializedFixture([shard]).comparison.status).toBe('passed');
  expect(compareProductionShardGateBodies(shard, 7, transaction, []).status).toBe('passed');
  const summaryForgery = structuredClone(shard);
  summaryForgery.executionRatchets.preparationTransactions.summary.commandCount++;
  expect(
    compareProductionShardGateBodies(summaryForgery, 7, transaction, []).failures[0],
  ).toMatchObject({
    reason: 'shardGateBodyMismatch',
    canonicalIdentity: 'tsk-08:shard:7',
    firstDifference: { path: 'executionRatchets.preparationTransactions.summary.commandCount' },
  });
  record.appliedPreparationActions[0]!.resourceTransaction.afterConsumption = {
    ...record.appliedPreparationActions[0]!.resourceBefore,
    gauge: 0,
  };
  const failedObservation = observeProductionShardRecords(
    { records: [record] },
    'fixture-condition',
    7,
  );
  const failedTransaction = auditProductionPreparationTransactionObservations(
    failedObservation.preparation,
  );
  shard.executionRatchets.preparationTransactions = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: 1,
    ...failedTransaction,
  });
  const failures = compareProductionShardGateBodies(shard, 7, failedTransaction, []);
  expect(failures.failures).toHaveLength(1);
  expect(failures.failures[0]).toMatchObject({
    reason: 'shardExecutionFailed',
    firstDifference: { path: 'executionRatchets.preparationTransactions.status' },
  });
  const gate = shard.executionRatchets.preparationTransactions;
  expect(gate.status).toBe('failed');
  expect(gate.failures[0]).toMatchObject({
    reason: 'preparationResourceCommitMismatch',
    conditionKey: 'fixture-condition',
    profileKey: 'fixture-profile',
    actionIndex: 0,
  });
  for (const path of [
    'failures.0.canonicalIdentity',
    'failures.0.firstDifference.path',
    'failures.0.expected',
    'firstDifference.path',
  ]) {
    const corrupted = changeSerializedFixture(
      shard,
      `executionRatchets.preparationTransactions.${path}`,
      'foreign',
    ) as ProductionSerializedShard;
    expect(
      compareProductionShardGateBodies(corrupted, 7, failedTransaction, []).failures[0]?.reason,
    ).toBe('shardGateBodyMismatch');
  }
  const finalShard = serializedShardFixture();
  finalShard.audit.outcomes.unsupported = 1;
  finalShard.audit.conditionSummaries[0]!.unsupported = 1;
  finalShard.audit.outcomeCount = 1;
  const profileFailures = [
    { conditionKey: 'fixture-condition', profileKey: 'fixture-u', status: 'unsupported' },
  ] as const;
  finalShard.executionRatchets.finalProfileOutcomes = evaluateProductionFinalOutcomeGate({
    outcomes: finalShard.audit.outcomes,
    failures: profileFailures,
  });
  expect(acceptSerializedFixture([finalShard]).comparison.status).toBe('passed');
  const emptyPreparation = auditProductionPreparationTransactionObservations([]);
  expect(
    compareProductionShardGateBodies(finalShard, 7, emptyPreparation, profileFailures).failures[0]
      ?.reason,
  ).toBe('shardExecutionFailed');
  const duplicate = structuredClone(finalShard);
  duplicate.executionRatchets.finalProfileOutcomes.failures = [
    ...duplicate.executionRatchets.finalProfileOutcomes.failures,
    ...duplicate.executionRatchets.finalProfileOutcomes.failures,
  ];
  expect(
    compareProductionShardGateBodies(duplicate, 7, emptyPreparation, profileFailures).failures[0]
      ?.reason,
  ).toBe('shardGateBodyMismatch');
});

it.each([
  'scenario.preNoblePhantasmPlan',
  'appliedPreparationActions.0.resourceTransaction',
  'appliedPreparationActions.0.ocOutcomes',
])('diagnoses missing serialized preparation input %s without a generic exception', (path) => {
  const malformed = changeSerializedFixture(preparationRecordFixture(), path, null, true);
  const observed = observeProductionShardRecords({ records: [malformed] }, 'fixture-condition', 0);
  expect(observed.preparation).toEqual([]);
  expect(observed.failures).toContainEqual(
    expect.objectContaining({
      canonicalIdentity: 'tsk-08:shard:0',
      firstDifference: expect.objectContaining({
        path: `conditions.fixture-condition.records[0].${path.replace('.0', '[0]')}`,
      }) as unknown,
    }),
  );
});

it(
  'retains every preprojection diagnostic for many malformed gates',
  productionAuditTestOptions(['production-serialized-gate-diagnostics.json']),
  async ({ task }) => {
    const value = serializedShardFixture();
    const malformed = {
      ...value,
      ...Object.fromEntries(Array.from({ length: 1024 }, (_, n) => [`unknown${n}`, n])),
    };
    const result = acceptSerializedFixture([malformed]);
    expect(result.comparison.failures).toHaveLength(1024);
    await writeProductionClosureDiagnosticArtifact(
      task.meta,
      'production-serialized-gate-diagnostics.json',
      { malformed, result },
    );
  },
);

it('rejects duplicate declarations even with internally matching receipts and diagnoses nested OC corruption', () => {
  const shard = serializedShardFixture();
  const declaration = {
    conditionKey: 'fixture',
    path: 'fixture.json',
    bytes: 1,
    sha256: '0'.repeat(64),
  };
  shard.audit.conditionSummaries[0]!.key = 'fixture';
  shard.productionArtifacts.conditionRecords = [declaration, declaration];
  shard.artifactVerification.verified = [0, 1].map(() => ({
    path: declaration.path,
    format: 'json' as const,
    allowEmpty: false as const,
    bytes: declaration.bytes,
    sha256: declaration.sha256,
  }));
  expect(
    acceptProductionShardManifests([shard], [['fixture']]).comparison.failures[0],
  ).toMatchObject({
    reason: 'shardGateContractMismatch',
    firstDifference: { path: 'productionArtifacts.conditionRecords[1]' },
  });
  const record = preparationRecordFixture();
  const ocUse = {
    actionId: 'fixture',
    gaugeBefore: 10000,
    baseOc: 1,
    boostTotal: 1,
    effectiveOc: 2,
    participatingInstances: [0],
    excludedInstances: [],
    boostUses: [null],
  };
  const actual = changeSerializedFixture(record, 'appliedPreparationActions.0.ocUse', ocUse);
  const observed = observeProductionShardRecords({ records: [actual] }, 'fixture-condition', 7);
  expect(observed.preparation).toEqual([]);
  expect(observed.failures[0]).toMatchObject({
    reason: 'shardManifestShapeInvalid',
    firstDifference: {
      path: 'conditions.fixture-condition.records[0].appliedPreparationActions[0].ocUse.boostUses[0]',
    },
  });
});

it('accepts every shard shape before cross-shard joins and rejects missing or duplicate summaries', () => {
  const valid = serializedShardFixture();
  const malformed = changeSerializedFixture(valid, 'audit.eligibility.staticSemantics', null, true);
  const shape = acceptProductionShardManifests(
    [malformed, valid],
    [['fixture-condition'], ['fixture-condition']],
  );
  expect(shape.shards).toBeNull();
  expect(shape.comparison.failures[0]).toMatchObject({
    reason: 'shardAuditShapeInvalid',
    canonicalIdentity: 'tsk-08:shard:0',
    firstDifference: { path: 'audit.eligibility.staticSemantics.type' },
  });
  const duplicate = structuredClone(valid);
  duplicate.audit.conditionSummaries = [
    ...duplicate.audit.conditionSummaries,
    { ...duplicate.audit.conditionSummaries[0]! },
  ];
  expect(acceptSerializedFixture([duplicate]).comparison.failures[0]).toMatchObject({
    reason: 'shardGateContractMismatch',
    firstDifference: { path: 'audit.conditionSummaries[1]' },
  });
  const missing = structuredClone(valid);
  missing.audit.conditionSummaries = [];
  expect(acceptSerializedFixture([missing]).comparison.failures[0]).toMatchObject({
    reason: 'shardGateContractMismatch',
    firstDifference: { path: 'audit.conditionSummaries[0]' },
  });
  const changed = structuredClone(valid);
  changed.audit.eligibility.staticSemantics.sourcePrograms++;
  expect(
    acceptProductionShardManifests([valid, changed], [['fixture-condition'], ['fixture-condition']])
      .comparison.failures[0],
  ).toMatchObject({
    reason: 'shardGateContractMismatch',
    canonicalIdentity: 'tsk-08:shard:1',
    firstDifference: { path: 'audit.eligibility.staticSemantics.sourcePrograms' },
  });
});

it('normalizes only declared optional HP snapshots and preserves presence-sensitive modifier states', () => {
  const action = preparationRecordFixture().appliedPreparationActions[0]! as ReturnType<
    typeof productionParityActions
  >[number];
  const source = { ...action, hpBefore: undefined, hpAfter: undefined };
  const projected = productionParityActions([source]);
  expect(Object.hasOwn(projected[0]!, 'hpBefore')).toBe(false);
  expect(JSON.stringify(projected)).toBe(JSON.stringify([source]));
  const withNull = productionParityActions([
    { ...source, hpBefore: null } as unknown as typeof source,
  ]);
  expect(inspectProductionAuditValue(withNull)).toMatchObject({
    status: 'accepted',
    value: [{ hpBefore: null }],
  });
  const nested = productionParityActions([
    {
      ...source,
      hpBefore: { actors: {}, receipts: [], modifiers: [{ unresolvedCondition: undefined }] },
    } as unknown as typeof source,
  ]);
  expect(inspectProductionAuditValue(nested)).toMatchObject({
    status: 'failed',
    issues: [{ path: '0.hpBefore.modifiers.0.unresolvedCondition', kind: 'undefined' }],
  });
});

it.each(['identity', 'summary', 'record', 'array', 'signedZero'])(
  'rejects raw condition %s before digest and exposes no partial records',
  async (place) => {
    const { inspectProductionConditionRecord } = await import('./productionClosureRecordIntegrity');
    const shard = serializedShardFixture();
    const summary = shard.audit.conditionSummaries[0]!;
    const raw = {
      identity: shard.identity,
      summary,
      records: [{ profileKey: 'profile', status: 'unavailableUnderPolicy', value: null }],
    };
    const value = structuredClone(raw);
    if (place === 'identity')
      (value.identity as unknown as Record<string, unknown>)['masterSha256'] = Infinity;
    if (place === 'summary') value.summary.elapsedMs = -Infinity;
    if (place === 'record')
      (value.records[0] as unknown as Record<string, unknown>)['value'] = Infinity;
    if (place === 'array')
      (value.records[0] as unknown as Record<string, unknown>)['nested'] = [1, { value: Infinity }];
    if (place === 'signedZero')
      (value.records[0] as unknown as Record<string, unknown>)['value'] = -0;
    for (const envelope of [
      value,
      JSON.parse(
        JSON.stringify(value).replace(
          place === 'identity'
            ? '"masterSha256":null'
            : place === 'summary'
              ? '"elapsedMs":null'
              : place === 'signedZero'
                ? '"value":0'
                : '"value":null',
          place === 'identity'
            ? '"masterSha256":1e309'
            : place === 'summary'
              ? '"elapsedMs":-1e309'
              : place === 'signedZero'
                ? '"value":-0'
                : '"value":1e309',
        ),
      ),
    ]) {
      const result = inspectProductionConditionRecord({
        value: envelope,
        identity: shard.identity,
        summary,
        conditionKey: summary.key,
        profileCount: 1,
      });
      expect(result).toMatchObject({
        status: 'failed',
        records: [],
        failures: [{ reason: 'recordValueInvalid' }],
      });
      expect((JSON.parse(JSON.stringify(result)) as typeof result).failures[0]!.actual).toEqual(
        result.failures[0]!.actual,
      );
    }
    const expectedInvalid = inspectProductionConditionRecord({
      value: raw,
      identity: { invalid: NaN },
      summary,
      conditionKey: summary.key,
      profileCount: 1,
    });
    expect(expectedInvalid).toMatchObject({
      status: 'failed',
      records: [],
      failures: [{ reason: 'recordValueInvalid' }],
    });
  },
);

it('rejects invalid shard values before any schema or cross-shard join and retains all issues', () => {
  const value = serializedShardFixture();
  const malformed = {
    ...value,
    ...Object.fromEntries(Array.from({ length: 1024 }, (_, n) => [`number${n}`, Infinity])),
  };
  const result = acceptSerializedFixture([malformed]);
  expect(result.shards).toBeNull();
  expect(result.comparison.failures).toHaveLength(1024);
  expect(
    result.comparison.failures.every((failure) => failure.reason === 'recordValueInvalid'),
  ).toBe(true);
  expect(inspectProductionAuditValue(result).status).toBe('accepted');
});

it('rejects source-side nonfinite compact records before observer or digest', async () => {
  const master = masterSnapshotSchema.parse(fixture);
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    masterDataVersion: master.version,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };
  const conditions = productionClosureConditions()[0]!;
  const ranking = rankingOwner.calculateRankingPolicy(
    master,
    { servantBuilds: {} },
    conditions,
    versions,
  );
  const calculated = Object.values(ranking.profileResults).find(
    (outcome) => outcome.status === 'calculated',
  );
  if (calculated?.status !== 'calculated') throw new Error('fixture has no calculated profile');
  calculated.detail.input.targetRarity = Infinity;
  const observer = vi.fn();
  const spy = vi.spyOn(rankingOwner, 'calculateRankingPolicy').mockReturnValue(ranking);
  try {
    await expect(
      auditProductionClosure(master, { servantBuilds: {} }, versions, observer, [conditions]),
    ).rejects.toMatchObject({
      canonicalIdentity: `production:${productionClosureConditionKey(conditions)}`,
      inspection: {
        status: 'failed',
        issues: [{ kind: 'nonFiniteNumber', representation: 'Infinity' }],
      },
    });
    expect(observer).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

it('rejects nonfinite transaction observations even when both resource sequence sides match', () => {
  const record = preparationRecordFixture();
  const action = record.appliedPreparationActions[0]!;
  const resource = { ...action.resourceBefore, gauge: Infinity };
  const corrupted = {
    ...action,
    resourceBefore: resource,
    resourceAfter: resource,
    resourceTransaction: { afterConsumption: resource, mutations: [] },
  };
  const observation = {
    conditionKey: 'condition',
    profileKey: 'profile',
    commands: [action.command, action.command],
    actions: [corrupted, corrupted],
  };
  const audit = auditProductionPreparationTransactionObservations([
    observation as unknown as ProductionPreparationTransactionObservation,
  ]);
  expect(audit.failures).toMatchObject([
    { reason: 'auditValueInvalid', firstDifference: { path: 'actions.0.resourceBefore.gauge' } },
  ]);
  expect(
    evaluateProductionPreparationTransactionGate({ expectedCalculatedProfiles: 1, ...audit }),
  ).toMatchObject({ status: 'failed', failures: [{ reason: 'auditValueInvalid' }] });
  expect(inspectProductionAuditValue(audit).status).toBe('accepted');
});

it('retains producer value-failure metadata through shard acceptance without treating it as unknown', () => {
  const producer = {
    ...serializedShardFixture(),
    status: 'failed',
    stage: 'audit-conditions',
    failure: { name: 'TypeError', reason: 'production_audit_value_invalid' },
    auditValueFailure: {
      reason: 'auditValueInvalid',
      canonicalIdentity: 'production:condition',
      status: 'failed',
      issues: [{ path: 'records.0.input', kind: 'nonFiniteNumber', representation: 'Infinity' }],
      diagnostic: {
        records: [
          { input: { auditValueInvalid: { kind: 'nonFiniteNumber', representation: 'Infinity' } } },
        ],
      },
    },
  };
  const result = acceptSerializedFixture([producer]);
  expect(result.shards).toBeNull();
  expect(result.comparison.failures[0]).toMatchObject({
    reason: 'recordValueInvalid',
    firstDifference: { path: 'auditValueFailure' },
  });
  expect(
    result.comparison.failures.some((failure) => failure.reason === 'shardManifestUnknownField'),
  ).toBe(false);
});
