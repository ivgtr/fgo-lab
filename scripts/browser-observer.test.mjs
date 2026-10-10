import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyServerObservations,
  validateBrowserRuntimeContract,
} from './test-observation-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

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
