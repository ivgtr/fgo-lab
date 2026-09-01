import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(resolve(root, 'e2e/cases.json'), 'utf8'));
const assertions = JSON.parse(readFileSync(resolve(root, 'e2e/assertions.json'), 'utf8'));
const migrationManifestDigest = '4b49fafa27f2a45cbf51ffa79dfdb03db23fd969257b99192934e8adc4612679';
const specSource = readdirSync(resolve(root, 'e2e'))
  .filter((name) => name.endsWith('.spec.ts') || name.endsWith('.setup.ts'))
  .map((name) => readFileSync(resolve(root, 'e2e', name), 'utf8'))
  .join('\n');

test('E2E catalog closes every legacy case and every retained case has executable metadata', () => {
  assert.equal(catalog.filter(({ id }) => /^E2E-\d{3}$/.test(id)).length, 50);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length);
  for (const item of catalog) {
    assert.match(item.id, /^E2E-(?:SETUP-)?\d{3}$/);
    assert.ok(['retained', 'transferred', 'merged'].includes(item.status), item.id);
    for (const field of ['title', 'owner', 'failure', 'project', 'replacement'])
      assert.ok(typeof item[field] === 'string' && item[field].length > 0, `${item.id}:${field}`);
    assert.ok(Number.isFinite(item.costMs) && item.costMs >= 0, `${item.id}:costMs`);
  }

  const retained = catalog.filter(({ status }) => status === 'retained');
  const sourceIds = new Set(specSource.match(/E2E-(?:SETUP-)?\d{3}/g) ?? []);
  assert.deepEqual([...sourceIds].sort(), retained.map(({ id }) => id).sort());
  for (const item of retained) {
    const escapedId = item.id.replaceAll('-', '\\-');
    const literalTitle = new RegExp(`\\[${escapedId}\\][^\\n]+@(journey|vrt|a11y)`);
    if (!literalTitle.test(specSource)) {
      const generatedIndex = specSource.indexOf(`id: '${item.id}'`);
      assert.notEqual(generatedIndex, -1, item.id);
      assert.match(
        specSource.slice(generatedIndex, generatedIndex + 1_000),
        /@(journey|vrt|a11y)/,
        item.id,
      );
    }
    assert.ok(['desktop', 'mobile', 'setup'].includes(item.project), item.id);
  }
});

function digestManifest(manifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function replacementTestBlock(source, title, assertionId) {
  const titleIndex = source.indexOf(title);
  assert.notEqual(titleIndex, -1, `${assertionId}:${title}`);
  const followingTest = source
    .slice(titleIndex + title.length)
    .search(/\n\s*(?:it|test)(?:\.each\([^\n]*\))?\s*\(/);
  return source.slice(
    titleIndex,
    followingTest === -1 ? undefined : titleIndex + title.length + followingTest,
  );
}

function assertMigrationManifest(manifest, expectedDigest = migrationManifestDigest) {
  assert.equal(digestManifest(manifest), expectedDigest, 'migration manifest digest');
  assert.equal(manifest.length, 61, 'migration manifest observation count');
  const caseIds = new Set(catalog.map(({ id }) => id));
  assert.equal(new Set(manifest.map(({ id }) => id)).size, manifest.length);
  const assertionsByCase = Map.groupBy(manifest, ({ caseId }) => caseId);
  for (const item of manifest) {
    assert.match(item.id, /^E2E-A\d{3}(?:-[A-Z0-9]+)+$/);
    assert.ok(caseIds.has(item.caseId), item.id);
    assert.ok(typeof item.oldAssertion === 'string' && item.oldAssertion.length > 0, item.id);
    assert.ok(typeof item.outcome === 'string' && item.outcome.length > 0, item.id);
    assert.ok(typeof item.replacementFile === 'string' && item.replacementFile.length > 0, item.id);
    assert.ok(typeof item.replacementTest === 'string' && item.replacementTest.length > 0, item.id);
    assert.equal('marker' in item, false, `${item.id}:parallel marker metadata`);
    const replacement = readFileSync(resolve(root, item.replacementFile), 'utf8');
    assert.ok(['retained', 'transferred'].includes(item.disposition), item.id);
    const testBlock = replacementTestBlock(replacement, item.replacementTest, item.id);
    assert.ok(testBlock.includes(item.id), `${item.id}:marker`);
  }

  for (const item of catalog.filter(({ status }) => status !== 'retained'))
    assert.ok(assertionsByCase.has(item.id), `${item.id}:assertion closure`);
}

test('canonical migration manifest ratchets every observation and replacement marker', () => {
  assertMigrationManifest(assertions);
});

test('migration manifest rejects a deleted observation even when no case list is edited', () => {
  assert.throws(() => assertMigrationManifest(assertions.slice(1)), /migration manifest digest/);
});

test('migration manifest rejects an assertion reassigned to the wrong existing test', () => {
  const reassigned = assertions.map((item) =>
    item.id === 'E2E-A031-FAIL-CLOSED'
      ? {
          ...item,
          replacementTest: 'keeps resolved effects out of manual final-input calculations',
        }
      : item,
  );
  assert.throws(
    () => assertMigrationManifest(reassigned, digestManifest(reassigned)),
    /E2E-A031-FAIL-CLOSED:marker/,
  );
});
