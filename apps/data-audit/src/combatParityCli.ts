import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeRawCombatRules } from '@fgo-lab/data-pipeline';
import { compareCombatRules } from './compareCombatRules';

const [, , rawDirectory, niceDirectory] = process.argv;
if (!rawDirectory || !niceDirectory)
  throw new TypeError('usage: combat-parity <raw-table-directory> <nice-export-directory>');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const [mstClass, mstClassRelation, mstAttriRelation, mstCard, mstConstant] = await Promise.all(
  ['mstClass', 'mstClassRelation', 'mstAttriRelation', 'mstCard', 'mstConstant'].map((name) =>
    readJson(join(rawDirectory, `${name}.json`)),
  ),
);
const [classAttackRate, classRelation, attributeRelation, card, constant] = await Promise.all(
  [
    'NiceClassAttackRate',
    'NiceClassRelation',
    'NiceAttributeRelation',
    'NiceCard',
    'NiceConstant',
  ].map((name) => readJson(join(niceDirectory, `${name}.json`))),
);
const raw = normalizeRawCombatRules({
  mstClass,
  mstClassRelation,
  mstAttriRelation,
  mstCard,
  mstConstant,
});
process.stdout.write(
  `${JSON.stringify(compareCombatRules(raw, { classAttackRate, classRelation, attributeRelation, card, constant }))}\n`,
);
