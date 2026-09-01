import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(resolve(root, 'e2e/cases.json'), 'utf8'));
const assertions = JSON.parse(readFileSync(resolve(root, 'e2e/assertions.json'), 'utf8'));
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
    assert.ok(Array.isArray(item.assertionIds), `${item.id}:assertionIds`);
    assert.equal(
      new Set(item.assertionIds).size,
      item.assertionIds.length,
      `${item.id}:assertionIds`,
    );
    for (const assertionId of item.assertionIds)
      assert.match(assertionId, /^E2E-A\d{3}(?:-[A-Z0-9]+)+$/, `${item.id}:${assertionId}`);
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

test('case assertion IDs and assertion records are a bidirectional complete match', () => {
  const caseIds = new Set(catalog.map(({ id }) => id));
  assert.equal(new Set(assertions.map(({ id }) => id)).size, assertions.length);
  const catalogAssertionIds = catalog.flatMap(({ assertionIds }) => assertionIds);
  assert.equal(new Set(catalogAssertionIds).size, catalogAssertionIds.length);
  assert.deepEqual([...catalogAssertionIds].sort(), assertions.map(({ id }) => id).sort());
  for (const item of assertions) {
    assert.ok(caseIds.has(item.caseId), item.id);
    const owner = catalog.find(({ id }) => id === item.caseId);
    assert.ok(owner.assertionIds.includes(item.id), `${item.id}:${item.caseId}`);
    assert.ok(typeof item.oldAssertion === 'string' && item.oldAssertion.length > 0, item.id);
    assert.ok(typeof item.outcome === 'string' && item.outcome.length > 0, item.id);
    assert.ok(typeof item.replacementFile === 'string', item.id);
    assert.ok(typeof item.replacementTest === 'string', item.id);
    const replacement = readFileSync(resolve(root, item.replacementFile), 'utf8');
    if (item.disposition === 'retained') {
      assert.ok(replacement.includes(item.replacementTest), `${item.id}:${item.replacementTest}`);
      assert.ok(typeof item.marker === 'string' && item.marker.length > 0, item.id);
      assert.ok(specSource.includes(item.marker), `${item.id}:${item.marker}`);
      continue;
    }
    assert.equal(item.disposition, 'transferred', item.id);
    assert.ok(
      replacement.includes(`'${item.replacementTest}'`) ||
        replacement.includes(`"${item.replacementTest}"`),
      `${item.id}:${item.replacementTest}`,
    );
  }

  for (const item of catalog.filter(({ status }) => status !== 'retained'))
    assert.ok(item.assertionIds.length > 0, `${item.id}:assertion closure`);

  const compoundGuardrail = [
    'E2E-A025-ONLINE',
    'E2E-A025-OFFLINE',
    'E2E-A026-PROFILE',
    'E2E-A030-DIRECT-CONTROLS',
    'E2E-A030-MODE-SEPARATION',
    'E2E-A030-TRAIT-DECISION',
    'E2E-A030-SELECTION',
    'E2E-A031-REQUIRED',
    'E2E-A031-FAIL-CLOSED',
    'E2E-A032-DANTE-INVENTORY',
    'E2E-A032-SUMMER-WU-INVENTORY',
    'E2E-A032-ORDER',
    'E2E-A033-HP',
    'E2E-A036-VARIANT',
    'E2E-A036-COMMAND',
    'E2E-A036-TRANSACTION',
    'E2E-A037-SAME-CARD',
    'E2E-A037-SEMANTIC-RESULT',
    'E2E-A038-EXCLUSIVE',
    'E2E-A038-TRANSACTION',
    'E2E-A039-ACTOR-COUNT',
    'E2E-A039-TYPED-INPUT',
    'E2E-A040-ENEMY-COUNT',
    'E2E-A040-COMMAND',
    'E2E-A040-SEMANTIC-RESULT',
    'E2E-A041-SIMPLE',
    'E2E-A041-CHAINED',
    'E2E-A041-INDEPENDENT',
    'E2E-A041-OC',
    'E2E-A041-ACCESSIBLE-SINGLE',
    'E2E-A041-ACCESSIBLE-CHAINED',
    'E2E-A043-OR',
    'E2E-A043-RESPONSIVE',
    'E2E-A048-SERVANT',
    'E2E-A048-CE',
    'E2E-A048-SUPPORT',
    'E2E-A049-HISTORY',
    'E2E-A049-DOWNLOAD',
    'E2E-A049-PREVIEW',
    'E2E-A049-PREIMPORT',
    'E2E-A049-REPLACE',
    'E2E-A050-SUMMARY',
    'E2E-A050-DETAIL',
    'E2E-A050-HANDOFF',
    'E2E-A050-NOTICE',
    'E2E-A050-RESET',
  ];
  assert.deepEqual(
    assertions
      .filter(({ id }) => compoundGuardrail.includes(id))
      .map(({ id }) => id)
      .sort(),
    compoundGuardrail.sort(),
  );
});
