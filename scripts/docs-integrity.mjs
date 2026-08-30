#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepository } from './docs-integrity-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const errors = validateRepository(root);

if (errors.length > 0) {
  console.error(`docs integrity failed (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('docs integrity passed');
}
