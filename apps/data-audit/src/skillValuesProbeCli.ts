import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeRawNiceFunctionValues } from './probeSkillValues';

const [, , rawDirectory, niceDirectory, referencedSkillPath] = process.argv;
if (!rawDirectory || !niceDirectory)
  throw new TypeError(
    'usage: skill-values-probe <raw-table-directory> <nice-export-directory> [referenced-skills-json]',
  );

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const [rawSkillLevels, rawNoblePhantasmLevels, rawFunctions] = await Promise.all(
  ['mstSkillLv', 'mstTreasureDeviceLv', 'mstFunc'].map((name) =>
    readJson(join(rawDirectory, `${name}.json`)),
  ),
);
const [niceServants, niceCraftEssences, niceMysticCodes, niceEnums] = await Promise.all(
  ['nice_servant', 'nice_equip', 'nice_mystic_code', 'nice_enums'].map((name) =>
    readJson(join(niceDirectory, `${name}.json`)),
  ),
);
const result = probeRawNiceFunctionValues({
  rawSkillLevels,
  rawNoblePhantasmLevels,
  rawFunctions,
  niceEnums,
  niceServants,
  niceCraftEssences,
  niceMysticCodes,
  ...(referencedSkillPath ? { niceReferencedSkills: await readJson(referencedSkillPath) } : {}),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
