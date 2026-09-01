import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { describeAttachment } from './playwright-observation-reporter.mjs';
import { verifyArtifactFiles } from './test-observation-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const snapshotPath = resolve(
  root,
  'e2e/calculator-baseline.spec.ts-snapshots/calculator-desktop-chromium-linux.png',
);
const expectedAttachment = {
  name: 'calculator-desktop-expected.png',
  contentType: 'image/png',
  path: snapshotPath,
};

function options(artifactRoot) {
  return { artifactRoot, repositoryRoot: root, testId: 'fixture-id', retry: 0, index: 0 };
}

test('repository snapshots are copied into a self-contained reporter artifact', () => {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), 'fgo-reporter-snapshot-'));
  const described = describeAttachment(expectedAttachment, options(artifactRoot));
  assert.equal(described.sourceKind, 'repository_snapshot');
  assert.equal(
    described.sourcePath,
    'e2e/calculator-baseline.spec.ts-snapshots/calculator-desktop-chromium-linux.png',
  );
  assert.match(described.path, /^playwright-artifacts\/reporter-attachments\//);
  assert.ok(existsSync(resolve(artifactRoot, described.path)));
  assert.deepEqual(
    verifyArtifactFiles(artifactRoot, [
      {
        path: described.path,
        format: 'binary',
        allowEmpty: false,
        expectedBytes: described.bytes,
        expectedSha256: described.sha256,
      },
    ]).errors,
    [],
  );
});

test('external attachment ingestion rejects arbitrary, non-snapshot, and missing sources', () => {
  const artifactRoot = mkdtempSync(resolve(tmpdir(), 'fgo-reporter-reject-'));
  const arbitrary = resolve(mkdtempSync(resolve(tmpdir(), 'fgo-arbitrary-')), 'artifact.txt');
  writeFileSync(arbitrary, 'arbitrary');
  assert.throws(
    () =>
      describeAttachment(
        { name: 'arbitrary', contentType: 'text/plain', path: arbitrary },
        options(artifactRoot),
      ),
    /attachment_external_kind/,
  );
  assert.throws(
    () =>
      describeAttachment(
        {
          name: 'package-expected.png',
          contentType: 'image/png',
          path: resolve(root, 'package.json'),
        },
        options(artifactRoot),
      ),
    /attachment_snapshot_outside_canonical_root/,
  );
  assert.throws(
    () =>
      describeAttachment(
        {
          name: 'missing-expected.png',
          contentType: 'image/png',
          path: resolve(root, 'e2e/missing.spec.ts-snapshots/missing.png'),
        },
        options(artifactRoot),
      ),
    /attachment_snapshot_missing/,
  );
});

test('snapshot copying fails closed on copy failure, collision, and copied-file mutation', () => {
  const blockedRoot = resolve(mkdtempSync(resolve(tmpdir(), 'fgo-reporter-copy-failure-')), 'file');
  writeFileSync(blockedRoot, 'not a directory');
  assert.throws(() => describeAttachment(expectedAttachment, options(blockedRoot)));

  const artifactRoot = mkdtempSync(resolve(tmpdir(), 'fgo-reporter-collision-'));
  const described = describeAttachment(expectedAttachment, options(artifactRoot));
  assert.throws(
    () => describeAttachment(expectedAttachment, options(artifactRoot)),
    /attachment_copy_collision/,
  );
  writeFileSync(resolve(artifactRoot, described.path), 'changed after reporter copy');
  assert.match(
    verifyArtifactFiles(artifactRoot, [
      {
        path: described.path,
        format: 'binary',
        allowEmpty: false,
        expectedBytes: described.bytes,
        expectedSha256: described.sha256,
      },
    ]).errors.join('\n'),
    /bytes|sha256/,
  );
});
