import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCapturedTest } from './test-runner-lib.mjs';

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

async function runFixture(name, script, timeoutMs = 2_000) {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), `fgo-lab-runner-${name}-`));
  return runCapturedTest({
    root,
    command: process.execPath,
    args: ['-e', script],
    commandLabel: 'test:agent',
    timeoutMs,
    artifactRoot,
    runId: 'run',
  });
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
  const nextStep = workflow.indexOf('- run: pnpm validate:evidence', uploadStart);
  assert.ok(uploadStart >= 0 && nextStep > uploadStart);
  const uploadStep = workflow.slice(uploadStart, nextStep);
  assert.match(uploadStep, /uses: actions\/upload-artifact@v4/);
  assert.match(uploadStep, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(uploadStep, /path: \.test-results\//);
  assert.match(uploadStep, /include-hidden-files: true/);
});
