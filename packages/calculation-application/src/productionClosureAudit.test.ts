import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createTsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import type {
  ProductionPreparationTransactionAction,
  ProductionPreparationTransactionObservation,
} from './productionParityDiagnostics';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import tsk065Evidence from '../../../docs/evidence/tsk-06-5-production-closure.json';
import {
  auditProductionClosure,
  productionClosureConditionKey,
  productionClosureConditions,
} from './productionClosureAudit';
import {
  evaluateProductionFinalOutcomeGate,
  auditProductionPreparationTransactionObservations,
  compareProductionParity,
  evaluateProductionPreparationTransactionGate,
  evaluateProductionParityGate,
  productionFinalOutcomeShardDifference,
} from './productionParityDiagnostics';
import { combineRankingEligibilityPartitionDigests } from './rankingEligibilityAudit';

const productionClosureDiagnosticArtifacts = new Set<string>();

async function writeProductionClosureDiagnosticArtifact(path: string, value: unknown) {
  const artifactDirectory = process.env['FGO_TEST_ARTIFACT_DIR'];
  if (!artifactDirectory) return;
  await writeFile(resolve(artifactDirectory, path), `${JSON.stringify(value, null, 2)}\n`);
  productionClosureDiagnosticArtifacts.add(path);
  await writeFile(
    resolve(artifactDirectory, 'artifact-declarations.json'),
    `${JSON.stringify(
      [...productionClosureDiagnosticArtifacts]
        .sort()
        .map((artifactPath) => ({ path: artifactPath, format: 'json', allowEmpty: false })),
      null,
      2,
    )}\n`,
  );
}

async function writeParityDiagnosticArtifact(value: unknown): Promise<void> {
  return writeProductionClosureDiagnosticArtifact(
    'production-closure-parity-diagnostics.json',
    value,
  );
}

