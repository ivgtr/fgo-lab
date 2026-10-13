import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeRawNiceVocabulary } from './probeRawNiceVocabulary';

const [, , rawDirectory, niceDirectory] = process.argv;
if (!rawDirectory || !niceDirectory)
  throw new TypeError('usage: vocabulary-probe <raw-table-directory> <nice-export-directory>');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const [rawServants, rawItems, rawFunctions, rawBuffs] = await Promise.all(
  ['mstSvt', 'mstItem', 'mstFunc', 'mstBuff'].map((name) =>
    readJson(join(rawDirectory, `${name}.json`)),
  ),
);
const [niceServants, niceCraftEssences, niceMysticCodes, niceItems, niceEnums] = await Promise.all(
  ['nice_servant', 'nice_equip', 'nice_mystic_code', 'nice_item', 'nice_enums'].map((name) =>
    readJson(join(niceDirectory, `${name}.json`)),
  ),
);
const result = probeRawNiceVocabulary({
  rawServants,
  rawItems,
  rawFunctions,
  rawBuffs,
  niceServants,
  niceCraftEssences,
  niceMysticCodes,
  niceItems,
  niceEnums,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
