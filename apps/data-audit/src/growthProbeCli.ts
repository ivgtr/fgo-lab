import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeRawNiceGrowth } from './probeRawNiceGrowth';

const [, , rawDirectory, niceDirectory] = process.argv;
if (!rawDirectory || !niceDirectory)
  throw new TypeError('usage: growth-probe <raw-table-directory> <nice-export-directory>');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const [rawServants, rawLimits, rawExperience] = await Promise.all(
  ['mstSvt', 'mstSvtLimit', 'mstSvtExp'].map((name) =>
    readJson(join(rawDirectory, `${name}.json`)),
  ),
);
const [niceEnums, niceServants, niceCraftEssences] = await Promise.all(
  ['nice_enums', 'nice_servant', 'nice_equip'].map((name) =>
    readJson(join(niceDirectory, `${name}.json`)),
  ),
);
const result = probeRawNiceGrowth({
  rawServants,
  rawLimits,
  rawExperience,
  niceEnums,
  niceServants,
  niceCraftEssences,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
