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
        event.testId ===
          'browser-observer.fixture.ts > default page captures every supported console type' &&
        event.kind === 'browser.console' &&
        event.message === 'popup:log' &&
        event.detail.type === 'log',
    ),
  );
  assert.ok(
    observations.some(
      (event) =>
        event.testId ===
          'browser-observer.fixture.ts > default page captures every supported console type' &&
        event.kind === 'browser.pageerror' &&
        event.message === 'popup:pageerror',
    ),
  );
  assert.ok(
    observations.some(
      (event) =>
        event.kind === 'browser.console' &&
        event.detail.type === 'error' &&
        event.detail.locationUrl === 'https://fixture.invalid/image.png',
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
    kind: 'vite-dev',
    version: '8.2.2',
    clientPath: '/@vite/client',
    webSocketPath: '/',
    hmrUpdates: false,
  },
};
const serverTestId = 'fixture.spec.ts > server lifecycle';
const serverDeclaration = {
  pageLoads: [{ testId: serverTestId, pages: [{ path: '/', count: 1 }] }],
  serverFailures: [],
};

function viteConsole(
  message,
  type = 'debug',
  locationUrl = `${serverRuntime.baseURL}/@vite/client`,
) {
  return {
    runner: 'playwright',
    testId: serverTestId,
    kind: 'browser.console',
    message,
    detail: { type, url: `${serverRuntime.baseURL}/`, locationUrl, pageId: 'page-1' },
  };
}

function webSocket(phase, socketId = 'page-1-socket-1') {
  return {
    runner: 'playwright',
    testId: serverTestId,
    kind: 'browser.websocket',
    message: phase,
    detail: {
      url: 'ws://127.0.0.1:4174/?token=fixture',
      pageUrl: `${serverRuntime.baseURL}/`,
      pageId: 'page-1',
      socketId,
      phase,
    },
  };
}

test('test-server lifecycle ownership preserves raw events and exact source identity', () => {
  const observations = [
    viteConsole('[vite] connecting...'),
    webSocket('open'),
    viteConsole('[vite] connected.'),
  ];
  const raw = structuredClone(observations);
  const result = classifyServerObservations(
    observations,
    serverRuntime,
    serverDeclaration,
    '8.2.2',
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.remaining, []);
  assert.equal(result.owned.length, observations.length);
  assert.ok(observations.every((observation) => result.owned.includes(observation)));
  assert.deepEqual(observations, raw);

  const applicationMessage = viteConsole(
    '[vite] connected.',
    'debug',
    `${serverRuntime.baseURL}/src/application.ts`,
  );
  const applicationResult = classifyServerObservations(
    [applicationMessage],
    serverRuntime,
    serverDeclaration,
    '8.2.2',
  );
  assert.deepEqual(applicationResult.remaining, [applicationMessage]);
  assert.ok(applicationResult.errors.some((error) => error.includes('received_0')));
});

test('test-server lifecycle rejects unknown output and invalid transitions', () => {
  const unknownWarning = viteConsole('unknown server warning', 'warn');
  const unknownError = viteConsole('unknown server error', 'error');
  for (const unknown of [unknownWarning, unknownError]) {
    const result = classifyServerObservations(
      [
        viteConsole('[vite] connecting...'),
        webSocket('open'),
        viteConsole('[vite] connected.'),
        unknown,
      ],
      serverRuntime,
      serverDeclaration,
      '8.2.2',
    );
    assert.deepEqual(result.remaining, [unknown]);
    if (unknown === unknownError)
      assert.ok(result.errors.some((error) => error.includes('consoleError')));
  }

  for (const observations of [
    [viteConsole('[vite] connected.'), webSocket('open')],
    [
      viteConsole('[vite] connecting...'),
      webSocket('open'),
      viteConsole('[vite] connected.'),
      viteConsole('[vite] connected.'),
    ],
  ]) {
    const result = classifyServerObservations(
      observations,
      serverRuntime,
      serverDeclaration,
      '8.2.2',
    );
    assert.notDeepEqual(result.errors, []);
  }
});

test('offline WebSocket failure is owned only by its test declaration and exact counts', () => {
  const failureDeclaration = {
    pageLoads: [{ testId: serverTestId, pages: [{ path: '/', count: 1 }] }],
    serverFailures: [
      {
        testId: serverTestId,
        path: '/',
        pageId: 'page-1',
        connecting: 1,
        connected: 0,
        webSocketOpen: 1,
        webSocketError: 1,
        webSocketClose: 1,
        consoleError: 1,
      },
    ],
  };
  const failureEvents = [
    viteConsole('[vite] connecting...'),
    webSocket('open'),
    webSocket('error'),
    viteConsole('dynamic browser WebSocket error', 'error'),
    webSocket('close'),
  ];
  const accepted = classifyServerObservations(
    failureEvents,
    serverRuntime,
    failureDeclaration,
    '8.2.2',
  );
  assert.deepEqual(accepted.errors, []);
  assert.deepEqual(accepted.remaining, []);

  const wrongTest = failureEvents.map((event) => ({ ...event, testId: 'fixture.spec.ts > wrong' }));
  const wrongTestResult = classifyServerObservations(
    wrongTest,
    serverRuntime,
    failureDeclaration,
    '8.2.2',
  );
  assert.equal(wrongTestResult.remaining.length, wrongTest.length);

  const wrongCount = classifyServerObservations(
    failureEvents.filter((event) => event.detail.phase !== 'error'),
    serverRuntime,
    failureDeclaration,
    '8.2.2',
  );
  assert.ok(wrongCount.errors.some((error) => error.includes('webSocketError')));
  assert.ok(
    wrongCount.errors.some((error) => error.includes('missing_typed_websocket_correlation')),
  );
});

test('runtime contract rejects actual Vite version and client path drift', () => {
  assert.deepEqual(validateBrowserRuntimeContract(serverRuntime, '8.2.2'), []);
  assert.deepEqual(validateBrowserRuntimeContract(serverRuntime, '8.2.3'), [
    'runtime:vite_version_mismatch:expected_8.2.2:received_8.2.3',
    'runtime:vite_binary_version_mismatch:expected_8.2.2:received_8.2.3',
  ]);
  assert.deepEqual(validateBrowserRuntimeContract(serverRuntime, '8.2.2', '8.3.0'), [
    'runtime:vite_binary_version_mismatch:expected_8.2.2:received_8.3.0',
  ]);
  const changedPath = structuredClone(serverRuntime);
  changedPath.server.clientPath = '/different-client';
  const result = classifyServerObservations(
    [viteConsole('[vite] connecting...'), webSocket('open'), viteConsole('[vite] connected.')],
    changedPath,
    serverDeclaration,
    '8.2.2',
  );
  assert.equal(result.remaining.length, 2);
  assert.ok(result.errors.some((error) => error.includes('connecting')));
});
