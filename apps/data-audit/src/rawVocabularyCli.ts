import { resolve } from 'node:path';
import { auditRawVocabulary } from './rawVocabulary';

const [repo, revision, ...extra] = process.argv.slice(2);
if (!repo || !revision || extra.length)
  throw new TypeError('usage: raw-vocabulary <raw-repo> <full-commit>');
const result = await auditRawVocabulary({
  repo,
  revision,
  baselinePath: resolve(import.meta.dirname, '../baselines/raw-jp-0dc872.json'),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.changes.length) process.exitCode = 1;
