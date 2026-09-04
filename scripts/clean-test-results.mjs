#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTestResults } from './test-results-cleanup-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argument = process.argv[2];
if (process.argv.length > 3 || (argument && !argument.startsWith('--keep='))) {
  console.error('usage: pnpm results:clean [--keep=<positive integer>]');
  process.exit(2);
}
const keep = argument ? Number(argument.slice('--keep='.length)) : 10;

try {
  const result = cleanTestResults(resolve(root, '.test-results'), keep);
  console.log(
    `Cleaned test results: removed ${result.removed.length}, kept ${result.kept.length}, protected running ${result.protected.length}`,
  );
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
}
