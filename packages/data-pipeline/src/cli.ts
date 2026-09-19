import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterManifestSchema } from '@fgo-lab/master-data';
import {
  assertMasterVersionIdentity,
  createManifest,
  inventoryAtlasAttackFunctions,
  normalizeAtlasSnapshot,
  validatePublishedArtifact,
} from './index';
const root = resolve(import.meta.dirname, '../../..');
const command = process.argv[2];
if (command === 'validate') {
  const manifest = masterManifestSchema.parse(
    JSON.parse(
      await readFile(resolve(root, 'apps/web/public/master/manifest.json'), 'utf8'),
    ) as unknown,
  );
  const files: Record<string, string> = {};
  await Promise.all(
    manifest.files.map(async ({ file }) => {
      files[file] = await readFile(resolve(root, 'apps/web/public/master', file), 'utf8');
    }),
  );
  const report = validatePublishedArtifact(manifest, files);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
} else if (command === 'inventory') {
  const source = process.argv[3];
  if (!source) throw new Error('usage: inventory <nice_servant.json>');
  const report = inventoryAtlasAttackFunctions(
    JSON.parse(await readFile(resolve(root, source), 'utf8')) as unknown[],
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.unknown.length > 0) process.exitCode = 1;
} else if (command === 'normalize') {
  const version = process.argv[3] ?? new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const manifestPath = resolve(root, 'apps/web/public/master/manifest.json');
  const currentManifest = await readFile(manifestPath, 'utf8')
    .then((content) => masterManifestSchema.parse(JSON.parse(content)))
    .catch(() => undefined);
  const [servants, equips, mysticCodes, items, referencedSkills, battlePoints] = await Promise.all(
    [
      'nice_servant.json',
      'nice_equip.json',
      'nice_mystic_code.json',
      'nice_item.json',
      'referenced_skills.json',
      'battle_points.json',
    ].map(
      async (file) =>
        JSON.parse(await readFile(resolve(root, 'data/raw', file), 'utf8')) as unknown,
    ),
  );
  const snapshot = normalizeAtlasSnapshot({
    version,
    servants,
    equips,
    mysticCodes,
    items,
    referencedSkills,
    battlePoints,
  });
  const content = `${JSON.stringify(snapshot)}\n`;
  const timestamp = new Date().toISOString();
  const manifest = createManifest({
    masterDataVersion: version,
    createdAt: timestamp,
    retrievedAt: timestamp,
    minimalAppVersion: '0.1.0',
    artifactKind: 'production',
    imagesEnabled: true,
    files: [{ key: 'master', file: 'master.json', content, required: true }],
  });
  assertMasterVersionIdentity(currentManifest, manifest);
  await writeFile(resolve(root, 'apps/web/public/master/master.json'), content, 'utf8');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        version,
        servants: snapshot.servants.length,
        craftEssences: snapshot.craftEssences.length,
        mysticCodes: snapshot.mysticCodes.length,
        materials: snapshot.materials.length,
      },
      null,
      2,
    ),
  );
} else throw new Error('usage: validate | inventory <nice_servant.json> | normalize [version]');
