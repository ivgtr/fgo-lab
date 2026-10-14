import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readJson, readJsonLines, sha256File } from './test-observation-lib.mjs';

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
        event.testId.includes('same-document URL change') &&
        event.kind === 'browser.resource_failure' &&
        event.detail.url === 'https://fixture.invalid/abort' &&
        event.detail.failureText === 'net::ERR_ABORTED',
    ),
  );
  assert.ok(
    observations.some(
      (event) =>
        event.testId.includes('failed document navigation') &&
        event.kind === 'browser.resource_failure' &&
        event.detail.url === 'https://fixture.invalid/abort' &&
        event.detail.failureText === 'net::ERR_ABORTED',
    ),
  );
  assert.ok(
    observations.some(
      (event) =>
        event.testId.includes('hash change during a pending reload') &&
        event.kind === 'browser.resource_failure' &&
        event.detail.url === 'https://fixture.invalid/abort' &&
        event.detail.failureText === 'net::ERR_ABORTED',
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
