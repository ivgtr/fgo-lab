import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  compareJsonVocabulary,
  scanCapturedAtlasVocabulary,
  type JsonVocabulary,
} from './jsonVocabulary';

const [mode, directory, output, ...extra] = process.argv.slice(2);
if (!mode || !directory || extra.length || !['capture', 'check'].includes(mode))
  throw new TypeError('usage: json-vocabulary <capture|check> <observed-directory> [output-path]');
const catalog = await scanCapturedAtlasVocabulary(directory);
const baselinePath = resolve(import.meta.dirname, '../baselines/nice-jp-20261013.json');
if (mode === 'capture') {
  if (!output) throw new TypeError('json_vocabulary:output_required');
  await writeFile(output, `${JSON.stringify(catalog)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ documents: Object.keys(catalog).length })}\n`);
} else {
  if (output) throw new TypeError('json_vocabulary:unexpected_output');
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as JsonVocabulary;
  const changes = compareJsonVocabulary(baseline, catalog);
  process.stdout.write(`${JSON.stringify({ documents: Object.keys(catalog).length, changes })}\n`);
  if (changes.length) process.exitCode = 1;
}
