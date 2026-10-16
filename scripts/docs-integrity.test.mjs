import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRepository, validateRepository, analyzeMarkdown } from './docs-integrity-lib.mjs';
import { verifyArtifactFiles } from './test-observation-lib.mjs';

const script = fileURLToPath(new URL('./docs-integrity.mjs', import.meta.url));
const read = (root, path) => readFileSync(resolve(root, path), 'utf8');
function put(root, path, text, tracked = true) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), text);
  if (tracked) execFileSync('git', ['add', '--', path], { cwd: root });
}
function repository(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'fgo-public-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  const guides = ['usage', 'calculation', 'architecture', 'development', 'testing'];
  const files = {
    '.gitignore': '.test-results/\n',
    'README.md': '# Project\n\n[docs](docs/README.md)\n',
    'docs/README.md':
      '# Documentation\n\n[project](../README.md)\n' +
      guides.map((name) => `\n[${name}](${name}.md)`).join('') +
      '\n[data](licenses/data-sources.md)\n',
    'docs/licenses/data-sources.md': '# Data sources\n',
    ...Object.fromEntries(guides.map((name) => [`docs/${name}.md`, `# ${name}\n`])),
  };
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  return root;
}
const assertError = (root, pattern) => {
  assert.ok(
    validateRepository(root).some((error) => pattern.test(error)),
    String(pattern),
  );
};

