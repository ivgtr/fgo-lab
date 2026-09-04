#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { classifyObservations } from './test-observation-lib.mjs';

const [inputArgument, outputArgument] = process.argv.slice(2);
if (!inputArgument || !outputArgument) {
  console.error('Usage: build-test-observation-allowances <observations.jsonl> <allowances.json>');
  process.exit(2);
}

const root = resolve(import.meta.dirname, '..');
const runtimeContract = readJson(resolve(root, 'scripts/e2e-runtime-contract.json'));
const declaration = readJson(resolve(root, 'e2e/expected-browser-events.json'));
const appRequire = createRequire(resolve(root, 'apps/web/package.json'));
const installedServerVersion = readJson(appRequire.resolve('next/package.json')).version;
const expectations = materializeExpectations(declaration, runtimeContract.baseURL);
const events = readFileSync(resolve(inputArgument), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const activeScopes = new Set(expectations.map(({ runner, testId }) => `${runner}\u0000${testId}`));
const classified = classifyObservations(events, expectations, new Date(), activeScopes, {
  runtime: runtimeContract,
  declaration,
  installedServerVersion,
});
if (
  classified.allowanceErrors.length > 0 ||
  classified.infrastructureErrors.length > 0 ||
  classified.unexpected.length > 0
) {
  const errors = [
    ...classified.allowanceErrors,
    ...classified.infrastructureErrors,
    ...classified.unexpected.map((event) => `unexpected:${JSON.stringify(event)}`),
  ];
  throw new Error(`Observed browser events differ from declarations:\n${errors.join('\n')}`);
}
writeFileSync(resolve(outputArgument), `${JSON.stringify(expectations, null, 2)}\n`);

function materializeExpectations(value, baseURL) {
  const result = [];
  for (const { testId, resources } of value.atlasImageFailures)
    for (const resource of resources) {
      const url = new URL(resource.path, 'https://static.atlasacademy.io').href;
      result.push(resourceFailure(testId, url, 'image', 'net::ERR_FAILED', resource.count, value));
    }
  for (const failure of value.localResourceFailures) {
    const url = new URL(failure.path, baseURL).href;
    result.push(
      resourceFailure(
        failure.testId,
        url,
        failure.resourceType,
        failure.failureText,
        failure.count,
        value,
      ),
    );
  }
  return result.sort(
    (left, right) =>
      left.testId.localeCompare(right.testId) ||
      left.kind.localeCompare(right.kind) ||
      left.message.localeCompare(right.message),
  );
}

function resourceFailure(testId, url, resourceType, failureText, expectedCount, declaration) {
  return {
    runner: 'playwright',
    testId,
    kind: 'browser.resource_failure',
    message: `${resourceType} ${url}: ${failureText}`,
    detail: { url, resourceType, failureText, pageId: 'page-1' },
    expectedCount,
    reason: url.startsWith('https://static.atlasacademy.io/')
      ? 'This test declares and aborts this exact Atlas image request to verify fallback behavior.'
      : 'The incompatible-master recovery declares this exact superseded manifest request.',
    expiresAt: declaration.expiresAt,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
