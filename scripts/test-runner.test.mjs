import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_RUNTIME_COUNTER_CONTRACT, runCapturedTest } from './test-runner-lib.mjs';
import { PRODUCTION_TEST_INCLUDES } from './test-suites.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function report(success, failed = false) {
  return {
    numTotalTestSuites: 1,
    numPassedTestSuites: failed ? 0 : 1,
    numFailedTestSuites: failed ? 1 : 0,
    numPendingTestSuites: 0,
    numTotalTests: 1,
    numPassedTests: failed ? 0 : 1,
    numFailedTests: failed ? 1 : 0,
    numPendingTests: 0,
    numTodoTests: 0,
    success,
    testResults: [
      {
        name: resolve(root, 'fixture.test.ts'),
        status: failed ? 'failed' : 'passed',
        assertionResults: failed
          ? [
              {
                status: 'failed',
                fullName: 'fixture reports canonical failure',
                failureMessages: ['expected canonical state to equal executable state'],
              },
            ]
          : [],
      },
    ],
  };
}

function fixtureScript({
  reportValue,
  exitCode = 0,
  signal,
  delayMs = 0,
  stdout = '',
  stderr = '',
}) {
  return `
    const fs = require('node:fs');
    if (${JSON.stringify(stdout)}) process.stdout.write(${JSON.stringify(stdout)});
    if (${JSON.stringify(stderr)}) process.stderr.write(${JSON.stringify(stderr)});
    setTimeout(() => {
      ${reportValue === undefined ? '' : `fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(reportValue))});`}
      ${signal ? `process.kill(process.pid, ${JSON.stringify(signal)});` : `process.exit(${exitCode});`}
    }, ${delayMs});
  `;
}

async function runFixture(name, script, timeoutMs = 2_000, options = {}) {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), `fgo-lab-runner-${name}-`));
  return runCapturedTest({
    root,
    command: process.execPath,
    args: ['-e', script],
    commandLabel: 'test:agent',
    timeoutMs,
    artifactRoot,
    runId: 'run',
    ...options,
  });
}

const canonicalRuntimeCounterArtifacts = Object.entries(PRODUCTION_RUNTIME_COUNTER_CONTRACT).map(
  ([boundary, runtimeCounters]) => ({
    name: `production-audit-${boundary}.json`,
    boundary,
    runtimeCounters,
  }),
);

function runtimeCounterScript(artifacts) {
  return `
    const fs = require('node:fs');
    const path = require('node:path');
    const artifacts = ${JSON.stringify(artifacts)};
    for (const { name, ...artifact } of artifacts)
      fs.writeFileSync(path.join(process.env.FGO_TEST_ARTIFACT_DIR, name), JSON.stringify(artifact));
    fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(report(true)))});
  `;
}

test('success writes a compact manifest and preserves captured streams', async () => {
  const result = await runFixture(
    'success',
    fixtureScript({
      reportValue: report(true),
      stdout: 'fixture warning\n',
      stderr: 'captured diagnostic detail\n',
    }),
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.manifest.outcome, 'success');
  assert.equal(result.manifest.counts.files.passed, 1);
  assert.ok(result.summary.trimEnd().split('\n').length <= 10);
  assert.equal(
    readFileSync(resolve(result.runDirectory, 'stderr.log'), 'utf8'),
    'captured diagnostic detail\n',
  );
  assert.equal(
    readFileSync(resolve(result.runDirectory, 'stdout.log'), 'utf8'),
    'fixture warning\n',
  );
  assert.equal(result.manifest.counts.warnings, 1);
  assert.match(result.summary, /Warnings: 1/);
});

test('production audit artifacts satisfy every required runtime counter', async () => {
  const result = await runFixture(
    'runtime-counters',
    runtimeCounterScript(canonicalRuntimeCounterArtifacts),
    2_000,
    { requiredRuntimeCounters: PRODUCTION_RUNTIME_COUNTER_CONTRACT },
  );
  assert.equal(result.manifest.outcome, 'success');
  assert.deepEqual(result.manifest.runtimeCounterContract.errors, []);
  assert.equal(result.manifest.runtimeCounters.length, 2);
});