test('public clone validates without a task ledger, approval metadata or local files', (t) => {
  const result = inspectRepository(repository(t));
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.markdown, 8);
  assert.equal(result.counts.registered, 8);
});
test('references, images, HTML anchors and encoded paths resolve to tracked public files', (t) => {
  const root = repository(t);
  put(root, 'docs/space name.md', '# Same\n\n# Same\n\n<a id="explicit"></a>\n');
  put(root, 'docs/picture.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  put(
    root,
    'docs/usage.md',
    '# usage\n\n[one](space%20name.md#same-1)\n[html](space%20name.md#explicit)\n![image](picture.svg)\n<img src="picture.svg">\n[reference][target]\n\n[target]: space%20name.md#same\n',
  );
  assert.deepEqual(validateRepository(root), []);
});
test('heading punctuation, repeated headings and reference definitions are parsed consistently', () => {
  const result = analyzeMarkdown(
    '# A & B\n\n# A & B\n\n[link][ref]\n\n[ref]: target.md\n',
    'fixture.md',
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual([...result.anchors], ['a--b', 'a--b-1']);
  assert.ok(result.references.some((reference) => reference.url === 'target.md'));
});
test('missing linked guides fail without manufacturing a replacement', (t) => {
  const root = repository(t);
  unlinkSync(resolve(root, 'docs/calculation.md'));
  assertError(root, /untracked target docs\/calculation.md/);
});
test('an unlinked guide can be deleted without editing the document registry', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/README.md',
    read(root, 'docs/README.md').replace('\n[calculation](calculation.md)', ''),
  );
  unlinkSync(resolve(root, 'docs/calculation.md'));
  assert.deepEqual(validateRepository(root), []);
});
test('broken targets and missing anchors fail', (t) => {
  const root = repository(t);
  put(root, 'docs/usage.md', '# usage\n\n[missing](missing.md)\n[anchor](testing.md#absent)\n');
  assertError(root, /untracked target docs\/missing.md/);
  assertError(root, /missing anchor docs\/testing.md#absent/);
});
test('untracked files cannot satisfy references; unrelated public Markdown must be reachable', (t) => {
  const root = repository(t);
  put(root, 'docs/untracked.md', '# Untracked\n', false);
  put(root, 'docs/orphan.md', '# Orphan\n');
  put(root, 'docs/usage.md', '# usage\n\n[untracked](untracked.md)\n');
  assertError(root, /untracked target docs\/untracked.md/);
  assertError(root, /docs\/orphan.md: unregistered/);
});
for (const [url, reason] of [
  ['../../outside.md', /reference escapes repository/],
  ['testing.md?query=1', /local query reference/],
  ['file:///tmp/input.md', /unsupported reference scheme/],
  ['%ZZ.md', /URI malformed/],
  ['%2Fabsolute.md', /invalid local path/],
  ['../.env.private.md', /protected environment path/],
  ['../.local-docs/notes.md', /reference to internal material/],
])
  test(`rejects unsafe or non-public reference ${url}`, (t) => {
    const root = repository(t);
    put(root, 'docs/usage.md', `# usage\n\n[link](${url})\n`);
    assertError(root, reason);
  });
test('malformed links, unresolved definitions and unsupported HTML references fail', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/usage.md',
    '# usage\n\n[broken](\n![image][absent]\n<img srcset="a.svg 1x, b.svg 2x">\n',
  );
  const errors = validateRepository(root).join('\n');
  assert.match(errors, /malformed|unresolved/);
  assert.match(errors, /unsupported HTML reference attribute/);
});
test('duplicate definitions, duplicate HTML anchors and script elements fail', () => {
  const result = analyzeMarkdown(
    '[a]: a.md\n[a]: b.md\n\n<a id="x"></a><a id="x"></a>\n\n<script src="a.js"></script>\n',
    'fixture.md',
  );
  assert.ok(result.errors.some((error) => /duplicate reference/.test(error)));
  assert.ok(result.errors.some((error) => /duplicate or empty HTML anchor/.test(error)));
  assert.ok(result.errors.some((error) => /unsupported HTML element/.test(error)));
});
test('private planning and machine-local settings are rejected before reading', (t) => {
  const root = repository(t);
  put(root, 'docs/tasks/private.md', '# Working plan\n');
  put(root, '.codex/config.toml', '# local settings\n');
  const errors = validateRepository(root);
  assert.ok(
    errors.some((error) => /docs\/tasks\/private.md: internal material.*not read/.test(error)),
  );
  assert.ok(
    errors.some((error) => /\.codex\/config.toml: internal material.*not read/.test(error)),
  );
});
test('work identifiers and personal filesystem paths cannot leak through a public guide', (t) => {
  const root = repository(t);
  put(root, 'docs/usage.md', '# usage\n\nTSK-123\n/home/example/project\n');
  assertError(root, /internal task identifier/);
  assertError(root, /personal filesystem path/);
});
test('Markdown symlinks fail', (t) => {
  const root = repository(t);
  unlinkSync(resolve(root, 'docs/usage.md'));
  symlinkSync('testing.md', resolve(root, 'docs/usage.md'));
  execFileSync('git', ['add', '--', 'docs/usage.md'], { cwd: root });
  assertError(root, /expected tracked regular Markdown file/);
});
function cli(root, name, options = {}) {
  const parent = process.env.FGO_DOCS_TEST_EVIDENCE_DIR
    ? resolve(process.env.FGO_DOCS_TEST_EVIDENCE_DIR, name)
    : resolve(root, '.test-results', name);
  const result = spawnSync(process.execPath, [script, `--root=${root}`], {
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, FGO_QUALITY_RUN_DIR: parent, ...options },
  });
  const directory = resolve(parent, 'docs');
  if (process.env.FGO_DOCS_TEST_EVIDENCE_DIR) {
    mkdirSync(parent, { recursive: true });
    writeFileSync(
      resolve(parent, 'process.json'),
      JSON.stringify(
        {
          status: result.status,
          signal: result.signal,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error?.message ?? null,
        },
        null,
        2,
      ) + '\n',
    );
  }
  return { ...result, directory };
}
function assertSaved(result, status) {
  assert.equal(result.status, status, result.stderr);
  assert.ok(Buffer.byteLength(result.stdout + result.stderr) <= 32768);
  assert.ok((result.stdout + result.stderr).trim().split('\n').length <= 10);
  const manifest = JSON.parse(readFileSync(resolve(result.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.exit.code, status);
  assert.deepEqual(
    verifyArtifactFiles(
      result.directory,
      manifest.artifacts.map((receipt) => ({
        ...receipt,
        expectedBytes: receipt.bytes,
        expectedSha256: receipt.sha256,
      })),
    ).errors,
    [],
  );
  return {
    manifest,
    diagnostics: JSON.parse(readFileSync(resolve(result.directory, 'diagnostics.json'), 'utf8')),
  };
}

test('real CLI saves verified complete artifacts and succeeds compactly', (t) => {
  const result = cli(repository(t), 'success');
  const { diagnostics, manifest } = assertSaved(result, 0);
  assert.deepEqual(diagnostics.errors, []);
  assert.equal(manifest.outcome, 'success');
});
test('real CLI rejects a broken reference with a complete path and reason', (t) => {
  const root = repository(t);
  put(root, 'docs/usage.md', '# usage\n\n[broken](missing.md)\n');
  const { diagnostics, manifest } = assertSaved(cli(root, 'failure'), 1);
  assert.equal(manifest.outcome, 'contract_failure');
  assert.ok(diagnostics.errors.some((error) => /docs\/usage.md:.*untracked target/.test(error)));
});
test('real CLI bounds large failures but keeps all 1024 errors and their full log', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/usage.md',
    '# usage\n' +
      Array.from({ length: 1024 }, (_, i) => `\n[broken ${i}](missing-${i}.md)`).join(''),
  );
  const result = cli(root, 'large');
  const { diagnostics, manifest } = assertSaved(result, 1);
  assert.equal(diagnostics.errors.length, 1024);
  assert.equal(manifest.output.truncated, true);
  assert.match(result.stderr, /1019 errors omitted/);
  assert.match(readFileSync(resolve(result.directory, 'stderr.log'), 'utf8'), /missing-1023.md/);
});
test('real CLI retains very long reasons while bounding terminal output', (t) => {
  const root = repository(t);
  const url = 'X'.repeat(40000) + '.md';
  put(root, 'docs/usage.md', `# usage\n\n[broken](${url})\n`);
  const result = cli(root, 'long');
  const { diagnostics, manifest } = assertSaved(result, 1);
  assert.equal(manifest.output.truncated, true);
  assert.ok(diagnostics.errors.some((error) => error.includes(url)));
  assert.ok(Buffer.byteLength(result.stderr) < 4096);
});
test('real CLI artifact-save failure is nonzero without changing its destination', (t) => {
  const root = repository(t);
  const parent = resolve(root, 'not-a-directory');
  writeFileSync(parent, 'block');
  const result = cli(root, 'save', { FGO_QUALITY_RUN_DIR: parent });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifact or CLI failure/);
  assert.match(result.stderr, /ENOTDIR|EEXIST/);
  assert.ok(!readdirSync(root).includes('.test-results'));
});
