import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyServerObservations,
  readJson,
  readJsonLines,
  sha256File,
  validateBrowserRuntimeContract,
} from './test-observation-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('the browser fixture observes all console types on default and manual pages', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'fgo-lab-browser-observer-'));
  const observationPath = resolve(directory, 'observations.jsonl');
  const reportPath = resolve(directory, 'playwright.json');
  writeFileSync(observationPath, '');
  const result = spawnSync(
    resolve(root, 'node_modules/.bin/playwright'),
    ['test', '--config=scripts/playwright-observer-fixture.config.ts'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        FGO_BROWSER_OBSERVATION_PATH: observationPath,
        FGO_TEST_ARTIFACT_DIR: directory,
        FGO_TEST_REPORT_PATH: reportPath,
      },
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const observations = readJsonLines(observationPath);
  for (const [identity, prefix] of [
    ['browser-observer.fixture.ts > default page captures every supported console type', 'default'],
    ['browser-observer.fixture.ts > manual context page uses the same observer', 'manual'],
  ])
    for (const type of ['log', 'info', 'debug', 'warn', 'error', 'assert'])
      assert.ok(
        observations.some(
          (event) =>
            event.testId === identity &&
            event.kind === 'browser.console' &&
            event.message === `${prefix}:${type}` &&
            event.detail.type === type,
        ),
        `${identity}:${type}`,
      );
  assert.ok(
    observations.some(
      (event) =>
        event.kind === 'browser.resource_failure' &&
        event.detail.url === 'https://fixture.invalid/image.png' &&
        event.detail.resourceType === 'image' &&
        typeof event.detail.failureText === 'string',
    ),
  );
  assert.ok(
    observations.some(
      (event) =>
        event.kind === 'browser.console' &&
        event.message === 'popup:log' &&
        event.detail.type === 'log',
    ),
  );
  assert.ok(
    observations.some(
      (event) => event.kind === 'browser.pageerror' && event.message === 'popup:pageerror',
    ),
  );
  const physicalAttachment = readJson(reportPath)
    .tests.flatMap((entry) => entry.attachments)
    .find((attachment) => attachment.name === 'physical fixture');
  assert.equal(physicalAttachment.inline, false);
  assert.doesNotMatch(physicalAttachment.path, /(?:^|\/)\.\.(?:\/|$)/);
  assert.equal(physicalAttachment.bytes, 3);
  assert.equal(physicalAttachment.sha256, sha256File(resolve(directory, physicalAttachment.path)));
});

test('the allowance builder refuses an unknown browser event', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'fgo-lab-allowance-builder-'));
  const inputPath = resolve(directory, 'observations.jsonl');
  writeFileSync(
    inputPath,
    `${JSON.stringify({
      runner: 'playwright',
      testId: 'fixture.spec.ts > unknown',
      kind: 'browser.console',
      message: 'unknown application output',
      detail: { type: 'log', url: 'http://127.0.0.1:4173/' },
    })}\n`,
  );
  const result = spawnSync(
    process.execPath,
    [
      'scripts/build-test-observation-allowances.mjs',
      inputPath,
      resolve(directory, 'allowances.json'),
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Observed browser events differ from declarations/);
  assert.match(result.stderr, /unexpected:/);
});

const serverRuntime = {
  baseURL: 'http://127.0.0.1:4174',
  server: {
    kind: 'next-production',
    version: '16.3.4',
    hmrUpdates: false,
    forwardConsole: false,
  },
};

test('the browser runtime contract pins the Next.js production server', () => {
  assert.deepEqual(validateBrowserRuntimeContract(serverRuntime, '16.3.4'), []);
  assert.deepEqual(validateBrowserRuntimeContract(serverRuntime, '16.3.5'), [
    'runtime:server_version_mismatch:expected_16.3.4:received_16.3.5',
  ]);
  const developmentRuntime = structuredClone(serverRuntime);
  developmentRuntime.server.kind = 'next-development';
  assert.deepEqual(validateBrowserRuntimeContract(developmentRuntime, '16.3.4'), [
    'runtime:invalid_server_kind',
  ]);
});

test('the production server owns no browser events and forbids declared HMR failures', () => {
  const observation = {
    runner: 'playwright',
    testId: 'fixture.spec.ts > application output',
    kind: 'browser.console',
    message: 'application output',
    detail: { type: 'log', url: `${serverRuntime.baseURL}/`, pageId: 'page-1' },
  };
  const clean = classifyServerObservations(
    [observation],
    serverRuntime,
    { pageLoads: [], serverFailures: [] },
    '16.3.4',
  );
  assert.deepEqual(clean.owned, []);
  assert.deepEqual(clean.remaining, [observation]);
  assert.deepEqual(clean.errors, []);

  const invalid = classifyServerObservations(
    [],
    serverRuntime,
    { pageLoads: [], serverFailures: [{ testId: 'fixture' }] },
    '16.3.4',
  );
  assert.deepEqual(invalid.errors, ['server:next_production_server_failures_must_be_empty']);
});
