// Check restored reference ownership without calling matrix/audit generators.
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { evidencePath, readPreservationIndex } from './evidence-preservation.mjs';
import { pathToFileURL } from 'node:url';

export function collectOwnedReferences(owner, value, reference) {
  const base = dirname(evidencePath(owner));
  function receipts(array, pointer, context = base) {
    if (array === undefined) return;
    if (!Array.isArray(array)) throw new Error(`invalid receipt collection: ${owner}:${pointer}`);
    for (const [i, declaration] of array.entries())
      reference(owner, `${pointer}.${i}`, context, declaration);
  }
  receipts(value.artifacts, 'artifacts');
  receipts(value.ownReceipts, 'ownReceipts');
  receipts(value.productionArtifacts?.conditionRecords, 'productionArtifacts.conditionRecords');
  for (const key of [
    'shardInputs',
    'conditionInputs',
    'rawConditionInputs',
    'artifactVerification',
  ])
    receipts(value[key]?.verified, `${key}.verified`);
  // Parent summaries use each child's manifest directory, not the parent's directory.
  for (const [suite, child] of Object.entries(value.children ?? {})) {
    reference(owner, `children.${suite}.manifest`, base, { path: child.manifest });
    receipts(child.artifacts, `children.${suite}.artifacts`, dirname(join(base, child.manifest)));
  }
  for (const key of [
    'artifactReceipts',
    'manifestReceipts',
    'independentHpDiskReceipts',
    'verified',
  ])
    receipts(value[key], key);
  // Embedded/copied shard declarations use the merge input directory.
  // No basename/hash search or relocation fallback is allowed.
  if (Array.isArray(value.shards))
    for (const [i, shard] of value.shards.entries())
      receipts(
        shard?.productionArtifacts?.conditionRecords,
        `shards.${i}.productionArtifacts.conditionRecords`,
        base,
      );
}

export async function checkRestoredReferences(bundle, indexSha, root, expectedSourcePath) {
  const index = await readPreservationIndex(bundle, indexSha);
  const entries = new Map(index.entries.map((entry) => [entry.path, entry]));
  const membership = JSON.parse(await readFile(resolve(bundle, 'membership.json'), 'utf8'));
  const knownInvalidJson = new Set(membership.invalidJsonInputs.map((entry) => entry.path));
  const edges = [],
    differences = [],
    malformed = [],
    unresolved = [];
  function reference(owner, pointer, base, declaration) {
    if (!declaration || typeof declaration.path !== 'string') {
      malformed.push({ owner, pointer, reason: 'invalid_declaration' });
      return;
    }
    const target = evidencePath(
      declaration.path.startsWith('.test-results/')
        ? declaration.path
        : join(base, declaration.path),
    );
    const observed = entries.get(target);
    if (!observed) {
      unresolved.push({ owner, pointer, base, target });
      return;
    }
    edges.push({ owner, pointer, base, target });
    if (
      declaration.bytes !== undefined &&
      (observed.bytes !== declaration.bytes || observed.sha256 !== declaration.sha256)
    )
      differences.push({ owner, pointer, target, declared: declaration, observed });
  }
  for (const entry of index.entries) {
    const owner = entry.path,
      name = owner.split('/').at(-1);
    // Condition bodies are opaque and do not generate reference membership.
    if (!name.endsWith('.json') || !/manifest|reconciliation|probe-results/.test(name)) continue;
    let value;
    try {
      value = JSON.parse(await readFile(resolve(root, evidencePath(owner)), 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError && knownInvalidJson.has(owner)) {
        malformed.push({ owner, reason: 'preserved_invalid_json' });
        continue;
      }
      throw error;
    }
    collectOwnedReferences(owner, value, reference);
  }
  const expectedSource = JSON.parse(await readFile(expectedSourcePath, 'utf8'));
  const expected = expectedSource.productionMatrix.canonicalRecords;
  const expectedEntry = entries.get(evidencePath(expected.manifest));
  if (
    !expectedEntry ||
    expectedEntry.bytes !== expected.bytes ||
    expectedEntry.sha256 !== expected.sha256
  )
    throw new Error('fixed expected identity mismatch');
  const manifest = JSON.parse(await readFile(resolve(root, expected.manifest), 'utf8'));
  const conditions = manifest.productionArtifacts.conditionRecords;
  if (conditions.length !== 80 || new Set(conditions.map((c) => c.path)).size !== 80)
    throw new Error('expected condition coverage');
  for (const condition of conditions)
    reference(expected.manifest, 'fixed-expected-condition', dirname(expected.manifest), condition);
  // A different SHA is intentional in one immutable probe declaration. All other differences are blockers.
  const badTargets = new Set(differences.map((d) => d.target));
  if (
    badTargets.size !== 1 ||
    !badTargets.has(
      '.test-results/tsk-08-gate-closure-20261001/actual-receipt-mismatch/naturalLimit-included-baseline-np5-oc1.json',
    ) ||
    differences.some((d) => d.declared.sha256 !== '0'.repeat(64))
  )
    throw new Error('unexpected declaration difference');
  const invalidDeclaration =
    '.test-results/tsk-08-gate-closure-20261001/declaration-null/manifest-shard-0.json';
  if (
    malformed.some(
      (m) =>
        m.reason !== 'preserved_invalid_json' &&
        m.owner !== invalidDeclaration &&
        !(
          m.owner === dirname(invalidDeclaration) + '/manifest.json' &&
          m.pointer === 'shards.0.productionArtifacts.conditionRecords.0'
        ),
    )
  )
    throw new Error('unexpected malformed reference');
  for (const entry of index.entries)
    if ((await stat(resolve(root, entry.path))).size !== entry.bytes)
      throw new Error(`restored size: ${entry.path}`);
  return {
    status: unresolved.length ? 'failed' : 'passed',
    paths: index.entries.length,
    referenceCount: edges.length,
    expectedConditions: conditions.length,
    unresolved,
    malformed,
    preservedDeclarationDifferences: differences,
    edges,
    qualification:
      'Full bytes/SHA verified by restoration receipt. References use original consumer bases; no matrix CLI or damage recomputation.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4)
      throw new Error(
        'usage: evidence-preservation-references.mjs <bundle> <index-sha256> <restored-root> <tracked-tsk-06-5-source.json>',
      );
    const result = await checkRestoredReferences(...args);
    console.log(JSON.stringify(result));
    if (result.status !== 'passed') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
