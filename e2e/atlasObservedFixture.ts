import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  certifiedSourceVersion,
  normalizeAtlasSnapshot,
  normalizeNiceCombatRules,
} from '../packages/data-pipeline/src/browser';
import {
  ATLAS_EXPORT_KEYS,
  sourceCertificateSchema,
  type AtlasExportKey,
  type SourceCertificate,
} from '../packages/master-data/src/index';
import { ATLAS_CONTRACT_SHA256 } from '../apps/web/src/adapters/atlasContractFingerprint';

const run = promisify(execFile);
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');

export async function loadObservedAtlasFixture(): Promise<{
  certificate: SourceCertificate;
  canonicalSha256: string;
  bodies: Map<string, Buffer>;
  cleanup: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'fgo-atlas-e2e-'));
  try {
    const archive = resolve('packages/test-fixtures/atlas-observed-jp-20261013.tar.gz');
    await run('tar', ['-xzf', archive, '-C', directory]);
    const bodies = new Map<string, Buffer>();
    const exports = new Map<AtlasExportKey, unknown>();
    for (const key of ATLAS_EXPORT_KEYS) {
      const body = await readFile(join(directory, `${key}.json`));
      bodies.set(`/export/JP/${key}.json`, body);
      exports.set(key, JSON.parse(body.toString('utf8')) as unknown);
    }
    const skillNames = await readdir(join(directory, 'referenced_skills'));
    const skillIds = skillNames.map((name) => {
      if (!/^[1-9][0-9]*\.json$/.test(name)) throw new TypeError('invalid_atlas_fixture_skill');
      return Number(name.slice(0, -5));
    });
    skillIds.sort((a, b) => a - b);
    const referencedSkills = new Map<number, unknown>();
    for (const id of skillIds) {
      const body = await readFile(join(directory, 'referenced_skills', `${String(id)}.json`));
      bodies.set(`/nice/JP/skill/${String(id)}`, body);
      referencedSkills.set(id, JSON.parse(body.toString('utf8')) as unknown);
    }
    const provisional = sourceCertificateSchema.parse({
      format: 'fgo-lab-atlas-source-v1',
      region: 'JP',
      generation: 1,
      publishedAt: '2026-10-13T05:10:00.000Z',
      observedAt: '2026-10-12T19:05:03.186Z',
      rawCommit: '0dc8727576f8c1a99fbe51339246ffabd62309b3',
      rawCommittedAt: '2026-10-12T15:01:00.000Z',
      exporterCommit: '35cadc444e20c78cc60e56082ad1b64607d4d2e2',
      publisherCommit: 'a'.repeat(40),
      contractSha256: ATLAS_CONTRACT_SHA256,
      masterSchemaVersion: 57,
      canonicalSha256: '0'.repeat(64),
      exports: ATLAS_EXPORT_KEYS.map((key) => {
        const body = bodies.get(`/export/JP/${key}.json`)!;
        return { key, bytes: body.length, sha256: sha256(body) };
      }),
      referencedSkills: skillIds.map((id) => {
        const body = bodies.get(`/nice/JP/skill/${String(id)}`)!;
        return { id, bytes: body.length, sha256: sha256(body) };
      }),
    });
    const master = normalizeAtlasSnapshot({
      version: certifiedSourceVersion(provisional),
      combatRules: normalizeNiceCombatRules({
        classAttackRate: exports.get('NiceClassAttackRate'),
        classRelation: exports.get('NiceClassRelation'),
        attributeRelation: exports.get('NiceAttributeRelation'),
        card: exports.get('NiceCard'),
        constant: exports.get('NiceConstant'),
      }),
      servants: exports.get('nice_servant'),
      equips: exports.get('nice_equip'),
      mysticCodes: exports.get('nice_mystic_code'),
      items: exports.get('nice_item'),
      battlePoints: exports.get('nice_battle_point'),
      referencedSkills: skillIds.map((id) => referencedSkills.get(id)),
    });
    const canonicalSha256 = sha256(JSON.stringify(master));
    const certificate = sourceCertificateSchema.parse({
      ...provisional,
      canonicalSha256,
    });
    return {
      certificate,
      canonicalSha256,
      bodies,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (cause) {
    await rm(directory, { recursive: true, force: true });
    throw cause;
  }
}
