// TSK-09.1 STEP 2 prototype. Original evidence is opaque bytes, never rewritten JSON.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { pathToFileURL } from 'node:url';

function keys(value, expected) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  )
    throw new Error('invalid metadata fields');
}

export function evidencePath(path) {
  if (
    typeof path !== 'string' ||
    !path.startsWith('.test-results/') ||
    path
      .split('/')
      .some(
        (part) =>
          !part || part === '.' || part === '..' || part === '.env' || part.startsWith('.env.'),
      ) ||
    /[\\\x00-\x1f]/.test(path)
  )
    throw new Error(`unsafe evidence path: ${path}`);
  return path;
}

function sha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('invalid sha256');
  return value;
}

async function regular(root, path) {
  let current = resolve(root);
  const rootStat = await lstat(current);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe root');
  const parts = path.split('/');
  for (const [i, part] of parts.entries()) {
    current = resolve(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()))
      throw new Error(`non-regular evidence path: ${path}`);
  }
  return current;
}

async function digestFile(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest('hex') };
}

function observe() {
  const hash = createHash('sha256');
  let bytes = 0;
  return {
    stream: new Transform({
      transform(chunk, encoding, done) {
        hash.update(chunk);
        bytes += chunk.length;
        done(null, chunk);
      },
    }),
    result: () => ({ bytes, sha256: hash.digest('hex') }),
  };
}

function equal(actual, expected, label) {
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256)
    throw new Error(`bytes/sha256 mismatch: ${label}`);
}

function validateMembership(membership) {
  keys(membership, [
    'seedPaths',
    'paths',
    'manifests',
    'declared',
    'missing',
    'conflicts',
    'sizeMismatches',
    'invalidJsonInputs',
    'qualification',
    'conflictingDeclarations',
  ]);
  if (
    !Array.isArray(membership.paths) ||
    !membership.paths.length ||
    new Set(membership.paths).size !== membership.paths.length ||
    membership.missing.length ||
    membership.sizeMismatches.length
  )
    throw new Error('incomplete membership');
  membership.paths.forEach(evidencePath);
  if (!membership.seedPaths.every((path) => membership.paths.includes(evidencePath(path))))
    throw new Error('seed coverage missing');
}

