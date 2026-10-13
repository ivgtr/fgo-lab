import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  inventoryAtlasAttackFunctions,
  parsePublishedManifest,
  validatePublishedArtifact,
} from './index';
const root = resolve(import.meta.dirname, '../../..');
const command = process.argv[2];
if (command === 'validate') {
  const manifest = parsePublishedManifest(
    JSON.parse(
      await readFile(
        resolve(root, 'packages/test-fixtures/production-master/manifest.json'),
        'utf8',
      ),
    ) as unknown,
  );
  const files: Record<string, string> = {};
  await Promise.all(
    manifest.files.map(async ({ file }) => {
      files[file] = await readFile(
        resolve(root, 'packages/test-fixtures/production-master', file),
        'utf8',
      );
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
} else throw new Error('usage: validate | inventory <nice_servant.json>');
