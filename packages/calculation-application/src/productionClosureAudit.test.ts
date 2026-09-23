import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { createTsk065ProductionAuditSource } from '@fgo-lab/master-data/production-audit';
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
  compareProductionParity,
  evaluateProductionParityGate,
} from './productionParityDiagnostics';
import { combineRankingEligibilityPartitionDigests } from './rankingEligibilityAudit';

async function writeParityDiagnosticArtifact(value: unknown): Promise<void> {
  const artifactDirectory = process.env['FGO_TEST_ARTIFACT_DIR'];
  if (!artifactDirectory) return;
  await writeFile(
    resolve(artifactDirectory, 'production-closure-parity-diagnostics.json'),
    `${JSON.stringify(value, null, 2)}\n`,
  );
  await writeFile(
    resolve(artifactDirectory, 'artifact-declarations.json'),
    `${JSON.stringify(
      [
        {
          path: 'production-closure-parity-diagnostics.json',
          format: 'json',
          allowEmpty: false,
        },
      ],
      null,
      2,
    )}\n`,
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
    undefined,
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

it('fails closed on final profile statuses and retains unique profile identities', () => {
  const passing = evaluateProductionFinalOutcomeGate({
    outcomes: { unsupported: 0, invalid: 0, inputRequired: 0 },
    failures: [],
  });
  expect(passing).toMatchObject({
    status: 'passed',
    canonicalIdentity: 'tsk-06.5:final-profile-outcomes',
    firstDifference: null,
    failures: [],
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
