import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveAtlasSkillReferenceClosure } from '@fgo-lab/data-pipeline';

const [, , niceDirectory, outputPath] = process.argv;
if (!niceDirectory || !outputPath)
  throw new TypeError('usage: live-reference-probe <nice-export-directory> <output-json>');

const documents = await Promise.all(
  ['nice_servant', 'nice_equip', 'nice_mystic_code'].map(
    async (name) =>
      JSON.parse(await readFile(join(niceDirectory, `${name}.json`), 'utf8')) as unknown,
  ),
);

const MAX_SKILL_BYTES = 2 * 1024 * 1024;
const hashes = new Map<number, string>();
let bytes = 0;
const skills = await resolveAtlasSkillReferenceClosure({
  documents,
  fetchSkill: async (id) => {
    const response = await fetch(`https://api.atlasacademy.io/nice/JP/skill/${String(id)}`, {
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new TypeError(`atlas_reference:http_${String(response.status)}:${id}`);
    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('application/json'))
      throw new TypeError(`atlas_reference:invalid_content_type:${id}`);
    const length = response.headers.get('content-length');
    if (length && Number(length) > MAX_SKILL_BYTES)
      throw new RangeError(`atlas_reference:skill_size_limit:${id}`);
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > MAX_SKILL_BYTES)
      throw new RangeError(`atlas_reference:skill_size_limit:${id}`);
    bytes += body.byteLength;
    hashes.set(id, createHash('sha256').update(body).digest('hex'));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  },
});
const ordered = [...skills].sort(([left], [right]) => left - right);
await writeFile(outputPath, JSON.stringify(ordered.map(([, skill]) => skill)));
process.stdout.write(
  `${JSON.stringify({
    scope: 'current-execution-reference-closure-only',
    count: ordered.length,
    bytes,
    hashes: Object.fromEntries([...hashes].sort(([left], [right]) => left - right)),
  })}\n`,
);
