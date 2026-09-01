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

test('transferred and compound E2E assertions close against exact tests or retained markers', () => {
  const caseIds = new Set(catalog.map(({ id }) => id));
  assert.equal(new Set(assertions.map(({ id }) => id)).size, assertions.length);
  for (const item of assertions) {
    assert.ok(caseIds.has(item.caseId), item.id);
    assert.ok(typeof item.oldAssertion === 'string' && item.oldAssertion.length > 0, item.id);
    assert.ok(typeof item.outcome === 'string' && item.outcome.length > 0, item.id);
    assert.ok(typeof item.replacementFile === 'string', item.id);
    assert.ok(typeof item.replacementTest === 'string', item.id);
    const replacement = readFileSync(resolve(root, item.replacementFile), 'utf8');
    assert.ok(replacement.includes(item.replacementTest), `${item.id}:${item.replacementTest}`);
    if (item.disposition === 'retained') {
      assert.ok(typeof item.marker === 'string' && item.marker.length > 0, item.id);
      assert.ok(specSource.includes(item.marker), `${item.id}:${item.marker}`);
      continue;
    }
    assert.equal(item.disposition, 'transferred', item.id);
  }

  for (const item of catalog.filter(({ status }) => status !== 'retained'))
    assert.ok(
      assertions.some(({ caseId }) => caseId === item.id),
      `${item.id}:assertion closure`,
    );

  const compoundGuardrail = [
    'E2E-A025-ONLINE',
    'E2E-A025-OFFLINE',
    'E2E-A026-PROFILE',
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
