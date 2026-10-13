import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ATLAS_EXPORT_KEYS, type AtlasExportKey } from '@fgo-lab/master-data';
import { resolveAtlasSkillReferenceClosure } from '@fgo-lab/data-pipeline';

type BodyDigest = { bytes: number; sha256: string };

export type ReplayByteAttestation = {
  scope: 'source-bytes-and-execution-reference-closure-only';
  exports: { key: AtlasExportKey; bytes: number; sha256: string }[];
  referencedSkills: { id: number; bytes: number; sha256: string }[];
};

const MAX_EXPORT_BYTES = 128 * 1024 * 1024;
const MAX_SKILL_BYTES = 2 * 1024 * 1024;

function digest(body: Uint8Array): BodyDigest {
  return {
    bytes: body.byteLength,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

async function readBounded(path: string, maxBytes: number): Promise<Uint8Array> {
  const body = await readFile(path);
  if (body.byteLength === 0 || body.byteLength > maxBytes)
    throw new RangeError(`replay_attestation:body_size:${path}`);
  return body;
}

function decodeJson(body: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new TypeError(`replay_attestation:invalid_json:${path}`);
  }
}

function equalBytes(live: Uint8Array, replayed: Uint8Array, label: string): BodyDigest {
  const liveDigest = digest(live);
  const replayDigest = digest(replayed);
  if (liveDigest.bytes !== replayDigest.bytes || liveDigest.sha256 !== replayDigest.sha256)
    throw new TypeError(`replay_attestation:byte_mismatch:${label}`);
  return liveDigest;
}

function skillIdFromName(name: string): number {
  if (!/^[1-9][0-9]*\.json$/.test(name))
    throw new TypeError(`replay_attestation:invalid_skill_filename:${name}`);
  const id = Number(name.slice(0, -5));
  if (!Number.isSafeInteger(id)) throw new TypeError('replay_attestation:unsafe_skill_id');
  return id;
}

/**
 * Byte identity with a pinned Atlas replay is a source check, not a semantic
 * acceptance or certificate publication decision.
 */
export async function attestReplayBytes(input: {
  observedDirectory: string;
  replayDirectory: string;
}): Promise<ReplayByteAttestation> {
  const documents: unknown[] = [];
  const exports: ReplayByteAttestation['exports'] = [];
  for (const key of ATLAS_EXPORT_KEYS) {
    const name = `${key}.json`;
    const [live, replayed] = await Promise.all([
      readBounded(join(input.observedDirectory, name), MAX_EXPORT_BYTES),
      readBounded(join(input.replayDirectory, name), MAX_EXPORT_BYTES),
    ]);
    const body = equalBytes(live, replayed, name);
    const document = decodeJson(live, name);
    if (key === 'nice_servant' || key === 'nice_equip' || key === 'nice_mystic_code')
      documents.push(document);
    exports.push({ key, ...body });
  }

  const observedSkills = join(input.observedDirectory, 'referenced_skills');
  const replaySkills = join(input.replayDirectory, 'referenced_skills');
  const [observedNames, replayNames] = await Promise.all([
    readdir(observedSkills),
    readdir(replaySkills),
  ]);
  const observedIds = observedNames.map(skillIdFromName).sort((a, b) => a - b);
  const replayIds = replayNames.map(skillIdFromName).sort((a, b) => a - b);
  if (JSON.stringify(observedIds) !== JSON.stringify(replayIds))
    throw new TypeError('replay_attestation:reference_file_set_mismatch');
  const digests = new Map<number, BodyDigest>();
  const skills = await resolveAtlasSkillReferenceClosure({
    documents,
    fetchSkill: async (id) => {
      if (!observedIds.includes(id))
        throw new TypeError(`replay_attestation:missing_reference:${id}`);
      const name = `${String(id)}.json`;
      const [live, replayed] = await Promise.all([
        readBounded(join(observedSkills, name), MAX_SKILL_BYTES),
        readBounded(join(replaySkills, name), MAX_SKILL_BYTES),
      ]);
      digests.set(id, equalBytes(live, replayed, name));
      return decodeJson(live, name);
    },
  });
  if (skills.size !== observedIds.length) throw new TypeError('replay_attestation:extra_reference');
  return {
    scope: 'source-bytes-and-execution-reference-closure-only',
    exports,
    referencedSkills: observedIds.map((id) => ({ id, ...digests.get(id)! })),
  };
}
