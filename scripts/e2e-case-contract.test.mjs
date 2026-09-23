import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(resolve(root, 'e2e/cases.json'), 'utf8'));
const assertions = JSON.parse(readFileSync(resolve(root, 'e2e/assertions.json'), 'utf8'));
const migrationManifestDigest = '5c040ecb460b73f5a5bed5a86dc0036ff875357c3c4742973bb989a822b61487';
const specSource = readdirSync(resolve(root, 'e2e'))
  .filter((name) => name.endsWith('.spec.ts') || name.endsWith('.setup.ts'))
  .map((name) => readFileSync(resolve(root, 'e2e', name), 'utf8'))
  .join('\n');

test('E2E catalog closes every legacy case and every retained case has executable metadata', () => {
  assert.equal(catalog.filter(({ id }) => /^E2E-\d{3}$/.test(id)).length, 54);
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

function isTestDeclaration(node) {
  if (!ts.isCallExpression(node) || node.arguments.length < 2) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'it' || callee.text === 'test';
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    (callee.expression.text === 'it' || callee.expression.text === 'test')
  )
    return ['only', 'skip', 'todo', 'fails', 'concurrent'].includes(callee.name.text);
  return (
    ts.isCallExpression(callee) &&
    ts.isPropertyAccessExpression(callee.expression) &&
    callee.expression.name.text === 'each' &&
    ts.isIdentifier(callee.expression.expression) &&
    (callee.expression.expression.text === 'it' || callee.expression.expression.text === 'test')
  );
}

const parsedReplacementFiles = new Map();

function replacementTestNode(path, source, title, assertionId) {
  let parsed = parsedReplacementFiles.get(path);
  if (!parsed) {
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const declarations = [];
    const visit = (node) => {
      if (isTestDeclaration(node)) {
        const titleNode = node.arguments[0];
        if (ts.isStringLiteralLike(titleNode)) declarations.push({ node, title: titleNode.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    parsed = { declarations, sourceFile };
    parsedReplacementFiles.set(path, parsed);
  }
  const matches = parsed.declarations.filter((declaration) => declaration.title === title);
  assert.equal(matches.length, 1, `${assertionId}:test node:${title}`);
  return { node: matches[0].node, sourceFile: parsed.sourceFile };
}

function containsExactAssertionMarker(source, assertionId) {
  const escaped = assertionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Z0-9-])${escaped}(?:$|[^A-Z0-9-])`).test(source);
}

function assertMigrationManifest(manifest, expectedDigest = migrationManifestDigest) {
  assert.equal(digestManifest(manifest), expectedDigest, 'migration manifest digest');
  assert.equal(manifest.length, 69, 'migration manifest observation count');
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
    const replacementNode = replacementTestNode(
      item.replacementFile,
      replacement,
      item.replacementTest,
      item.id,
    );
    assert.ok(
      containsExactAssertionMarker(
        replacementNode.node.getText(replacementNode.sourceFile),
        item.id,
      ),
      `${item.id}:exact marker`,
    );
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
    /E2E-A031-FAIL-CLOSED:exact marker/,
  );
});

test('migration manifest rejects reassignment across a multiline it.each boundary', () => {
  const reassigned = assertions.map((item) =>
    item.id === 'E2E-A041-ACCESSIBLE-CHAINED'
      ? { ...item, replacementTest: 'distinguishes a single proc success and failure' }
      : item,
  );
  assert.throws(
    () => assertMigrationManifest(reassigned, digestManifest(reassigned)),
    /E2E-A041-ACCESSIBLE-CHAINED:exact marker/,
  );
});