async function writePreparationTransactionDiagnosticArtifact(value: unknown): Promise<void> {
  return writeProductionClosureDiagnosticArtifact(
    'production-preparation-transaction-diagnostics.json',
    value,
  );
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

it('constructs exactly the 80 legal production conditions and reuses one supplied inventory', async () => {
  const conditions = productionClosureConditions();
  expect(conditions).toHaveLength(80);
  expect(new Set(conditions.map(productionClosureConditionKey)).size).toBe(80);
  for (const condition of conditions) {
    if (condition.npLevelBasis.kind !== 'specified') throw new Error('specified NP required');
    const legalMaximum =
      condition.npLevelBasis.npLevel === 1 ? 1 : condition.npLevelBasis.npLevel === 5 ? 3 : 2;
    expect(condition.initialOvercharge).toBeLessThanOrEqual(legalMaximum);
  }

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
  const preparationTransactionAudit =
    auditProductionPreparationTransactionObservations(preparationObservations);
  expect(
    evaluateProductionPreparationTransactionGate({
      expectedCalculatedProfiles: audit.outcomes.calculated,
      ...preparationTransactionAudit,
    }),
  ).toMatchObject({
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

  const canonicalFailure = compareProductionParity({
    conditionKey: 'fixture-condition',
    profileKey: 'fixture-profile',
    path: 'portable',
    actualStatus: 'executable',
    expected: { scenario: { phase: 'expected', value: 1 } },
    actual: { scenario: { phase: 'actual', value: 1 } },
  });
  if (!canonicalFailure) throw new Error('canonical parity fixture must fail');
  const statusFailure = compareProductionParity({
    conditionKey: 'fixture-condition',
    profileKey: 'fixture-profile',
    path: 'calculator',
    actualStatus: 'rejected',
    expected: { scenario: { phase: 'expected', value: 1 } },
    actual: null,
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
  expect(
    compareProductionParity({
      conditionKey: 'fixture-condition',
      profileKey: 'fixture-profile',
      path: 'calculator',
      actualStatus: 'executable',
      expected: { scenario: { phase: 'same' } },
      actual: { scenario: { phase: 'same' } },
    }),
  ).toBeNull();
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
  expect(
    evaluateProductionParityGate(source, { ...matrixInput, parityFailures: [] }),
  ).toMatchObject({
    status: 'passed',
    canonicalIdentity: 'tsk-06.5:production-matrix',
    firstDifference: null,
  });
  const parityGate = evaluateProductionParityGate(source, {
    ...matrixInput,
    parityFailures: [canonicalFailure],
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
  expect(
    evaluateProductionParityGate(source, {
      ...matrixInput,
      digest: '0'.repeat(64),
      parityFailures: [],
    }),
  ).toMatchObject({
    status: 'failed',
    reason: 'matrixMismatch',
    firstDifference: {
      identity: 'tsk-06.5:production-matrix',
      path: 'digest',
      expected: source.matrix.mergedDigest,
      actual: '0'.repeat(64),
    },
    failures: [],
  });
  const eligibilityMismatch = evaluateProductionParityGate(source, {
    ...matrixInput,
    eligibility: { candidates: { digest: '0'.repeat(64) } },
    parityFailures: [],
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
  expect(
    evaluateProductionParityGate(source, {
      ...matrixInput,
      eligibility: {} as typeof matrixInput.eligibility,
      parityFailures: [],
    }),
  ).toMatchObject({
    status: 'failed',
    reason: 'matrixMismatch',
    firstDifference: {
      identity: 'tsk-06.5:production-matrix',
      path: 'eligibilityDigest',
      expected: source.matrix.eligibilityDigest,
      actual: undefined,
    },
  });
  await writeParityDiagnosticArtifact({
    schemaVersion: 1,
    boundary: 'calculation-application-production-parity',
    source: 'productionClosureAudit.test.ts',
    audit,
    parityGate,
    eligibilityMismatch,
    intentionalFailures: [canonicalFailure, statusFailure],
  });
});

it('fails closed on final profile statuses and retains unique profile identities', async () => {
  const passing = evaluateProductionFinalOutcomeGate({
    outcomes: { unsupported: 0, invalid: 0, inputRequired: 0 },
    failures: [],
  });
  const missingShardGateDifference = productionFinalOutcomeShardDifference(undefined, 3);
  const missingFirstDifferenceGate = Object.fromEntries(
    Object.entries(passing).filter(([key]) => key !== 'firstDifference'),
  );
  const missingFirstDifferenceShardDifference = productionFinalOutcomeShardDifference(
    missingFirstDifferenceGate,
    2,
  );
  const mismatchedShardGateDifference = productionFinalOutcomeShardDifference(
    { ...passing, actual: { unsupported: 1, invalid: 0, inputRequired: 0 } },
    1,
  );
  await writeProductionClosureDiagnosticArtifact('production-final-outcome-diagnostics.json', {
    schemaVersion: 1,
    boundary: 'calculation-application-final-profile-outcomes',
    canonicalIdentity: passing.canonicalIdentity,
    passing,
    shardObservations: [
      { shardIndex: 0, gate: passing, difference: null },
      { shardIndex: 3, gate: null, difference: missingShardGateDifference },
      {
        shardIndex: 2,
        gate: missingFirstDifferenceGate,
        difference: missingFirstDifferenceShardDifference,
      },
      {
        shardIndex: 1,
        gate: { ...passing, actual: { unsupported: 1, invalid: 0, inputRequired: 0 } },
        difference: mismatchedShardGateDifference,
      },
    ],
  });
  expect(passing).toMatchObject({
    status: 'passed',
    canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
    firstDifference: null,
    failures: [],
  });
  expect(productionFinalOutcomeShardDifference(passing, 0)).toBeNull();
  expect(missingShardGateDifference).toMatchObject({
    identity: 'tsk-08:final-profile-shard:3',
    path: 'canonicalIdentity',
    expected: 'tsk-06.5:final-profile-outcomes',
    actual: null,
  });
  expect(missingFirstDifferenceShardDifference).toMatchObject({
    identity: 'tsk-08:final-profile-shard:2',
    path: 'hasFirstDifference',
    expected: true,
    actual: false,
  });
  expect(mismatchedShardGateDifference).toMatchObject({
    identity: 'tsk-08:final-profile-shard:1',
    path: 'validGateState',
    expected: true,
    actual: false,
  });

  const failed = evaluateProductionFinalOutcomeGate({
    outcomes: { unsupported: 1, invalid: 1, inputRequired: 1 },
    failures: [
      { conditionKey: 'fixture-condition', profileKey: 'fixture-profile-u', status: 'unsupported' },
      { conditionKey: 'fixture-condition', profileKey: 'fixture-profile-i', status: 'invalid' },
      {
        conditionKey: 'fixture-condition',
        profileKey: 'fixture-profile-r',
        status: 'inputRequired',
      },
    ],
  });
  expect(productionFinalOutcomeShardDifference(failed, 4)).toBeNull();
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

  const missingIdentity = evaluateProductionFinalOutcomeGate({
    outcomes: { unsupported: 1, invalid: 0, inputRequired: 0 },
    failures: [],
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

  const duplicateIdentity = evaluateProductionFinalOutcomeGate({
    outcomes: { unsupported: 2, invalid: 0, inputRequired: 0 },
    failures: [
      { conditionKey: 'fixture-condition', profileKey: 'fixture-profile', status: 'unsupported' },
      { conditionKey: 'fixture-condition', profileKey: 'fixture-profile', status: 'unsupported' },
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
});

it('ties production preparation commands to their committed action and NP-use receipt', async () => {
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
  };
  const attackAction: ProductionPreparationTransactionAction = {
    command: attackCommand,
    sourceKind: 'attackNoblePhantasm',
    baseOvercharge: 1,
    ocUse: receipt,
    resourceBefore: initialResource,
    resourceAfter: consumedResource,
  };
  const observation = {
    conditionKey: 'fixture-condition',
    profileKey: 'fixture-profile',
    commands: [skillCommand, attackCommand],
    actions: [skillAction, attackAction],
  };
  const audit = auditProductionPreparationTransactionObservations([observation]);
  const passing = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: 1,
    ...audit,
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

  const staleReceiptAction = {
    ...attackAction,
    ocUse: { ...receipt, actionId: 'preparation:0:executeAttackNoblePhantasm' },
  };
  const failedAudit = auditProductionPreparationTransactionObservations([
    { ...observation, actions: [skillAction, staleReceiptAction] },
  ]);
  const failed = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: 1,
    ...failedAudit,
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

  const missingProfile = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: 2,
    ...audit,
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
  const discontinuousResourceAudit = auditProductionPreparationTransactionObservations([
    {
      ...observation,
      actions: [
        { ...skillAction, resourceAfter: { ...initialResource, gauge: 15_000 } },
        attackAction,
      ],
    },
  ]);
  expect(discontinuousResourceAudit.failures).toMatchObject([
    {
      reason: 'preparationResourceSequenceMismatch',
      canonicalIdentity:
        'production:fixture-condition:profile:fixture-profile:preparation:action:1',
      firstDifference: { path: 'gauge', expected: 15_000, actual: 10_000 },
    },
  ]);
  const discontinuousResource = evaluateProductionPreparationTransactionGate({
    expectedCalculatedProfiles: 1,
    ...discontinuousResourceAudit,
  });
  expect(discontinuousResource).toMatchObject({ status: 'failed' });
  await writePreparationTransactionDiagnosticArtifact({
    schemaVersion: 1,
    boundary: 'calculation-application-production-preparation-transaction',
    source: 'productionClosureAudit.test.ts',
    canonicalIdentity: 'tsk-08:preparation-transactions',
    passing,
    intentionalFailures: [failed, missingProfile, discontinuousResource],
  });
});
