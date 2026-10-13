import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeAtlasSnapshot } from '@fgo-lab/data-pipeline';

const [, , directory, ...extra] = process.argv;
if (!directory || extra.length)
  throw new TypeError('usage: canonical-probe <captured-atlas-body-directory>');

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const names = await readdir(join(directory, 'referenced_skills'));
const references = await Promise.all(
  names.sort().map((name) => {
    if (!/^[1-9][0-9]*\.json$/.test(name))
      throw new TypeError(`canonical_probe:invalid_reference_name:${name}`);
    return json(join(directory, 'referenced_skills', name));
  }),
);
const [servants, equips, mysticCodes, items, battlePoints] = await Promise.all(
  ['nice_servant', 'nice_equip', 'nice_mystic_code', 'nice_item', 'nice_battle_point'].map((name) =>
    json(join(directory, `${name}.json`)),
  ),
);
const master = normalizeAtlasSnapshot({
  version: 'atlas-observed-source-probe',
  servants,
  equips,
  mysticCodes,
  items,
  referencedSkills: references,
  battlePoints,
});
process.stdout.write(
  `${JSON.stringify({
    scope: 'current-canonical-normalizer-only',
    servants: master.servants.length,
    craftEssences: master.craftEssences.length,
    mysticCodes: master.mysticCodes.length,
    materials: master.materials.length,
  })}\n`,
);
