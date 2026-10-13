import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeRawNiceIdentity } from './probeRawNiceIdentity';

const [, , rawDirectory, niceDirectory] = process.argv;
if (!rawDirectory || !niceDirectory)
  throw new TypeError('usage: source-probe <raw-table-directory> <nice-export-directory>');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const [
  rawServants,
  rawMysticCodes,
  rawMysticCodeSkills,
  rawItems,
  rawServantSkills,
  rawServantNoblePhantasms,
  rawFunctions,
  niceServants,
  niceCraftEssences,
  niceMysticCodes,
  niceItems,
  niceEnums,
] = await Promise.all(
  [
    'mstSvt',
    'mstEquip',
    'mstEquipSkill',
    'mstItem',
    'mstSvtSkill',
    'mstSvtTreasureDevice',
    'mstFunc',
  ]
    .map((name) => readJson(join(rawDirectory, `${name}.json`)))
    .concat(
      ['nice_servant', 'nice_equip', 'nice_mystic_code', 'nice_item', 'nice_enums'].map((name) =>
        readJson(join(niceDirectory, `${name}.json`)),
      ),
    ),
);

const result = probeRawNiceIdentity({
  rawServants,
  rawMysticCodes,
  rawMysticCodeSkills,
  rawItems,
  rawServantSkills,
  rawServantNoblePhantasms,
  rawFunctions,
  niceServants,
  niceCraftEssences,
  niceMysticCodes,
  niceItems,
  niceEnums,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
