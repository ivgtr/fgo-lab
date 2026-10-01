import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  evidencePath,
  packEvidence,
  restoreEvidence,
  verifyBundle,
} from './evidence-preservation.mjs';
import { collectOwnedReferences } from './evidence-preservation-references.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'fgo-evidence-preservation-'));
  await mkdir(resolve(root, '.test-results/run'), { recursive: true });
  const paths = [
    '.test-results/run/broken.json',
    '.test-results/run/copy.json',
    '.test-results/run/empty.log',
  ];
  await writeFile(resolve(root, paths[0]), '{ deliberately invalid\n');
  await writeFile(resolve(root, paths[1]), '{ deliberately invalid\n');
  await writeFile(resolve(root, paths[2]), '');
  const membership = {
    seedPaths: [paths[0]],
    paths,
    manifests: [],
    declared: {
      [paths[0]]: { bytes: 23, sha256: '0'.repeat(64) },
    },
    missing: [],
    conflicts: [],
    sizeMismatches: [],
    invalidJsonInputs: [],
    qualification: 'fixture',
    conflictingDeclarations: [],
  };
  const input = resolve(root, 'membership-input.json');
  await writeFile(input, JSON.stringify(membership));
  return { root, input, membership, bundle: resolve(root, 'bundle') };
}

test('opaque invalid bytes, empty log, declarations and distinct paths survive detached restoration', async () => {
  const f = await fixture();
  const receipt = await packEvidence(f.root, f.input, f.bundle);
  assert.equal(receipt.paths, 3);
  assert.equal(receipt.objects, 2);
  assert.equal(receipt.declarationDifferences.length, 1);
  const restored = resolve(f.root, 'detached');
  await restoreEvidence(f.bundle, receipt.index.sha256, restored);
  for (const path of f.membership.paths)
    assert.deepEqual(
      await readFile(resolve(restored, path)),
      await readFile(resolve(f.root, path)),
    );
  assert.deepEqual(await readFile(resolve(f.bundle, 'membership.json')), await readFile(f.input));
  await assert.rejects(restoreEvidence(f.bundle, receipt.index.sha256, restored), /EEXIST/);
});

test('rejects damaged objects and wrong fixed index identity before writing a destination', async () => {
  const f = await fixture();
  const receipt = await packEvidence(f.root, f.input, f.bundle);
  await assert.rejects(verifyBundle(f.bundle, '0'.repeat(64)), /index sha256/);
  const index = JSON.parse(await readFile(resolve(f.bundle, 'index.json')));
  await writeFile(resolve(f.bundle, 'objects', `${index.objects[0].sha256}.gz`), 'damaged');
  await assert.rejects(
    restoreEvidence(f.bundle, receipt.index.sha256, resolve(f.root, 'missing')),
    /mismatch/,
  );
  await assert.rejects(
    readFile(resolve(f.root, 'missing/.test-results/run/broken.json')),
    /ENOENT/,
  );
});

test('rejects traversal, environment paths, symlinks and unknown membership schema', async () => {
  for (const path of [
    '.test-results/../a',
    '.test-results/.env',
    '.test-results/run/.env.local',
    '.test-results//a',
    '/tmp/a',
    '.test-results/a\\b',
  ])
    assert.throws(() => evidencePath(path), /unsafe/);
  const f = await fixture();
  f.membership.unknown = true;
  await writeFile(f.input, JSON.stringify(f.membership));
  await assert.rejects(packEvidence(f.root, f.input, f.bundle), /fields/);
  delete f.membership.unknown;
  f.membership.paths.push('.test-results/run/link.json');
  await symlink('broken.json', resolve(f.root, '.test-results/run/link.json'));
  await writeFile(f.input, JSON.stringify(f.membership));
  await assert.rejects(packEvidence(f.root, f.input, f.bundle), /non-regular/);
});

test('rejects missing objects and incomplete coverage even with a matching metadata hash', async () => {
  const f = await fixture();
  await packEvidence(f.root, f.input, f.bundle);
  const indexPath = resolve(f.bundle, 'index.json');
  const index = JSON.parse(await readFile(indexPath));
  index.entries.pop();
  const changed = JSON.stringify(index);
  await writeFile(indexPath, changed);
  await assert.rejects(verifyBundle(f.bundle, digest(changed)), /coverage/);
  index.entries.push({ path: '.test-results/run/empty.log', bytes: 0, sha256: '1'.repeat(64) });
  const missing = JSON.stringify(index);
  await writeFile(indexPath, missing);
  await assert.rejects(verifyBundle(f.bundle, digest(missing)), /missing object/);
});

test('extends an immutable archive without requiring the old source directory', async () => {
  const f = await fixture();
  const prior = await packEvidence(f.root, f.input, f.bundle);
  const additionalRoot = await mkdtemp(resolve(tmpdir(), 'fgo-evidence-extension-'));
  await mkdir(resolve(additionalRoot, '.test-results/new'), { recursive: true });
  const extra = '.test-results/new/raw.log';
  await writeFile(resolve(additionalRoot, extra), 'new original bytes');
  f.membership.paths.push(extra);
  const input = resolve(additionalRoot, 'input.json');
  await writeFile(input, JSON.stringify(f.membership));
  const extended = resolve(additionalRoot, 'bundle');
  const receipt = await packEvidence(additionalRoot, input, extended, {
    bundle: f.bundle,
    sha256: prior.index.sha256,
  });
  assert.equal(receipt.paths, 4);
  assert.equal(receipt.objects, 3);
  await verifyBundle(extended, receipt.index.sha256);
  f.membership.paths.shift();
  f.membership.seedPaths = [];
  await writeFile(input, JSON.stringify(f.membership));
  await assert.rejects(
    packEvidence(additionalRoot, input, resolve(additionalRoot, 'incomplete'), {
      bundle: f.bundle,
      sha256: prior.index.sha256,
    }),
    /drops/,
  );
});

test('child summaries and copied shard declarations retain their consumer base', () => {
  const seen = [];
  collectOwnedReferences(
    '.test-results/quality/manifest.json',
    {
      children: { unit: { manifest: 'unit/manifest.json', artifacts: [{ path: 'raw.log' }] } },
      shards: [{ productionArtifacts: { conditionRecords: [{ path: 'condition.json' }] } }],
      verified: [{ path: '../normal/manifest.json' }],
    },
    (owner, pointer, base, declaration) => seen.push({ pointer, base, path: declaration.path }),
  );
  assert.deepEqual(seen, [
    {
      pointer: 'children.unit.manifest',
      base: '.test-results/quality',
      path: 'unit/manifest.json',
    },
    { pointer: 'children.unit.artifacts.0', base: '.test-results/quality/unit', path: 'raw.log' },
    { pointer: 'verified.0', base: '.test-results/quality', path: '../normal/manifest.json' },
    {
      pointer: 'shards.0.productionArtifacts.conditionRecords.0',
      base: '.test-results/quality',
      path: 'condition.json',
    },
  ]);
  assert.throws(
    () => collectOwnedReferences('.test-results/run/manifest.json', { artifacts: 42 }, () => {}),
    /invalid receipt collection/,
  );
});
