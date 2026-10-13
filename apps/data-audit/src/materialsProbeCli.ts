import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeRawNiceMaterials } from './probeRawNiceMaterials';

const [, , rawDirectory, niceDirectory] = process.argv;
if (!rawDirectory || !niceDirectory)
  throw new TypeError('usage: materials-probe <raw-table-directory> <nice-export-directory>');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const [rawServants, rawItems, rawCombineLimits, rawCombineSkills, rawCombineAppendSkills] =
  await Promise.all(
    ['mstSvt', 'mstItem', 'mstCombineLimit', 'mstCombineSkill', 'mstCombineAppendPassiveSkill'].map(
      (name) => readJson(join(rawDirectory, `${name}.json`)),
    ),
  );
const niceServants = await readJson(join(niceDirectory, 'nice_servant.json'));
const result = probeRawNiceMaterials({
  rawServants,
  rawItems,
  rawCombineLimits,
  rawCombineSkills,
  rawCombineAppendSkills,
  niceServants,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
