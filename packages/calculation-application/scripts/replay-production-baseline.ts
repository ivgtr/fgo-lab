// Saved-body acceptance input, not a new damage golden or producer regression run.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createProductionAuditSource } from '@fgo-lab/master-data/production-audit';
import {
  readProductionBaselineManifest,
  readProductionBaselineCondition,
  productionBaselineSha256,
} from '../src/productionRegressionBaseline';
import { productionClosureMatrixDigest } from '../src/productionClosureAudit';
import { observeProductionShardRecords } from '../src/productionShardAcceptance';
import {
  auditProductionPreparationTransactionObservations,
  evaluateProductionPreparationTransactionGate,
  evaluateProductionFinalOutcomeGate,
} from '../src/productionParityDiagnostics';
const root = resolve(import.meta.dirname, '../../..');
async function replay() {
  const destination = process.argv[2];
  if (!destination) throw new Error('usage: replay-production-baseline.ts <new-actual-directory>');
  const sourceValue = JSON.parse(
    await readFile(
      resolve(root, 'packages/calculation-application/baselines/production-v1/source.json'),
      'utf8',
    ),
  );
  const source = createProductionAuditSource(sourceValue, {
    masterDataVersion: sourceValue.productionMatrix.canonicalRecords.identity.masterDataVersion,
    artifact: 'packages/calculation-application/baselines/production-v1/source.json',
  });
  const baseline = await readProductionBaselineManifest(root, source.matrix.canonicalRecords);
  assert.equal(baseline.status, 'accepted');
  if (baseline.status !== 'accepted') throw new Error(JSON.stringify(baseline.failures));
  const fixture = JSON.parse(
    await readFile(
      resolve(root, 'packages/calculation-application/baselines/replay-partitions.json'),
      'utf8',
    ),
  );
  assert.equal(fixture.format, 'production-baseline-replay-v1');
  assert.equal(fixture.baselineManifestSha256, source.matrix.canonicalRecords.sha256);
  assert.deepEqual(
    fixture.partitions.map((p: { partition: number }) => p.partition),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  const identity = {
    head: baseline.manifest.origin.head,
    worktree: '',
    ...baseline.manifest.identity,
  };
  await mkdir(destination);
  const declarations = [],
    observations = [];
  for (const [index, declaration] of baseline.manifest.conditions.entries()) {
    const summary = { ...baseline.manifest.audit.conditionSummaries[index]!, elapsedMs: 0 };
    const inspected = await readProductionBaselineCondition({
      directory: baseline.directory,
      declaration,
      summary,
      profileCount: 433,
    });
    assert.equal(inspected.status, 'accepted');
    assert.deepEqual(inspected.failures, []);
    const value = { identity, summary, records: inspected.records.map((record) => record.value) };
    const observed = observeProductionShardRecords(value, declaration.conditionKey, index % 8);
    assert.deepEqual(observed.failures, []);
    observations.push(observed);
    const bytes = Buffer.from(JSON.stringify(value));
    const d = {
      conditionKey: declaration.conditionKey,
      path: `${declaration.conditionKey}.json`,
      bytes: bytes.length,
      sha256: productionBaselineSha256(bytes),
    };
    await writeFile(resolve(destination, d.path), bytes, { flag: 'wx' });
    declarations.push(d);
  }
  for (let partition = 0; partition < 8; partition++) {
    const summaries = baseline.manifest.audit.conditionSummaries
      .filter((_, index) => index % 8 === partition)
      .map((summary) => ({ ...summary, elapsedMs: 0 }));
    const outcomes = Object.fromEntries(
      Object.keys(baseline.manifest.audit.outcomes).map((key) => [
        key,
        summaries.reduce(
          (sum, summary) => sum + summary[key as keyof typeof baseline.manifest.audit.outcomes],
          0,
        ),
      ]),
    );
    const saved = fixture.partitions[partition];
    const selected = observations.filter((_, index) => index % 8 === partition);
    const transaction = auditProductionPreparationTransactionObservations(
      selected.flatMap((value) => value.preparation),
    );
    const result = {
      conditionCount: 10,
      attackProfileCount: 433,
      outcomeCount: 4330,
      outcomes,
      parityCount: summaries.reduce((sum, summary) => sum + summary.parityCount, 0),
      parityFailures: summaries.flatMap((summary) => summary.parityFailures),
      unavailable: baseline.manifest.audit.unavailable.filter((value) =>
        summaries.some((summary) => summary.key === value.conditionKey),
      ),
      conditionSummaries: summaries,
      eligibility: {
        conditionCount: 10,
        staticSemantics: baseline.manifest.audit.eligibility.staticSemantics,
        admissions: saved.admissions,
        candidates: saved.candidates,
        digest: saved.eligibilityDigest,
      },
    };
    const conditionRecords = declarations.filter((_, index) => index % 8 === partition);
    const shard = {
      identity,
      audit: { ...result, digest: productionClosureMatrixDigest(result) },
      productionArtifacts: { conditionRecords },
      artifactVerification: {
        verified: conditionRecords.map(({ conditionKey: _key, ...d }) => ({
          ...d,
          format: 'json',
          allowEmpty: false,
        })),
        errors: [],
        firstDifference: null,
      },
      executionRatchets: {
        finalProfileOutcomes: evaluateProductionFinalOutcomeGate({
          outcomes: outcomes as { unsupported: number; invalid: number; inputRequired: number },
          failures: selected.flatMap((value) => value.final),
        }),
        preparationTransactions: evaluateProductionPreparationTransactionGate({
          expectedCalculatedProfiles: outcomes['calculated']!,
          ...transaction,
        }),
      },
    };
    await writeFile(
      resolve(destination, `manifest-shard-${partition}.json`),
      JSON.stringify(shard),
      { flag: 'wx' },
    );
  }
  console.log(
    JSON.stringify({
      status: 'passed',
      conditions: 80,
      records: 34640,
      qualification: 'saved-body replay only; does not execute damage producer',
    }),
  );
}
void replay().catch((error) => {
  console.error(String(error).slice(0, 1024));
  process.exitCode = 1;
});
