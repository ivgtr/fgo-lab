import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyArtifactFiles } from './test-observation-lib.mjs';
const root = path.resolve(import.meta.dirname, '..');
const [mode, actualArgument, outputArgument] = process.argv.slice(2);
const loader = path.resolve(root, 'packages/data-pipeline/node_modules/tsx/dist/loader.mjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/evidence/tsk-06-5-production-closure.json')),
);
const baseline = JSON.parse(
  fs.readFileSync(path.resolve(root, source.productionMatrix.canonicalRecords.manifest)),
);
const output = path.resolve(outputArgument ?? actualArgument ?? '');
const results = [];
function execute(name, args, expectedExit, probe) {
  const started = performance.now();
  const p = spawnSync(
    probe ? 'env' : process.execPath,
    probe ? [`FGO_TSK08_FAILURE_CLASS_PROBE=${probe}`, process.execPath, ...args] : args,
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  fs.writeFileSync(path.join(output, `${name}.stdout.log`), p.stdout ?? '');
  fs.writeFileSync(path.join(output, `${name}.stderr.log`), p.stderr ?? '');
  assert.equal(
    p.status,
    expectedExit,
    `${name}: ${p.stderr?.slice(0, 1024)} ${p.stdout?.slice(0, 1024)}`,
  );
  const display = (p.stdout ?? '') + (p.stderr ?? '');
  assert.ok(
    Buffer.byteLength(display) <= 32768 && display.split('\n').length <= 200,
    `${name}: output_unbounded`,
  );
  return {
    name,
    exit: p.status,
    elapsedMs: performance.now() - started,
    summaryBytes: Buffer.byteLength(display),
    summaryLines: display.split('\n').length,
    display,
  };
}
function forkActual(name) {
  const destination = path.join(output, name);
  fs.mkdirSync(destination);
  for (const filename of fs
    .readdirSync(path.resolve(actualArgument))
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json'))
    fs.copyFileSync(
      path.join(path.resolve(actualArgument), filename),
      path.join(destination, filename),
      fs.constants.COPYFILE_FICLONE,
    );
  return destination;
}
function saved(name, value) {
  const filename = path.join(output, name);
  fs.writeFileSync(filename, JSON.stringify(value));
  return filename;
}
function mergeCase(name, mutation, check, customSource) {
  const actual = forkActual(name);
  if (mutation) mutation(actual);
  const run = execute(
    name,
    [
      '--import',
      loader,
      'packages/calculation-application/scripts/merge-oc-matrix.ts',
      actual,
      ...(customSource ? [customSource] : []),
    ],
    1,
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(actual, 'manifest.json')));
  assert.equal(manifest.status, 'failed');
  const failures =
    manifest.canonicalRecords?.comparison.failures ??
    manifest.shardAcceptance?.comparison?.failures ??
    manifest.parityGate?.failures ??
    [];
  check(manifest, failures);
  const receipts = verifyArtifactFiles(actual, [
    { path: 'manifest.json', format: 'json', allowEmpty: false },
    ...manifest.rawConditionInputs.verified.map((d) => ({
      path: d.path,
      format: 'text',
      allowEmpty: false,
      expectedBytes: d.bytes,
      expectedSha256: d.sha256,
    })),
  ]);
  assert.deepEqual(receipts.errors, []);
  results.push({
    ...run,
    display: undefined,
    manifest: path.join(actual, 'manifest.json'),
    receiptCount: receipts.verified.length,
    failureCount: failures.length,
    reasons: [...new Set(failures.map((f) => f.reason))],
    firstDifference: failures[0]?.firstDifference,
  });
}
function mutateCondition(actual, change, rehashSummary = false) {
  const key = baseline.conditions[0].conditionKey;
  const file = path.join(actual, `${key}.json`);
  const body = JSON.parse(fs.readFileSync(file));
  change(body);
  if (rehashSummary) body.summary.digest = sha(Buffer.from(JSON.stringify(body.records)));
  const bytes = Buffer.from(JSON.stringify(body));
  fs.writeFileSync(file, bytes);
  const manifestFile = path.join(actual, 'manifest-shard-0.json');
  const shard = JSON.parse(fs.readFileSync(manifestFile));
  const d = shard.productionArtifacts.conditionRecords.find((d) => d.conditionKey === key);
  d.bytes = bytes.length;
  d.sha256 = sha(bytes);
  const receipt = shard.artifactVerification.verified.find((d) => d.path === `${key}.json`);
  receipt.bytes = d.bytes;
  receipt.sha256 = d.sha256;
  if (rehashSummary) {
    const index = shard.audit.conditionSummaries.findIndex((s) => s.key === key);
    shard.audit.conditionSummaries[index] = body.summary;
    const { digest: _digest, ...audit } = shard.audit;
    shard.audit.digest = sha(
      Buffer.from(
        JSON.stringify({
          ...audit,
          conditionSummaries: audit.conditionSummaries.map(({ elapsedMs: _elapsed, ...s }) => s),
        }),
      ),
    );
  }
  fs.writeFileSync(manifestFile, JSON.stringify(shard));
}
function main() {
  assert.ok(
    ['matrix', 'six'].includes(mode),
    'usage: production-baseline-acceptance.mjs matrix <actual-directory> <new-output> | six <new-output>',
  );
  fs.mkdirSync(output);
  if (mode === 'six') {
    const probes = [
      ['parity', 'productionClosureAudit.test.ts', 'constructs exactly the 80'],
      ['inertControl', 'productionClosureAudit.test.ts', 'requires user controls'],
      ...['unsupported', 'invalid', 'partialCommit', 'staleMutation'].map((name) => [
        name,
        'productionHpPublishedDependencyCoverage.test.ts',
        'joins original OC-rate requests',
      ]),
    ];
    for (const [name, file, filter] of probes) {
      const run = execute(
        name,
        [
          'scripts/test-runner.mjs',
          'compact',
          '--suite=unit',
          `packages/calculation-application/src/${file}`,
          '-t',
          filter,
        ],
        1,
        name,
      );
      const artifact = run.display.match(/Artifacts:\s*(\S+)/)?.[1];
      assert.ok(artifact, `${name}: missing runner manifest`);
      const directory = path.resolve(root, artifact);
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
      assert.equal(manifest.outcome, 'test_failure');
      assert.deepEqual(manifest.artifactVerification.errors, []);
      const receipt = verifyArtifactFiles(
        directory,
        manifest.artifacts.map((d) => ({
          path: d.path,
          format: d.format,
          allowEmpty: d.allowEmpty,
          expectedBytes: d.bytes,
          expectedSha256: d.sha256,
          ...(d.format === 'json-gzip'
            ? {
                expectedDecodedBytes: d.expectedDecodedBytes,
                expectedDecodedSha256: d.expectedDecodedSha256,
              }
            : {}),
        })),
      );
      assert.deepEqual(receipt.errors, []);
      const report = JSON.parse(fs.readFileSync(path.join(directory, 'vitest.json')));
      const failed = report.testResults
        .flatMap((file) => file.assertionResults)
        .filter((test) => test.status === 'failed');
      assert.equal(failed.length, 1);
      assert.ok(failed[0].failureMessages.join(' ').includes(name));
      results.push({
        ...run,
        display: undefined,
        manifest: path.join(directory, 'manifest.json'),
        receiptCount: receipt.verified.length,
      });
    }
    fs.writeFileSync(
      path.join(output, 'acceptance.json'),
      JSON.stringify({ status: 'passed', mode, results }, null, 2) + '\n',
    );
    console.log(
      JSON.stringify({ status: 'passed', mode, probes: results.length, receiptErrors: 0, output }),
    );
    return;
  }
  const shard0 = (actual) => path.join(actual, 'manifest-shard-0.json');
  mergeCase(
    'unknown-1024',
    (actual) => {
      const filename = shard0(actual),
        shard = JSON.parse(fs.readFileSync(filename));
      for (let i = 0; i < 1024; i++) shard.audit[`unknown${i}`] = 0;
      fs.writeFileSync(filename, JSON.stringify(shard));
    },
    (_m, f) => assert.equal(f.filter((x) => x.reason === 'shardAuditUnknownField').length, 1024),
  );
  mergeCase(
    'coverage',
    (actual) => {
      const filename = shard0(actual),
        s = JSON.parse(fs.readFileSync(filename));
      s.productionArtifacts.conditionRecords.pop();
      fs.writeFileSync(filename, JSON.stringify(s));
    },
    (_m, f) => assert.ok(f.length),
  );
  mergeCase(
    'identity',
    (actual) => {
      const filename = shard0(actual),
        s = JSON.parse(fs.readFileSync(filename));
      s.identity.masterDataVersion = 'foreign';
      fs.writeFileSync(filename, JSON.stringify(s));
    },
    (_m, f) =>
      assert.ok(
        f.some(
          (x) => x.reason === 'recordIdentityMismatch' || x.reason === 'shardGateContractMismatch',
        ),
      ),
  );
  mergeCase(
    'changed-fields',
    (actual) =>
      mutateCondition(actual, (body) => {
        body.records[0].canonicalInput.fouAtk++;
        delete body.records[1].canonicalInput.fouAtk;
        body.records[2].canonicalInput.unexpected = 0;
        body.records[3].canonicalInput.fouAtk = null;
      }),
    (_m, f) => {
      const differences = f.filter(
        (x) =>
          (x.reason === 'canonicalRecordMismatch' || x.reason === 'recordShapeInvalid') &&
          (x.firstDifference.path === 'canonicalInput' ||
            x.firstDifference.path.startsWith('canonicalInput.')),
      );
      assert.equal(differences.length, 4);
      assert.equal(new Set(differences.map((x) => x.canonicalIdentity)).size, 4);
    },
  );
  mergeCase(
    'nonfinite',
    (actual) => {
      mutateCondition(actual, (body) => {
        body.records[0].canonicalInput.fouAtk = '__NONFINITE__';
      });
      const filename = path.join(actual, `${baseline.conditions[0].conditionKey}.json`);
      fs.writeFileSync(
        filename,
        fs.readFileSync(filename, 'utf8').replace('"__NONFINITE__"', '1e400'),
      );
    },
    (_m, f) => assert.ok(f.some((x) => x.reason === 'recordValueInvalid')),
  );
  mergeCase(
    'profile-coverage',
    (actual) => mutateCondition(actual, (body) => body.records.pop()),
    (_m, f) => assert.ok(f.some((x) => x.reason === 'recordSummaryMismatch')),
  );
  mergeCase(
    'transaction-body',
    (actual) =>
      mutateCondition(
        actual,
        (body) => {
          const record = body.records.find(
            (r) => r.status === 'calculated' && r.appliedPreparationActions.length > 1,
          );
          assert.ok(record);
          record.appliedPreparationActions.pop();
        },
        true,
      ),
    (_m, f) =>
      assert.ok(
        f.some(
          (x) =>
            x.reason === 'canonicalRecordMismatch' &&
            x.firstDifference.path.startsWith('appliedPreparationActions'),
        ),
      ),
  );
  for (const [name, mutate] of [
    [
      'baseline-identity',
      (m) => {
        m.identity.masterDataVersion = 'foreign';
      },
    ],
    [
      'baseline-coverage',
      (m) => {
        m.conditions.pop();
      },
    ],
    [
      'baseline-unknown',
      (m) => {
        m.runMetadata = {};
      },
    ],
  ]) {
    const m = structuredClone(baseline);
    mutate(m);
    const file = saved(`${name}-baseline.json`, m);
    const bytes = fs.readFileSync(file);
    const custom = structuredClone(source);
    Object.assign(custom.productionMatrix.canonicalRecords, {
      manifest: file,
      bytes: bytes.length,
      sha256: sha(bytes),
    });
    const reference = saved(`${name}-source.json`, custom);
    mergeCase(name, null, (_m, f) => assert.ok(f.length), reference);
  }
  const directory = path.join(output, 'corrupt-baseline');
  fs.mkdirSync(directory);
  const m = structuredClone(baseline);
  for (const d of m.conditions.slice(0, -1))
    fs.copyFileSync(
      path.resolve(root, path.dirname(source.productionMatrix.canonicalRecords.manifest), d.path),
      path.join(directory, d.path),
    );
  const d = m.conditions[0];
  const bytes = fs.readFileSync(path.join(directory, d.path));
  bytes[0] = 0;
  fs.writeFileSync(path.join(directory, d.path), bytes);
  d.sha256 = sha(bytes);
  const file = path.join(directory, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(m));
  const manifestBytes = fs.readFileSync(file);
  const custom = structuredClone(source);
  Object.assign(custom.productionMatrix.canonicalRecords, {
    manifest: file,
    bytes: manifestBytes.length,
    sha256: sha(manifestBytes),
  });
  const reference = saved('corrupt-baseline-source.json', custom);
  mergeCase(
    'baseline-storage',
    null,
    (_m, f) => assert.equal(f.filter((x) => x.reason === 'recordArtifactUnavailable').length, 2),
    reference,
  );
  fs.writeFileSync(
    path.join(output, 'acceptance.json'),
    JSON.stringify(
      { status: 'passed', mode, baseline: source.productionMatrix.canonicalRecords, results },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({ status: 'passed', mode, probes: results.length, receiptErrors: 0, output }),
  );
}
try {
  main();
} catch (error) {
  fs.writeFileSync(
    path.join(output, 'acceptance-failure.json'),
    JSON.stringify({ status: 'failed', results, error: String(error) }, null, 2),
  );
  console.error(String(error).slice(0, 1024));
  process.exitCode = 1;
}