test('missing production audit artifacts fail the runtime counter contract', async () => {
  const result = await runFixture(
    'missing-runtime-counters',
    fixtureScript({ reportValue: report(true) }),
    2_000,
    { requiredRuntimeCounters: PRODUCTION_RUNTIME_COUNTER_CONTRACT },
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'contract_failure');
  assert.match(result.summary, /data-pipeline:expected_one_artifact:received_0/);
  assert.match(result.summary, /calculation-application:expected_one_artifact:received_0/);
});

for (const fixture of [
  { name: 'empty', counters: {}, error: 'invalid_runtime_counters' },
  {
    name: 'missing',
    counters: { masterReadCount: 1 },
    error: 'missing_counter:masterParseCount',
  },
  { name: 'invalid', counters: { masterReadCount: -1 }, error: 'invalid_runtime_counters' },
])
  test(`${fixture.name} runtime counters fail the production contract`, async () => {
    const result = await runFixture(
      `${fixture.name}-runtime-counters`,
      `
        const fs = require('node:fs');
        const path = require('node:path');
        fs.writeFileSync(
          path.join(process.env.FGO_TEST_ARTIFACT_DIR, 'production-audit-data-pipeline.json'),
          JSON.stringify({ boundary: 'data-pipeline', runtimeCounters: ${JSON.stringify(fixture.counters)} }),
        );
        fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(report(true)))});
      `,
      2_000,
      {
        requiredRuntimeCounters: {
          'data-pipeline': PRODUCTION_RUNTIME_COUNTER_CONTRACT['data-pipeline'],
        },
      },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(result.manifest.outcome, 'contract_failure');
    assert.match(result.summary, new RegExp(fixture.error));
  });

test('runtime counter values differing from the canonical ratchet fail the contract', async () => {
  for (const [name, value] of [
    ['masterReadCount', 2],
    ['masterParseCount', 2],
    ['compileCount', 3],
    ['candidateCount', 6_509],
    ['damageRequestCount', 3_745],
  ]) {
    const artifacts = structuredClone(canonicalRuntimeCounterArtifacts);
    const application = artifacts.find(({ boundary }) => boundary === 'calculation-application');
    application.runtimeCounters[name] = value;
    const result = await runFixture(`mismatched-${name}`, runtimeCounterScript(artifacts), 2_000, {
      requiredRuntimeCounters: PRODUCTION_RUNTIME_COUNTER_CONTRACT,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.manifest.outcome, 'contract_failure');
    assert.match(result.summary, new RegExp(`counter_mismatch:${name}:`));
  }
});

test('assertion failure keeps the child exit code and bounded structured detail', async () => {
  const result = await runFixture(
    'failure',
    fixtureScript({ reportValue: report(false, true), exitCode: 7 }),
  );
  assert.equal(result.exitCode, 7);
  assert.equal(result.manifest.outcome, 'test_failure');
  assert.match(result.summary, /fixture reports canonical failure/);
  assert.ok(Buffer.byteLength(result.summary) <= 32 * 1024);
  assert.ok(result.summary.trimEnd().split('\n').length <= 200);
});

test('timeout is non-zero and distinct in the manifest', async () => {
  const result = await runFixture('timeout', fixtureScript({ delayMs: 5_000 }), 25);
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'timeout');
  assert.equal(result.manifest.exit.kind, 'timeout');
});

test('signal termination is non-zero and preserves the signal', async () => {
  const result = await runFixture('signal', fixtureScript({ signal: 'SIGTERM' }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'signal');
  assert.equal(result.manifest.exit.signal, 'SIGTERM');
});

test('missing structured output is a reporter failure, never success', async () => {
  const result = await runFixture('reporter', fixtureScript({}));
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'reporter_failure');
  assert.equal(result.manifest.reporter.available, false);
});

test('spawn failure writes logs and a runner_failure manifest', async () => {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), 'fgo-lab-runner-spawn-'));
  const result = await runCapturedTest({
    root,
    command: resolve(artifactRoot, 'missing-command'),
    args: [],
    commandLabel: 'test:agent',
    timeoutMs: 2_000,
    artifactRoot,
    runId: 'run',
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'runner_failure');
  assert.match(result.manifest.runner.error, /ENOENT/);
  assert.match(result.summary, /Status: runner_failure/);
  assert.match(result.summary, /Artifacts: /);
  assert.equal(readFileSync(resolve(result.runDirectory, 'stdout.log'), 'utf8'), '');
  assert.equal(readFileSync(resolve(result.runDirectory, 'stderr.log'), 'utf8'), '');
  assert.equal(
    JSON.parse(readFileSync(resolve(result.runDirectory, 'manifest.json'), 'utf8')).outcome,
    'runner_failure',
  );
});

