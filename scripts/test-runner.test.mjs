import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_RUNTIME_COUNTER_CONTRACT, runCapturedTest } from './test-runner-lib.mjs';
import { PRODUCTION_TEST_INCLUDES } from './test-suites.mjs';
import {
  classifyQualityOutcome,
  qualityRunConfiguration,
  reconcileChildStep,
  verifyChildManifest,
  writeManifestAtomically,
} from './quality-runner-lib.mjs';
import { classifyObservations, sha256File, validateAllowances } from './test-observation-lib.mjs';

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
  observationValue = { schemaVersion: 1, observations: [] },
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
      ${observationValue === undefined ? '' : `if (process.env.FGO_TEST_OBSERVATION_PATH) fs.writeFileSync(process.env.FGO_TEST_OBSERVATION_PATH, ${JSON.stringify(JSON.stringify(observationValue))});`}
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
    fs.writeFileSync(process.env.FGO_TEST_OBSERVATION_PATH, JSON.stringify({ schemaVersion: 1, observations: [] }));
  `;
}

test('success writes a compact manifest and preserves captured streams', async () => {
  const result = await runFixture(
    'success',
    fixtureScript({
      reportValue: report(true),
      stdout: 'fixture output\n',
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
    'fixture output\n',
  );
  assert.equal(result.manifest.counts.warnings, 0);
  assert.match(result.summary, /Warnings: 0/);
});

test('an unexpected structured warning is a contract failure', async () => {
  const result = await runFixture(
    'warning',
    fixtureScript({
      reportValue: report(true),
      observationValue: {
        schemaVersion: 1,
        observations: [
          { runner: 'vitest', testId: 'fixture > warning', kind: 'warning', message: 'unsafe' },
        ],
      },
    }),
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'contract_failure');
  assert.equal(result.manifest.counts.warnings, 1);
  assert.match(result.summary, /fixture > warning: warning: unsafe/);
});

test('a real Node deprecation is captured structurally and cannot pass', async () => {
  const result = await runFixture(
    'node-warning',
    `
      const fs = require('node:fs');
      process.emitWarning('legacy API', { type: 'DeprecationWarning', code: 'DEP_FIXTURE' });
      setTimeout(() => {
        fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(report(true)))});
        fs.writeFileSync(process.env.FGO_TEST_OBSERVATION_PATH, JSON.stringify({ schemaVersion: 1, observations: [] }));
      }, 10);
    `,
  );
  assert.equal(result.manifest.outcome, 'contract_failure');
  assert.equal(result.manifest.counts.warnings, 1);
  assert.match(result.manifest.observations.unexpected[0].message, /legacy API/);
});

test('a console allowance requires one exact identity, message, reason, and future expiry', async () => {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), 'fgo-lab-allowance-'));
  const allowancePath = resolve(artifactRoot, 'allowances.json');
  const observation = {
    runner: 'vitest',
    testId: 'fixture > allowed console',
    kind: 'console.log',
    message: 'exact message\n',
  };
  writeFileSync(
    allowancePath,
    JSON.stringify([
      {
        ...observation,
        expectedCount: 1,
        reason: 'fixture contract',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ]),
  );
  const result = await runFixture(
    'allowed-console',
    fixtureScript({
      reportValue: report(true),
      observationValue: { schemaVersion: 1, observations: [observation] },
    }),
    2_000,
    { allowancePath },
  );
  assert.equal(result.manifest.outcome, 'success');
  assert.equal(result.manifest.counts.allowedObservations, 1);
  assert.equal(result.manifest.counts.unexpectedObservations, 0);
  assert.deepEqual(
    validateAllowances([
      {
        ...observation,
        expectedCount: 1,
        reason: 'fixture contract',
        expiresAt: '2020-01-01T00:00:00.000Z',
        prefix: 'exact',
      },
    ]),
    ['allowances[0]:broad_message_match', 'allowances[0]:expired'],
  );
});

test('a resource failure owns its matching structured browser console notification', () => {
  const resource = {
    runner: 'playwright',
    testId: 'fixture > resource',
    kind: 'browser.resource_failure',
    message: 'image https://fixture.invalid/image.png: net::ERR_FAILED',
    detail: {
      url: 'https://fixture.invalid/image.png',
      resourceType: 'image',
      failureText: 'net::ERR_FAILED',
      pageId: 'page-1',
    },
  };
  const consoleNotification = {
    runner: 'playwright',
    testId: resource.testId,
    kind: 'browser.console',
    message: 'Failed to load resource: net::ERR_FAILED',
    detail: {
      type: 'error',
      url: 'http://127.0.0.1:4173/',
      locationUrl: resource.detail.url,
      pageId: 'page-1',
    },
  };
  const allowance = {
    ...resource,
    expectedCount: 1,
    reason: 'typed fixture resource failure',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const classified = classifyObservations([resource, consoleNotification], [allowance]);
  assert.deepEqual(classified.unexpected, []);
  assert.deepEqual(classified.allowed, [resource]);
  assert.deepEqual(classified.correlated, [consoleNotification]);
  const reversed = classifyObservations([consoleNotification, resource], [allowance]);
  assert.deepEqual(reversed.unexpected, []);
  assert.deepEqual(reversed.allowed, [resource]);
  assert.deepEqual(reversed.correlated, [consoleNotification]);

  const unmatched = classifyObservations([consoleNotification], []);
  assert.deepEqual(unmatched.unexpected, [consoleNotification]);
  assert.deepEqual(unmatched.correlated, []);
});

test('an allowance is exact about observation multiplicity', async () => {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), 'fgo-lab-allowance-count-'));
  const allowancePath = resolve(artifactRoot, 'allowances.json');
  const observation = {
    runner: 'vitest',
    testId: 'fixture > repeated console',
    kind: 'console.log',
    message: 'one expected event',
  };
  writeFileSync(
    allowancePath,
    JSON.stringify([
      {
        ...observation,
        expectedCount: 1,
        reason: 'fixture contract',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ]),
  );
  const result = await runFixture(
    'repeated-console',
    fixtureScript({
      reportValue: report(true),
      observationValue: { schemaVersion: 1, observations: [observation, observation] },
    }),
    2_000,
    { allowancePath },
  );
  assert.equal(result.manifest.outcome, 'contract_failure');
  assert.deepEqual(result.manifest.observations.allowanceErrors, [
    'allowances[0]:count_mismatch:expected_1:received_2',
  ]);
});

test('a browser console allowance includes its source location in the complete identity', () => {
  const observation = {
    runner: 'playwright',
    testId: 'fixture.spec.ts > source identity',
    kind: 'browser.console',
    message: '[vite] connected.',
    detail: {
      type: 'debug',
      url: 'http://127.0.0.1:4174/',
      locationUrl: 'http://127.0.0.1:4174/src/application.ts',
      pageId: 'page-1',
    },
  };
  const allowance = {
    ...observation,
    detail: { ...observation.detail, locationUrl: 'http://127.0.0.1:4174/@vite/client' },
    expectedCount: 1,
    reason: 'fixture source identity',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  const classified = classifyObservations([observation], [allowance]);
  assert.deepEqual(classified.unexpected, [observation]);
});

test('a Vite optimized dependency source ignores only its transient version hash', () => {
  const observation = {
    runner: 'playwright',
    testId: 'fixture.spec.ts > optimized dependency identity',
    kind: 'browser.console',
    message: 'dependency diagnostic',
    detail: {
      type: 'info',
      url: 'http://127.0.0.1:4174/',
      locationUrl: 'http://127.0.0.1:4174/node_modules/.vite/deps/react-dom_client.js?v=current',
      pageId: 'page-1',
    },
  };
  const allowance = {
    ...observation,
    detail: {
      ...observation.detail,
      locationUrl: 'http://127.0.0.1:4174/node_modules/.vite/deps/react-dom_client.js?v=recorded',
    },
    expectedCount: 1,
    reason: 'fixture optimized dependency identity',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };

  const matching = classifyObservations([observation], [allowance]);
  assert.deepEqual(matching.allowed, [observation]);
  assert.deepEqual(matching.unexpected, []);

  const otherSource = {
    ...observation,
    detail: {
      ...observation.detail,
      locationUrl: 'http://127.0.0.1:4174/node_modules/.vite/deps/react.js?v=current',
    },
  };
  const nonmatching = classifyObservations([otherSource], [allowance]);
  assert.deepEqual(nonmatching.allowed, []);
  assert.deepEqual(nonmatching.unexpected, [otherSource]);
});

test('a generic resource console message can never be allowlisted', () => {
  assert.deepEqual(
    validateAllowances([
      {
        runner: 'playwright',
        testId: 'fixture.spec.ts > resource fallback',
        kind: 'browser.console.error',
        message: 'Failed to load resource: net::ERR_FAILED',
        expectedCount: 1,
        reason: 'too broad',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ]),
    ['allowances[0]:generic_resource_console'],
  );
  assert.doesNotMatch(
    readFileSync(resolve(root, 'scripts/test-observation-allowances.json'), 'utf8'),
    /Failed to load resource: net::ERR_FAILED/,
  );
  const canonicalAllowances = JSON.parse(
    readFileSync(resolve(root, 'scripts/test-observation-allowances.json'), 'utf8'),
  );
  assert.deepEqual(validateAllowances(canonicalAllowances), []);
  assert.equal(
    canonicalAllowances.some(({ detail }) => detail?.locationUrl?.includes('/@vite/client')),
    false,
  );
  for (const allowance of canonicalAllowances.filter(
    ({ kind }) => kind === 'browser.resource_failure',
  )) {
    assert.match(
      allowance.detail.url,
      /^(?:https:\/\/static\.atlasacademy\.io\/|http:\/\/127\.0\.0\.1:4174\/master\/manifest\.json$)/,
    );
    assert.ok(['image', 'fetch'].includes(allowance.detail.resourceType));
    assert.equal(allowance.detail.failureText, 'net::ERR_FAILED');
    assert.ok(allowance.expectedCount > 0);
  }
});

test('skip and todo are contract failures even when Vitest reports success', async () => {
  const skipped = report(true);
  skipped.numTotalTests = 3;
  skipped.numPendingTests = 1;
  skipped.numTodoTests = 1;
  const result = await runFixture('skip-todo', fixtureScript({ reportValue: skipped }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'contract_failure');
  assert.equal(result.manifest.counts.tests.skipped, 1);
  assert.equal(result.manifest.counts.tests.todo, 1);
});

test('a declared missing artifact overrides a passing child', async () => {
  const result = await runFixture(
    'missing-artifact',
    fixtureScript({ reportValue: report(true) }),
    2_000,
    { additionalArtifacts: [{ path: 'required.json', format: 'json', allowEmpty: false }] },
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'artifact_failure');
  assert.deepEqual(result.manifest.artifactVerification.errors, ['required.json:missing']);
});

test('a test-owned artifact declaration is checksum-verified and reachable from the child manifest', async () => {
  const result = await runFixture(
    'declared-artifact-file',
    `
      const fs = require('node:fs');
      const path = require('node:path');
      const artifact = path.join(process.env.FGO_TEST_ARTIFACT_DIR, 'diagnostic.json');
      fs.writeFileSync(artifact, JSON.stringify({ boundary: 'fixture' }));
      fs.writeFileSync(
        path.join(process.env.FGO_TEST_ARTIFACT_DIR, 'artifact-declarations.json'),
        JSON.stringify([{ path: 'diagnostic.json', format: 'json' }]),
      );
      fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(report(true)))});
      process.exit(0);
    `,
    2_000,
    { observationName: null },
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.manifest.outcome, 'success');
  const artifact = result.manifest.artifacts.find(({ path }) => path === 'diagnostic.json');
  assert.equal(artifact?.format, 'json');
  assert.equal(typeof artifact?.sha256, 'string');
  assert.equal(result.manifest.artifactVerification.errors.length, 0);
});

test('a test-owned artifact declaration fails closed on an outside path', async () => {
  const result = await runFixture(
    'declared-artifact-outside',
    `
      const fs = require('node:fs');
      const path = require('node:path');
      const root = process.env.FGO_TEST_ARTIFACT_DIR;
      fs.writeFileSync(path.join(root, 'artifact-declarations.json'), JSON.stringify([{ path: '../outside.json' }]));
      fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(report(true)))});
      process.exit(0);
    `,
    2_000,
    { observationName: null },
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.manifest.outcome, 'artifact_failure');
  assert.deepEqual(result.manifest.artifactVerification.errors, [
    'artifact-declarations.json:[0]:outside_run_directory',
  ]);
});

test('the quality parent rejects missing and changed child artifacts', () => {
  const runDirectory = mkdtempSync(resolve(tmpdir(), 'fgo-lab-parent-'));
  const childDirectory = resolve(runDirectory, 'unit');
  mkdirSync(childDirectory);
  const artifactPath = resolve(childDirectory, 'vitest.json');
  writeFileSync(artifactPath, '{}\n');
  writeFileSync(
    resolve(childDirectory, 'manifest.json'),
    JSON.stringify({
      command: { label: 'test:unit' },
      versions: { node: process.version },
      repository: { commit: 'fixture', dirty: false },
      durationMs: 1,
      outcome: 'success',
      counts: { warnings: 0 },
      artifacts: [
        {
          path: 'vitest.json',
          bytes: 3,
          sha256: sha256File(artifactPath),
        },
      ],
    }),
  );
  assert.deepEqual(verifyChildManifest(runDirectory, 'unit').verificationErrors, []);
  writeFileSync(artifactPath, '{"changed":true}\n');
  assert.deepEqual(verifyChildManifest(runDirectory, 'unit').verificationErrors, [
    'vitest.json:bytes',
  ]);
  assert.deepEqual(verifyChildManifest(runDirectory, 'production').verificationErrors, ['missing']);
});

test('the quality parent preserves child outcomes and gives artifact failure precedence', () => {
  assert.equal(
    classifyQualityOutcome({ signal: 'SIGTERM', failedStep: null, children: {} }),
    'signal',
  );
  assert.equal(classifyQualityOutcome({ signal: null, failedStep: null, children: {} }), 'success');
  assert.equal(
    classifyQualityOutcome({
      signal: null,
      failedStep: { id: 'unit' },
      children: { unit: { outcome: 'test_failure', verificationErrors: [] } },
    }),
    'test_failure',
  );
  assert.equal(
    classifyQualityOutcome({
      signal: null,
      failedStep: { id: 'playwright' },
      children: {
        playwright: { outcome: 'success', verificationErrors: ['html/index.html:missing'] },
      },
    }),
    'artifact_failure',
  );
});

test('quick checks are a strict subset while full quality keeps the canonical gate', () => {
  const full = qualityRunConfiguration([]);
  const quick = qualityRunConfiguration(['--profile=quick']);
  assert.deepEqual(
    full.steps.map(([id]) => id),
    [
      'format',
      'lint',
      'typecheck',
      'runner',
      'docs',
      'unit',
      'production',
      'master',
      'build',
      'playwright',
    ],
  );
  assert.deepEqual(
    quick.steps.map(([id]) => id),
    ['format', 'lint', 'typecheck', 'runner', 'docs', 'unit', 'build'],
  );
  assert.equal(full.command, 'pnpm quality');
  assert.equal(quick.command, 'pnpm check');
  assert.throws(() => qualityRunConfiguration(['--profile=unknown']), /usage/);
});

test('the quality parent fails closed on every process and child manifest contradiction', () => {
  const successChild = {
    outcome: 'success',
    exit: { kind: 'code', code: 0, signal: null },
    verificationErrors: [],
  };
  const failedChild = {
    outcome: 'test_failure',
    exit: { kind: 'code', code: 7, signal: null },
    verificationErrors: [],
  };
  const nonzero = { id: 'unit', code: 7, signal: null };
  const signaled = { id: 'unit', code: null, signal: 'SIGTERM' };
  const zero = { id: 'unit', code: 0, signal: null };

  assert.deepEqual(reconcileChildStep(nonzero, successChild), [
    'process_nonzero_with_manifest_success',
  ]);
  assert.deepEqual(reconcileChildStep(signaled, successChild), [
    'process_signal_with_manifest_success:SIGTERM',
  ]);
  assert.deepEqual(reconcileChildStep(zero, failedChild), [
    'process_success_with_manifest_failure:test_failure',
  ]);
  assert.equal(
    classifyQualityOutcome({
      signal: null,
      failedStep: nonzero,
      children: {
        unit: { ...successChild, reconciliationErrors: reconcileChildStep(nonzero, successChild) },
      },
    }),
    'process_manifest_mismatch',
  );
  assert.equal(
    classifyQualityOutcome({
      signal: null,
      failedStep: signaled,
      children: {
        unit: { ...successChild, reconciliationErrors: reconcileChildStep(signaled, successChild) },
      },
    }),
    'signal',
  );
  assert.equal(
    classifyQualityOutcome({
      signal: null,
      failedStep: zero,
      children: {
        unit: { ...failedChild, reconciliationErrors: reconcileChildStep(zero, failedChild) },
      },
    }),
    'process_manifest_mismatch',
  );
});

test('a parent manifest write failure throws instead of returning success', () => {
  const missingDirectory = resolve(mkdtempSync(resolve(tmpdir(), 'fgo-lab-manifest-')), 'missing');
  assert.throws(
    () =>
      writeManifestAtomically(resolve(missingDirectory, 'manifest.json'), { outcome: 'success' }),
    /ENOENT/,
  );
});

function playwrightReport(overrides = {}) {
  return {
    schemaVersion: 1,
    status: 'passed',
    startedAt: '2026-09-01T00:00:00.000Z',
    durationMs: 10,
    counts: { total: 1, passed: 1, failed: 0, skipped: 0, retries: 0, flaky: 0 },
    projects: {
      chromium: { total: 1, passed: 1, failed: 0, skipped: 0, retries: 0, flaky: 0 },
    },
    tests: [],
    observations: [],
    ...overrides,
  };
}

async function runPlaywrightFixture(name, script, timeoutMs = 2_000, options = {}) {
  return runFixture(name, script, timeoutMs, {
    resultKind: 'playwright',
    reportName: 'playwright.json',
    observationName: null,
    ...options,
  });
}

test('Playwright success records project counts without skip or retry', async () => {
  const result = await runPlaywrightFixture(
    'playwright-success',
    fixtureScript({ reportValue: playwrightReport() }),
  );
  assert.equal(result.manifest.outcome, 'success');
  assert.equal(result.manifest.counts.files.passed, 1);
  assert.equal(result.manifest.counts.tests.retries, 0);
});

test('Playwright assertion, timeout, signal, and reporter failures stay distinct and non-zero', async () => {
  const assertion = await runPlaywrightFixture(
    'playwright-assertion',
    fixtureScript({
      reportValue: playwrightReport({
        status: 'failed',
        counts: { total: 1, passed: 0, failed: 1, skipped: 0, retries: 0, flaky: 0 },
      }),
      exitCode: 7,
    }),
  );
  const timeout = await runPlaywrightFixture(
    'playwright-timeout',
    fixtureScript({ delayMs: 5_000 }),
    25,
  );
  const signal = await runPlaywrightFixture(
    'playwright-signal',
    fixtureScript({ signal: 'SIGTERM' }),
  );
  const reporter = await runPlaywrightFixture('playwright-reporter', fixtureScript({}));
  assert.deepEqual(
    [
      assertion.manifest.outcome,
      timeout.manifest.outcome,
      signal.manifest.outcome,
      reporter.manifest.outcome,
    ],
    ['test_failure', 'timeout', 'signal', 'reporter_failure'],
  );
  assert.deepEqual(
    [assertion.exitCode, timeout.exitCode, signal.exitCode, reporter.exitCode],
    [7, 1, 1, 1],
  );
});

test('Playwright warning, browser console, skip, retry, and artifact loss fail the contract', async () => {
  const observed = await runPlaywrightFixture(
    'playwright-observed',
    fixtureScript({
      reportValue: playwrightReport({
        observations: [
          {
            runner: 'playwright',
            testId: 'chromium > fixture',
            kind: 'browser.console.warning',
            message: 'unsafe',
          },
        ],
      }),
    }),
  );
  const skipped = await runPlaywrightFixture(
    'playwright-skipped',
    fixtureScript({
      reportValue: playwrightReport({
        counts: { total: 1, passed: 0, failed: 0, skipped: 1, retries: 1, flaky: 1 },
      }),
    }),
  );
  const artifact = await runPlaywrightFixture(
    'playwright-artifact',
    fixtureScript({ reportValue: playwrightReport() }),
    2_000,
    { additionalArtifacts: [{ path: 'html/index.html', format: 'text', allowEmpty: false }] },
  );
  assert.equal(observed.manifest.outcome, 'contract_failure');
  assert.equal(skipped.manifest.outcome, 'contract_failure');
  assert.equal(artifact.manifest.outcome, 'artifact_failure');
});

test('Playwright report-declared attachments require a contained file with matching bytes and SHA', async () => {
  const attachment = {
    name: 'trace',
    contentType: 'application/zip',
    path: 'playwright-artifacts/result/trace.zip',
    inline: false,
    bytes: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  };
  const declared = (value) =>
    playwrightReport({
      tests: [
        {
          id: 'fixture',
          title: 'fixture',
          titlePath: ['fixture.spec.ts', 'fixture'],
          project: 'chromium',
          expectedStatus: 'passed',
          outcome: 'expected',
          status: 'passed',
          retry: 0,
          durationMs: 1,
          errors: [],
          attachments: [value],
        },
      ],
    });
  const missing = await runPlaywrightFixture(
    'playwright-declared-attachment-missing',
    fixtureScript({ reportValue: declared(attachment) }),
  );
  const outside = await runPlaywrightFixture(
    'playwright-declared-attachment-outside',
    fixtureScript({ reportValue: declared({ ...attachment, path: '../trace.zip' }) }),
  );
  const changed = await runPlaywrightFixture(
    'playwright-declared-attachment-changed',
    `
      const fs = require('node:fs');
      const path = require('node:path');
      const target = path.join(process.env.FGO_TEST_ARTIFACT_DIR, 'playwright-artifacts/result/trace.zip');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'changed');
      fs.writeFileSync(process.env.FGO_TEST_REPORT_PATH, ${JSON.stringify(JSON.stringify(declared(attachment)))});
    `,
  );
  const failedWithMissing = await runPlaywrightFixture(
    'playwright-failed-declared-attachment-missing',
    fixtureScript({
      reportValue: declared(attachment),
      exitCode: 7,
    }),
  );
  assert.equal(missing.manifest.outcome, 'artifact_failure');
  assert.match(missing.manifest.artifactVerification.errors.join('\n'), /trace\.zip:missing/);
  assert.equal(outside.manifest.outcome, 'artifact_failure');
  assert.match(outside.manifest.artifactVerification.errors.join('\n'), /outside_run_directory/);
  assert.equal(changed.manifest.outcome, 'artifact_failure');
  assert.match(changed.manifest.artifactVerification.errors.join('\n'), /bytes|sha256/);
  assert.equal(failedWithMissing.manifest.outcome, 'artifact_failure');
});

test('every E2E page is created through the canonical browser observer API', () => {
  for (const entry of readdirSync(resolve(root, 'e2e'))) {
    if (!entry.endsWith('.ts') || entry === 'observedTest.ts') continue;
    const source = readFileSync(resolve(root, 'e2e', entry), 'utf8');
    assert.doesNotMatch(source, /\bbrowser\.newContext\s*\(/, entry);
    assert.doesNotMatch(source, /\bcontext\.newPage\s*\(/, entry);
  }
  const observer = readFileSync(resolve(root, 'e2e/observedTest.ts'), 'utf8');
  for (const method of ['log', 'info', 'debug', 'warn', 'error', 'assert'])
    assert.match(observer, new RegExp(`['"]${method}['"]`));
  assert.match(observer, /context\.on\(['"]page['"]/);
  assert.match(observer, /requestfailed/);
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
        fs.writeFileSync(process.env.FGO_TEST_OBSERVATION_PATH, JSON.stringify({ schemaVersion: 1, observations: [] }));
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

test('CI retains the complete parent run and makes missing/upload failure blocking', () => {
  for (const path of ['.github/workflows/ci.yml']) {
    const workflow = readFileSync(resolve(root, path), 'utf8');
    const uploadStart = workflow.indexOf('- name: Upload quality results');
    assert.ok(uploadStart >= 0, path);
    const uploadStep = workflow.slice(uploadStart);
    assert.match(uploadStep, /uses: actions\/upload-artifact@v4/);
    assert.match(uploadStep, /if: \$\{\{ always\(\) \}\}/);
    assert.match(uploadStep, /path: \.test-results\//);
    assert.match(uploadStep, /include-hidden-files: true/);
    assert.match(uploadStep, /if-no-files-found: error/);
    assert.doesNotMatch(uploadStep, /continue-on-error: true/);
  }
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
  assert.match(productionProject, /maxWorkers: '50%'/);
  assert.match(productionProject, /sequence: \{ groupOrder: 1 \}/);
});

test('local, CI, and Vercel use the same canonical quality command', () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.quality, 'node scripts/quality-runner.mjs');
  assert.equal(packageJson.scripts.check, 'node scripts/quality-runner.mjs --profile=quick');
  assert.equal(packageJson.scripts['results:clean'], 'node scripts/clean-test-results.mjs');
  assert.equal(
    packageJson.scripts['validate:master'],
    'pnpm --filter @fgo-lab/data-pipeline validate',
  );
  assert.equal(packageJson.scripts['test:e2e'], 'node scripts/playwright-runner.mjs');
  const qualityRunner = readFileSync(resolve(root, 'scripts/quality-runner-lib.mjs'), 'utf8');
  for (const [id, script] of [
    ['format', 'format:check'],
    ['lint', 'lint'],
    ['typecheck', 'typecheck'],
    ['runner', 'test:runner'],
    ['docs', 'test:docs'],
    ['unit', 'test:unit'],
    ['production', 'test:production'],
    ['master', 'validate:master'],
    ['build', 'build'],
    ['playwright', 'test:e2e'],
  ])
    assert.match(qualityRunner, new RegExp(`\\['${id}', \\['${script}'\\]`));
  const playwrightConfig = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8');
  assert.match(playwrightConfig, /workers: 2,/);
  for (const path of ['.github/workflows/ci.yml']) {
    const workflow = readFileSync(resolve(root, path), 'utf8');
    assert.equal(workflow.match(/run: pnpm quality/g)?.length, 1, path);
    assert.doesNotMatch(workflow, /run: pnpm (?:test|validate:evidence|validate:master|build)\b/);
  }
});
