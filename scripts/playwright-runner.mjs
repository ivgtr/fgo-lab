#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapturedTest } from './test-runner-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const timeoutMs = Number.parseInt(process.env['FGO_E2E_TIMEOUT_MS'] ?? '900000', 10);
const forwardedArgs = process.argv.slice(2);
if (forwardedArgs[0] === '--') forwardedArgs.shift();
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
  console.error('FGO_E2E_TIMEOUT_MS must be a positive integer.');
  process.exit(2);
}

try {
  const qualityDirectory = process.env['FGO_QUALITY_RUN_DIR'];
  const result = await runCapturedTest({
    root,
    command: 'pnpm',
    args: ['exec', 'playwright', 'test', ...forwardedArgs],
    commandLabel: 'test:e2e',
    suite: 'e2e',
    timeoutMs,
    forwardSignals: true,
    resultKind: 'playwright',
    reportName: 'playwright.json',
    observationName: null,
    additionalArtifacts: [
      { path: 'browser-observations.jsonl', format: 'jsonl', allowEmpty: true },
      { path: 'html/index.html', format: 'binary', allowEmpty: false },
      { path: 'playwright-artifacts/.last-run.json', format: 'json', allowEmpty: false },
    ],
    additionalArtifactDirectories: ['html', 'playwright-artifacts'],
    extraEnv: {
      FGO_BROWSER_OBSERVATION_PATH: '$FGO_TEST_ARTIFACT_DIR/browser-observations.jsonl',
      PLAYWRIGHT_HTML_OUTPUT_DIR: '$FGO_TEST_ARTIFACT_DIR/html',
      PLAYWRIGHT_OUTPUT_DIR: '$FGO_TEST_ARTIFACT_DIR/playwright-artifacts',
    },
    unsetEnv: ['NO_COLOR'],
    ...(qualityDirectory ? { artifactRoot: qualityDirectory, runId: 'playwright' } : {}),
  });
  process.stdout.write(result.summary);
  process.exitCode = result.exitCode;
} catch (cause) {
  console.error('FAIL test:e2e');
  console.error('Status: runner_failure (test result indeterminate)');
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
}
