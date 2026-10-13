import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAtlasSkillReferenceClosure } from '@fgo-lab/data-pipeline';
import { ATLAS_EXPORT_KEYS, atlasExportUrl, atlasReferencedSkillUrl } from '@fgo-lab/master-data';

const [, , destination, ...extra] = process.argv;
if (!destination || extra.length)
  throw new TypeError('usage: capture-atlas-bodies <new-empty-directory>');

const MAX_EXPORT_BYTES = 128 * 1024 * 1024;
const MAX_SKILL_BYTES = 2 * 1024 * 1024;

async function getBody(url: string, maxBytes: number): Promise<Uint8Array> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new TypeError(`atlas_capture:http_${String(response.status)}:${url}`);
  if (!response.headers.get('content-type')?.startsWith('application/json'))
    throw new TypeError(`atlas_capture:content_type:${url}`);
  const length = response.headers.get('content-length');
  if (length && Number(length) > maxBytes)
    throw new RangeError(`atlas_capture:content_length:${url}`);
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > maxBytes)
    throw new RangeError(`atlas_capture:body_size:${url}`);
  return body;
}

function parseJson(body: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new TypeError(`atlas_capture:invalid_json:${label}`);
  }
}

await mkdir(destination);
const documents: unknown[] = [];
for (const key of ATLAS_EXPORT_KEYS) {
  const body = await getBody(atlasExportUrl(key), MAX_EXPORT_BYTES);
  const value = parseJson(body, key);
  await writeFile(join(destination, `${key}.json`), body, { flag: 'wx' });
  if (key === 'nice_servant' || key === 'nice_equip' || key === 'nice_mystic_code')
    documents.push(value);
}

const referenceDirectory = join(destination, 'referenced_skills');
await mkdir(referenceDirectory);
const skills = await resolveAtlasSkillReferenceClosure({
  documents,
  fetchSkill: async (id) => {
    const body = await getBody(atlasReferencedSkillUrl(id), MAX_SKILL_BYTES);
    await writeFile(join(referenceDirectory, `${String(id)}.json`), body, { flag: 'wx' });
    return parseJson(body, `skill:${String(id)}`);
  },
});
process.stdout.write(
  `${JSON.stringify({
    scope: 'observed-mutable-atlas-api-bodies-only',
    observedAt: new Date().toISOString(),
    exports: ATLAS_EXPORT_KEYS.length,
    referencedSkills: skills.size,
  })}\n`,
);
await writeFile(
  join(destination, 'observation.json'),
  `${JSON.stringify({ format: 'fgo-lab-atlas-observation-v1', observedAt: new Date().toISOString() })}\n`,
  { flag: 'wx' },
);
