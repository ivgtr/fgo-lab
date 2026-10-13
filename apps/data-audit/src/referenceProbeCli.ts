import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  atlasDocumentReferenceIds,
  atlasDocumentPotentialCallbackInventory,
  resolveAtlasSkillReferenceClosure,
} from '@fgo-lab/data-pipeline';

const [, , niceDirectory, referencedSkillPath] = process.argv;
if (!niceDirectory)
  throw new TypeError('usage: reference-probe <nice-export-directory> [referenced-skills-json]');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const documents = await Promise.all(
  ['nice_servant', 'nice_equip', 'nice_mystic_code'].map((name) =>
    readJson(join(niceDirectory, `${name}.json`)),
  ),
);
const direct = new Set(documents.flatMap((document) => atlasDocumentReferenceIds(document)));
const callbackInventories = documents.map((document) =>
  atlasDocumentPotentialCallbackInventory(document),
);
const callbackTypes = new Set(callbackInventories.flatMap((inventory) => inventory.buffTypes));
const callbackIds = new Set(callbackInventories.flatMap((inventory) => inventory.skillIds));
if (!referencedSkillPath) {
  process.stdout.write(
    `${JSON.stringify({ scope: 'reference-inventory-only', executionReferenceIds: [...direct].sort((a, b) => a - b), potentialCallbackTypes: [...callbackTypes].sort(), potentialCallbackSkillIds: callbackIds.size })}\n`,
  );
} else {
  const source = await readJson(referencedSkillPath);
  if (!Array.isArray(source)) throw new TypeError('reference_probe:expected_skill_array');
  const byId = new Map<number, unknown>();
  for (const skill of source) {
    if (!skill || Array.isArray(skill) || typeof skill !== 'object')
      throw new TypeError('reference_probe:invalid_skill');
    const id = (skill as Record<string, unknown>).id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || byId.has(id))
      throw new TypeError('reference_probe:duplicate_or_invalid_skill_id');
    byId.set(id, skill);
  }
  const closure = await resolveAtlasSkillReferenceClosure({
    documents,
    fetchSkill: (id) => Promise.resolve(byId.get(id)),
  });
  process.stdout.write(
    `${JSON.stringify({ scope: 'reference-id-closure-only', directCount: direct.size, closureCount: closure.size, closureIds: [...closure.keys()].sort((a, b) => a - b), potentialCallbackTypes: callbackTypes.size, potentialCallbackSkillIds: callbackIds.size })}\n`,
  );
}