test('failure summary never exceeds physical line or UTF-8 byte limits', async () => {
  const oversizedReport = report(false, true);
  oversizedReport.testResults[0].assertionResults[0].fullName = `${'界'.repeat(20_000)}\n${Array.from({ length: 220 }, (_, index) => `identity ${index}`).join('\n')}`;
  const result = await runFixture(
    'bounds',
    fixtureScript({ reportValue: oversizedReport, exitCode: 1 }),
  );
  assert.ok(result.summary.trimEnd().split('\n').length <= 200);
  assert.ok(Buffer.byteLength(result.summary) <= 32 * 1024);
  assert.match(result.summary, /Artifacts: /);
  assert.equal(result.manifest.output.truncated, true);
});

test('CI retains hidden Vitest artifacts after a failed test step', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  const uploadStart = workflow.indexOf('- name: Upload Vitest results');
  const nextStep = workflow.indexOf('- uses: actions/upload-artifact@v4', uploadStart + 1);
  assert.ok(uploadStart >= 0 && nextStep > uploadStart);
  const uploadStep = workflow.slice(uploadStart, nextStep);
  assert.match(uploadStep, /uses: actions\/upload-artifact@v4/);
  assert.match(uploadStep, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(uploadStep, /path: \.test-results\//);
  assert.match(uploadStep, /include-hidden-files: true/);
});

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return /\.test\.(?:ts|tsx)$/.test(entry.name)
      ? [relative(root, path).split(sep).join('/')]
      : [];
  });
}

test('unit and production suites form one exhaustive non-overlapping Vitest partition', () => {
  const all = [...testFiles(resolve(root, 'packages')), ...testFiles(resolve(root, 'apps'))].sort();
  const production = [...PRODUCTION_TEST_INCLUDES].sort();
  assert.equal(new Set(production).size, production.length);
  assert.deepEqual(
    production.filter((file) => !all.includes(file)),
    [],
  );

  const productionSet = new Set(production);
  const requiredProduction = all.filter((file) => {
    const source = readFileSync(resolve(root, file), 'utf8');
    return (
      source.includes('public/master/master.json') ||
      /(?:Golden|Production|Differential|Inventory)\.test\.(?:ts|tsx)$/.test(file) ||
      /\/evidence(?:Inventory)?\.test\.ts$/.test(file)
    );
  });
  assert.deepEqual(
    requiredProduction.filter((file) => !productionSet.has(file)),
    [],
  );
  assert.equal(all.length - production.length + production.length, all.length);
});

test('differently capped Vitest projects use distinct execution groups', () => {
  const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8');
  const unitProject = config.slice(
    config.indexOf("name: 'unit'"),
    config.indexOf("name: 'production'"),
  );
  const productionProject = config.slice(config.indexOf("name: 'production'"));

  assert.match(unitProject, /sequence: \{ groupOrder: 0 \}/);
  assert.match(productionProject, /maxWorkers: '75%'/);
  assert.match(productionProject, /sequence: \{ groupOrder: 1 \}/);
});

test('local, CI, and Pages use the same canonical quality command', () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts.quality,
    'pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:runner && pnpm test:docs && pnpm test:unit && pnpm test:production && pnpm validate:master && pnpm build && pnpm test:e2e',
  );
  assert.equal(
    packageJson.scripts['validate:master'],
    'pnpm --filter @fgo-lab/data-pipeline validate',
  );
  assert.equal(packageJson.scripts['test:e2e'], 'playwright test --workers=2');
  for (const path of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const workflow = readFileSync(resolve(root, path), 'utf8');
    assert.equal(workflow.match(/run: pnpm quality/g)?.length, 1, path);
    assert.doesNotMatch(workflow, /run: pnpm (?:test|validate:evidence|validate:master|build)\b/);
  }
});
