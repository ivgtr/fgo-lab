#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapturedTest } from './test-runner-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requestedMode = process.argv[2];
const mode = requestedMode === 'diagnostic' ? 'diagnostic' : 'compact';
const forwardedArgs = process.argv.slice(
  requestedMode === 'diagnostic' || requestedMode === 'compact' ? 3 : 2,
);
const userArgs = forwardedArgs[0] === '--' ? forwardedArgs.slice(1) : forwardedArgs;
const forbidden = userArgs.find((argument) =>
  ['--reporter', '--outputFile'].some(
    (owned) =>
      argument === owned || argument.startsWith(`${owned}=`) || argument.startsWith(`${owned}.`),
  ),
);
if (forbidden) {
  console.error(`Runner owns ${forbidden}; remove that argument.`);
  process.exit(2);
}

const reportArgument = mode === 'diagnostic' ? '--outputFile.json' : '--outputFile';
const reporterArguments =
  mode === 'diagnostic' ? ['--reporter=verbose', '--reporter=json'] : ['--reporter=json'];
const timeoutMs = Number.parseInt(process.env['FGO_TEST_TIMEOUT_MS'] ?? '600000', 10);
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
  console.error('FGO_TEST_TIMEOUT_MS must be a positive integer.');
  process.exit(2);
}

try {
  const result = await runCapturedTest({
    root,
    mode,
    command: 'pnpm',
    args: [
      'exec',
      'vitest',
      'run',
      ...reporterArguments,
      `${reportArgument}=$FGO_TEST_REPORT_PATH`,
      ...userArgs,
    ],
    commandLabel: mode === 'diagnostic' ? 'test:diagnostic' : 'test:agent',
    timeoutMs,
    forwardSignals: true,
  });
  process.stdout.write(result.summary);
  process.exitCode = result.exitCode;
} catch (cause) {
  console.error(`FAIL ${mode === 'diagnostic' ? 'test:diagnostic' : 'test:agent'}`);
  console.error('Status: runner_failure (test result indeterminate)');
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
}
