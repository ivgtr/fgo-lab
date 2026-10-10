import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { cleanTestResults, planTestResultsCleanup } from './test-results-cleanup-lib.mjs';

function runName(second, suffix) {
  return `2026-09-04T11-35-${String(second).padStart(2, '0')}-000Z-15-${suffix}`;
}

test('cleanup keeps the newest completed runs, running runs, and non-run evidence directories', (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'fgo-lab-results-cleanup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const old = runName(1, '000001');
  const recent = runName(2, '000002');
  const running = runName(3, '000003');
  for (const [name, outcome] of [
    [old, 'success'],
    [recent, 'test_failure'],
    [running, 'running'],
  ]) {
    mkdirSync(resolve(root, name));
    writeFileSync(resolve(root, name, 'manifest.json'), `${JSON.stringify({ outcome })}\n`);
  }
  mkdirSync(resolve(root, 'manual-diagnostic'));

  assert.deepEqual(planTestResultsCleanup(root, 1), {
    kept: [recent],
    removed: [old],
    protected: [running],
  });
  cleanTestResults(root, 1);
  assert.equal(existsSync(resolve(root, old)), false);
  assert.equal(existsSync(resolve(root, recent)), true);
  assert.equal(existsSync(resolve(root, running)), true);
  assert.equal(existsSync(resolve(root, 'manual-diagnostic')), true);
});

test('cleanup rejects an invalid retention count', () => {
  assert.throws(() => planTestResultsCleanup('/unused', 0), /positive integer/);
});
