// One-way extraction of the approved fixed input. Never calls the damage producer.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { inspectProductionAuditValue } from '../src/productionAuditValue';
import {
  productionClosureConditions,
  productionClosureConditionKey,
  productionClosureMatrixDigest,
} from '../src/productionClosureAudit';
import {
  inspectProductionConditionRecord,
  inspectProductionMatrixAuditShapes,
  inspectProductionAuditAggregate,
  compareProductionConditionRecords,
} from '../src/productionClosureRecordIntegrity';
import { inspectProductionConditionSummaries } from '../src/productionShardAcceptance';
import {
  PRODUCTION_BASELINE_FORMAT,
  productionBaselineSha256,
  readProductionBaselineCondition,
  type ProductionBaselineManifest,
} from '../src/productionRegressionBaseline';

const origin = {
  head: '60dea89944a884bbbe40464eb1ae7e65cb77ad4e',
  manifestBytes: 394462,
  manifestSha256: '879af462bd3209ffaf18365a25598bbcf07e008b6164991d65355ad55cb1a95a',
};
const identity = {
  head: origin.head,
  worktree: ' M pnpm-lock.yaml\n M pnpm-workspace.yaml\n',
  masterDataVersion: '20260920.3',
  masterSha256: '2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a',
  command:
    'pnpm --filter @fgo-lab/data-pipeline exec tsx ../calculation-application/scripts/audit-oc-matrix.ts <output>',
  matrix: 'naturalLimit|uniformLevel90 × four policies × ten legal NP/initial-OC pairs',
};
async function migrate() {
  const [sourcePath, destination, receiptPath] = process.argv.slice(2);
  if (!sourcePath || !destination || !receiptPath)
    throw new Error(
      'usage: migrate-production-baseline.ts <fixed-original-manifest> <new-baseline-directory> <migration-receipt>',
    );
  const bytes = await readFile(sourcePath);
  assert.equal(bytes.length, origin.manifestBytes);
  assert.equal(productionBaselineSha256(bytes), origin.manifestSha256);
  const original = JSON.parse(bytes.toString('utf8'));
  assert.equal(inspectProductionAuditValue(original).status, 'accepted');
  assert.deepEqual(original.identity, identity);
  assert.equal(inspectProductionMatrixAuditShapes([original.audit]).status, 'passed');
  assert.equal(
    inspectProductionConditionSummaries(original.audit.conditionSummaries, 'run').status,
    'passed',
  );
  assert.deepEqual(inspectProductionAuditAggregate(original.audit, 'migration'), []);
  const { digest, ...originalAudit } = original.audit;
  assert.equal(productionClosureMatrixDigest(originalAudit), digest);
  assert.equal(digest, '04415e8ab05dfcb5afa58210176357fb095e0b5faeed2aa4815273b00be68fc4');
  assert.equal(
    original.audit.eligibility.candidates.digest,
    '68e41503a7663fa32607cbe1b26f670c0940f33f4f0a3d07b4268a5a5d914759',
  );
  const keys = productionClosureConditions().map(productionClosureConditionKey);
  assert.deepEqual(
    original.productionArtifacts.conditionRecords
      .map((d: { conditionKey: string }) => d.conditionKey)
      .sort(),
    [...keys].sort(),
  );
  assert.deepEqual(
    original.audit.conditionSummaries.map((s: { key: string }) => s.key),
    keys,
  );
  const { head: _head, worktree: _worktree, ...semanticIdentity } = identity;
  const manifest: ProductionBaselineManifest = {
    format: PRODUCTION_BASELINE_FORMAT,
    identity: semanticIdentity,
    origin,
    audit: {
      ...original.audit,
      conditionSummaries: original.audit.conditionSummaries.map(
        ({ elapsedMs: _elapsed, ...summary }: { elapsedMs: number }) => summary,
      ),
    },
    conditions: [],
  };
  // Exclusive directory creation prevents replacing the currently approved baseline.
  await mkdir(destination);
  let recordCount = 0,
    sourceBytes = 0,
    contentBytes = 0,
    storedBytes = 0;
  const equality = [];
  for (const [index, key] of keys.entries()) {
    const declaration = original.productionArtifacts.conditionRecords.find(
      (d: { conditionKey: string }) => d.conditionKey === key,
    );
    assert.deepEqual(Object.keys(declaration).sort(), ['bytes', 'conditionKey', 'path', 'sha256']);
    assert.equal(declaration.path, `${key}.json`);
    const raw = await readFile(resolve(dirname(sourcePath), declaration.path));
    assert.equal(raw.length, declaration.bytes);
    assert.equal(productionBaselineSha256(raw), declaration.sha256);
    const body = JSON.parse(raw.toString('utf8'));
    const summary = original.audit.conditionSummaries[index];
    assert.deepEqual(summary.conditions, productionClosureConditions()[index]);
    const inspected = inspectProductionConditionRecord({
      value: body,
      conditionKey: key,
      identity,
      summary,
      profileCount: 433,
    });
    assert.equal(inspected.status, 'accepted');
    assert.deepEqual(inspected.failures, []);
    const content = Buffer.from(JSON.stringify({ conditionKey: key, records: body.records }));
    const compressed = gzipSync(content);
    assert.deepEqual(JSON.parse(gunzipSync(compressed).toString('utf8')).records, body.records);
    const saved = {
      conditionKey: key,
      path: `${key}.json.gz`,
      bytes: compressed.length,
      sha256: productionBaselineSha256(compressed),
      contentBytes: content.length,
      contentSha256: productionBaselineSha256(content),
    };
    await writeFile(resolve(destination, saved.path), compressed, { flag: 'wx' });
    const restored = await readProductionBaselineCondition({
      directory: destination,
      declaration: saved,
      summary: manifest.audit.conditionSummaries[index]!,
      profileCount: 433,
    });
    assert.equal(restored.status, 'accepted');
    assert.deepEqual(restored.failures, []);
    assert.deepEqual(compareProductionConditionRecords(inspected.records, restored.records), []);
    equality.push({
      conditionKey: key,
      recordCount: body.records.length,
      digest: summary.digest,
      allMeaningValuesEqual: true,
      sourceBytes: raw.length,
      sourceSha256: declaration.sha256,
    });
    manifest.conditions.push(saved);
    recordCount += body.records.length;
    sourceBytes += raw.length;
    contentBytes += content.length;
    storedBytes += compressed.length;
  }
  assert.equal(recordCount, 34640);
  const { digest: finalDigest, ...audit } = manifest.audit;
  assert.equal(productionClosureMatrixDigest(audit), finalDigest);
  const encoded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(destination, 'manifest.json'), encoded, { flag: 'wx' });
  const receipt = {
    status: 'passed',
    format: PRODUCTION_BASELINE_FORMAT,
    origin,
    identity,
    sourceBytes,
    contentBytes,
    storedBytes,
    manifestBytes: encoded.length,
    manifestSha256: productionBaselineSha256(encoded),
    recordCount,
    conditions: equality,
    aggregateInventoryEqual: true,
    digest: finalDigest,
    eligibilityDigest: manifest.audit.eligibility.candidates.digest,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(
    JSON.stringify({
      status: receipt.status,
      recordCount,
      sourceBytes,
      contentBytes,
      storedBytes,
      manifestBytes: encoded.length,
      manifestSha256: receipt.manifestSha256,
    }),
  );
}
void migrate().catch((error) => {
  console.error(String(error).slice(0, 1024));
  process.exitCode = 1;
});