export async function packEvidence(root, membershipPath, bundle, parent) {
  const membershipBytes = await readFile(membershipPath);
  const membership = JSON.parse(membershipBytes);
  validateMembership(membership);
  const parentIndex = parent ? await readPreservationIndex(parent.bundle, parent.sha256) : null;
  const parentEntries = new Map(parentIndex?.entries.map((entry) => [entry.path, entry]) ?? []);
  const parentObjects = new Map(
    parentIndex?.objects.map((object) => [object.sha256, object]) ?? [],
  );
  if (parentIndex && parentIndex.entries.some((entry) => !membership.paths.includes(entry.path)))
    throw new Error('extension drops preserved input');
  await mkdir(bundle); // Refuse overwrite; an incomplete attempt is never a published index.
  await mkdir(resolve(bundle, 'objects'));
  await writeFile(resolve(bundle, 'membership.json'), membershipBytes, { flag: 'wx' });
  const entries = [],
    objects = new Map(),
    inodeCache = new Map(),
    declarationDifferences = [];
  for (const path of [...membership.paths].sort()) {
    const prior = parentEntries.get(path);
    if (prior) {
      if (!objects.has(prior.sha256)) {
        const object = parentObjects.get(prior.sha256);
        const source = await regular(parent.bundle, `objects/${prior.sha256}.gz`);
        const target = resolve(bundle, 'objects', `${prior.sha256}.gz`);
        await copyFile(source, target, 1); // Exclusive copy; the new bundle is self contained.
        equal(await digestFile(target), object.compressed, target);
        objects.set(prior.sha256, object);
      }
      const expected = membership.declared[path];
      if (expected && (prior.bytes !== expected.bytes || prior.sha256 !== expected.sha256))
        declarationDifferences.push({
          path,
          declared: expected,
          observed: { bytes: prior.bytes, sha256: prior.sha256 },
        });
      entries.push(prior);
      continue;
    }
    const original = await regular(root, path);
    const before = await lstat(original, { bigint: true });
    const inode = `${before.dev}:${before.ino}:${before.size}:${before.mtimeNs}:${before.ctimeNs}`;
    const observed = inodeCache.get(inode) ?? (await digestFile(original));
    inodeCache.set(inode, observed);
    const expected = membership.declared[path];
    if (expected && (expected.bytes !== observed.bytes || expected.sha256 !== observed.sha256))
      declarationDifferences.push({ path, declared: expected, observed });
    if (!objects.has(observed.sha256)) {
      const target = resolve(bundle, 'objects', `${observed.sha256}.gz`);
      const observation = observe();
      await pipeline(
        createReadStream(original),
        observation.stream,
        createGzip({ level: 6 }),
        createWriteStream(target, { flags: 'wx' }),
      );
      equal(observation.result(), observed, path);
      objects.set(observed.sha256, { ...observed, compressed: await digestFile(target) });
    }
    const after = await lstat(original, { bigint: true });
    if (
      ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some((field) => before[field] !== after[field])
    )
      throw new Error(`source changed during preservation: ${path}`);
    entries.push({ path, ...observed });
  }
  const index = {
    version: 1,
    membership: {
      bytes: membershipBytes.length,
      sha256: createHash('sha256').update(membershipBytes).digest('hex'),
    },
    entries,
    objects: [...objects.values()].sort((a, b) => a.sha256.localeCompare(b.sha256)),
    declarationDifferences,
  };
  await writeFile(resolve(bundle, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, {
    flag: 'wx',
  });
  return {
    index: await digestFile(resolve(bundle, 'index.json')),
    paths: entries.length,
    objects: objects.size,
    logicalBytes: entries.reduce((n, e) => n + e.bytes, 0),
    uniqueBytes: index.objects.reduce((n, e) => n + e.bytes, 0),
    compressedBytes: index.objects.reduce((n, e) => n + e.compressed.bytes, 0),
    declarationDifferences,
  };
}

export async function readPreservationIndex(bundle, expectedIndexSha) {
  const path = await regular(bundle, 'index.json');
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== sha(expectedIndexSha))
    throw new Error('index sha256 mismatch');
  const index = JSON.parse(bytes);
  keys(index, ['version', 'membership', 'entries', 'objects', 'declarationDifferences']);
  if (
    index.version !== 1 ||
    !Array.isArray(index.entries) ||
    !index.entries.length ||
    !Array.isArray(index.objects)
  )
    throw new Error('invalid index');
  const receipt = (r) => {
    if (!Number.isSafeInteger(r.bytes) || r.bytes < 0) throw new Error('invalid bytes');
    sha(r.sha256);
  };
  keys(index.membership, ['bytes', 'sha256']);
  receipt(index.membership);
  const membershipPath = await regular(bundle, 'membership.json');
  equal(await digestFile(membershipPath), index.membership, 'membership');
  const membership = JSON.parse(await readFile(membershipPath, 'utf8'));
  validateMembership(membership);
  const paths = new Set(),
    objects = new Map();
  for (const entry of index.entries) {
    keys(entry, ['path', 'bytes', 'sha256']);
    receipt(entry);
    evidencePath(entry.path);
    if (paths.has(entry.path)) throw new Error('duplicate path');
    paths.add(entry.path);
  }
  for (const object of index.objects) {
    keys(object, ['bytes', 'sha256', 'compressed']);
    receipt(object);
    keys(object.compressed, ['bytes', 'sha256']);
    receipt(object.compressed);
    if (objects.has(object.sha256)) throw new Error('duplicate object');
    objects.set(object.sha256, object);
  }
  if (paths.size !== membership.paths.length || !membership.paths.every((p) => paths.has(p)))
    throw new Error('coverage mismatch');
  for (const entry of index.entries) {
    const object = objects.get(entry.sha256);
    if (!object || object.bytes !== entry.bytes) throw new Error('missing object declaration');
  }
  if (new Set(index.entries.map((e) => e.sha256)).size !== objects.size)
    throw new Error('unexpected object');
  return index;
}

export async function verifyBundle(bundle, expectedIndexSha) {
  const index = await readPreservationIndex(bundle, expectedIndexSha);
  for (const object of index.objects) {
    const path = await regular(bundle, `objects/${object.sha256}.gz`);
    equal(await digestFile(path), object.compressed, path);
    const observation = observe();
    await pipeline(
      createReadStream(path),
      createGunzip(),
      observation.stream,
      new Transform({
        transform(chunk, encoding, done) {
          done();
        },
      }),
    );
    equal(observation.result(), object, path);
  }
  return { paths: index.entries.length, objects: index.objects.length };
}

export async function restoreEvidence(bundle, expectedIndexSha, destination) {
  // Verify every object before creating the new destination. Never repair in place.
  await verifyBundle(bundle, expectedIndexSha);
  const index = await readPreservationIndex(bundle, expectedIndexSha);
  await mkdir(destination); // Must be a new, dedicated checkout root; no existing input is overwritten.
  for (const entry of index.entries) {
    const target = resolve(destination, entry.path);
    await mkdir(dirname(target), { recursive: true });
    const observation = observe();
    await pipeline(
      createReadStream(resolve(bundle, 'objects', `${entry.sha256}.gz`)),
      createGunzip(),
      observation.stream,
      createWriteStream(target, { flags: 'wx' }),
    );
    equal(observation.result(), entry, entry.path);
  }
  return { paths: index.entries.length, status: 'restored', destination: resolve(destination) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let result;
    if (command === 'pack' && args.length === 3) result = await packEvidence(...args);
    else if (command === 'extend' && args.length === 5)
      result = await packEvidence(...args.slice(0, 3), { bundle: args[3], sha256: args[4] });
    else if (command === 'verify' && args.length === 2) result = await verifyBundle(...args);
    else if (command === 'restore' && args.length === 3) result = await restoreEvidence(...args);
    else
      throw new Error(
        'usage: evidence-preservation.mjs pack <source-root> <membership.json> <new-bundle> | extend <source-root> <membership.json> <new-bundle> <parent-bundle> <parent-index-sha256> | verify <bundle> <index-sha256> | restore <bundle> <index-sha256> <new-root>',
      );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
