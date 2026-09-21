import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import {
  auditProductionClosure,
  productionClosureConditionKey,
  productionClosureConditions,
} from './productionClosureAudit';
import { compareProductionParity } from './productionParityDiagnostics';

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
  await writeParityDiagnosticArtifact({
    schemaVersion: 1,
    boundary: 'calculation-application-production-parity',
    source: 'productionClosureAudit.test.ts',
    audit,
    intentionalFailures: [canonicalFailure, statusFailure],
  });
});
