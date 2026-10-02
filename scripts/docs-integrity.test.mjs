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
import {
  collectContractIds,
  parseFrontmatter,
  validateAdrIndex,
  validateRegistry,
  validateTaskPlan,
  inspectRepository,
  validateRepository,
  analyzeMarkdown,
} from './docs-integrity-lib.mjs';
import { verifyArtifactFiles } from './test-observation-lib.mjs';

test('frontmatter rejects duplicate fields', () => {
  const result = parseFrontmatter(
    '---\ndocument_version: "1.0.0"\nupdated_at: a\nupdated_at: b\n---',
  );
  assert.deepEqual(result.errors, ['document: duplicate frontmatter field updated_at']);
});

test('frontmatter parses quoted escapes, arrays and block scalars without changing their meaning', () => {
  const result = parseFrontmatter(
    '---\ntitle: "a\\nb"\nstatus_scope: |-\n  first\n  second\nrelated_documents:\n  - "a.md"\n---',
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.values.title, 'a\nb');
  assert.equal(result.values.status_scope, 'first\nsecond');
  assert.deepEqual(result.values.related_documents, ['a.md']);
});

test('registry rejects a stale document version', () => {
  const registry =
    '| Path | Kind | Scope |\n| --- | --- | --- |\n| [target](target.md) | requirement／Active v1.0.0 | scope |';
  const errors = validateRegistry(
    '/repo/docs/README.md',
    registry,
    () => '---\ndocument_version: "1.1.0"\nstatus: "Active"\n---',
  );
  assert.match(errors[0], /declares v1\.0\.0.*v1\.1\.0/);
});

test('ADR index rejects proposed status and status mismatch', () => {
  const index = [
    '| ID | Status | Scope |',
    '| --- | --- | --- |',
    '| [001](001.md) | proposed | pending |',
    '| [002](002.md) | accepted | mismatch |',
    '| [003](003.md) | accepted | invalid document |',
  ].join('\n');
  const documents = new Map([
    ['/repo/docs/adr/001.md', '---\nstatus: proposed\n---'],
    ['/repo/docs/adr/002.md', '---\nstatus: superseded\n---\n# ADR 002\n\n- Status: superseded'],
    ['/repo/docs/adr/003.md', '---\nstatus: proposed\n---\n# ADR 003\n\nStatus: proposed'],
  ]);
  const errors = validateAdrIndex(
    '/repo/docs/adr/README.md',
    index,
    (path) => documents.get(path),
    ['001.md', '002.md', '003.md', '004-unregistered.md'],
  );
  assert.ok(errors.some((error) => error.includes('ADR-001: invalid index status proposed')));
  assert.ok(
    errors.some((error) =>
      error.includes('ADR-002: index status accepted differs from document superseded'),
    ),
  );
  assert.ok(errors.some((error) => error.includes('ADR-003: invalid document status proposed')));
  assert.ok(errors.some((error) => error.includes('unregistered 004-unregistered.md')));
});

test('contract catalog rejects missing revision metadata', () => {
  const result = collectContractIds([
    [
      'requirement.md',
      '---\ndocument_version: "1.0.0"\n---\n## Contract catalog\n\n| `TS-ONE-001` | rule |',
    ],
  ]);
  assert.deepEqual(result.errors, ['requirement.md: missing Revision log']);
});

test('contract catalog requires the current version in the revision log', () => {
  const result = collectContractIds([
    [
      'requirement.md',
      '---\ndocument_version: "2.0.0"\n---\n## Contract catalog\n\n| `TS-ONE-001` | rule |\n## Revision log\n\n| 1.0.0 | old |',
    ],
  ]);
  assert.ok(result.errors.some((error) => error.includes('current v2.0.0 missing')));
});

test('Task plan rejects ready dependency and closure errors', () => {
  const tasks = `
| ID | Task | Status | Depends on | Primary source |
| --- | --- | --- | --- | --- |
| TSK-01 | parent | ready | - | source |
| TSK-02 | child | ready | TSK-01 | source |

### TSK-01: parent

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| \`TS-ONE-001\` | Apply | - | Handoff |

Handoff: 未記録

### TSK-02: child

Handoff: 未記録

## 4. rules
`;
  const errors = validateTaskPlan(tasks, new Set(['TS-ONE-001']));
  assert.ok(errors.some((error) => error.includes('requires done dependency TSK-01')));
  assert.ok(errors.some((error) => error.includes('Apply TS-ONE-001 requires command')));
  assert.ok(errors.some((error) => error.includes('TSK-02: missing Contract closure matrix')));
});

const script = fileURLToPath(new URL('./docs-integrity.mjs', import.meta.url));
const fm = (status = 'Active', versioned = true, extra = '') =>
  `---\ntitle: "fixture"\nstatus: "${status}"\n${versioned ? 'document_version: "1.0.0"\nupdated_at: "2026-10-02"\n' : ''}${extra}---\n\n`;
const table = (rows) =>
  `| Path | Kind／status | Scope |\n| --- | --- | --- |\n${rows.join('\n')}\n`;
function put(root, path, text, tracked = true) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), text);
  if (tracked) execFileSync('git', ['add', '--', path], { cwd: root });
}
function repository(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'fgo-docs-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  const files = {
    'README.md': '# Development\n\n[docs](docs/README.md)\n',
    'AGENTS.md': '# Rules\n\n[docs](docs/README.md)\n',
    '.gitignore': '.test-results/\n',
    'docs/tasks/development-redesign-tasks.md':
      fm() +
      '| ID | Task | Status | Depends on | Primary source |\n| --- | --- | --- | --- | --- |\n| TSK-01 | first | done | - | source |\n\n### TSK-01: first\n\nDepends on: -\n\nHandoff: recorded\n',
    'docs/evidence/README.md':
      fm() + 'tracked report 1件\n\n' + table(['| [parent](parent.md) | Complete | parent note |']),
    'docs/evidence/parent.md': fm('Complete', false) + '# Parent\n\n[machine](record.json)\n',
    'docs/evidence/record.json': '{"status":"domain-specific-outcome"}\n',
    'docs/adr/README.md': fm() + '| ID | Status | Scope |\n| --- | --- | --- |\n',
  };
  const contracts = [
    ['docs/requirements/fgo-lab-requirements-v0.3.md', 'PR-ONE-001'],
    ['docs/requirements/ui-design-spec.md', 'UI-ONE-001'],
    ['docs/requirements/test-strategy-redesign.md', 'TS-ONE-001'],
    ['docs/requirements/ranking-self-and-conditional-effects-requirements.md', 'RK-ONE-001'],
    ['docs/requirements/development-execution-efficiency-requirements.md', 'DX-ONE-001'],
    ['docs/guides/document-governance.md', 'DOC-LINT-001'],
  ];
  for (const [path, id] of contracts)
    files[path] =
      fm(path.includes('/guides/') ? 'Guideline' : 'Active') +
      `## Contract catalog\n\n| \`${id}\` | rule |\n\n## Revision log\n\n| 1.0.0 | original |\n`;
  files['docs/README.md'] =
    fm() +
    table([
      '| [root](../README.md) | 開発入口／tracked本文 | root |',
      '| [rules](../AGENTS.md) | 作業規約／tracked本文 | root |',
      '| [alias](../CLAUDE.md) | alias／mode120000 | root |',
      '| [registry](README.md) | registry／Active v1.0.0 | entry |',
      '| [tasks](tasks/development-redesign-tasks.md) | Tasks／Active v1.0.0 | ledger |',
      '| [evidence](evidence/README.md) | sub-index／Active v1.0.0 | evidence |',
      '| [ADR](adr/README.md) | sub-index／Active v1.0.0 | decisions |',
      ...contracts.map(
        ([path]) =>
          `| [contract](${path.slice('docs/'.length)}) | ${path.includes('/guides/') ? 'guide／Guideline' : 'requirement／Active'} v1.0.0 | contract |`,
      ),
    ]);
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  symlinkSync('AGENTS.md', resolve(root, 'CLAUDE.md'));
  execFileSync('git', ['add', '--', 'CLAUDE.md'], { cwd: root });
  return root;
}
const read = (root, path) => readFileSync(resolve(root, path), 'utf8');
const assertError = (root, pattern) =>
  assert.ok(
    validateRepository(root).some((error) => pattern.test(error)),
    String(pattern),
  );

test('tracked population accepts parent-note JSON registration and root alias', (t) => {
  const root = repository(t);
  const result = inspectRepository(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.machineEvidence, 1);
  assert.equal(result.counts.activeLedgers, 1);
  assert.equal(read(root, 'docs/evidence/record.json'), '{"status":"domain-specific-outcome"}\n');
  assert.deepEqual(validateRepository(root), result.errors);
});

test('valid links resolve references, images, HTML anchors, encoded and escaped paths', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/evidence/space name.md',
    fm('Complete', false) + '# 日本語 title\n\n# 日本語 title\n',
  );
  put(root, 'docs/evidence/paren(name).md', fm('Complete', false) + '# Target\n');
  put(root, 'docs/evidence/hash#file.md', fm('Complete', false));
  put(root, 'docs/evidence/picture.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  put(
    root,
    'docs/evidence/parent.md',
    read(root, 'docs/evidence/parent.md') +
      `
[space](<space name.md#日本語-title>)
[encoded](space%20name.md#%E6%97%A5%E6%9C%AC%E8%AA%9E-title-1)
[paren](paren\\(name\\).md)
[hash](hash%23file.md)
[full][ref]
[collapsed][]
[shortcut]
![image][picture]
![inline](picture.svg "title")

[ref]: space%20name.md
[collapsed]: space%20name.md
[shortcut]: paren(name).md
[picture]: picture.svg

<a id="explicit"></a>
<a href="space%20name.md#日本語-title">HTML link</a>
<img src="picture.svg" alt="image">
<A HREF="paren&#40;name&#41;.md">encoded HTML link</A>
[anchor](#explicit)

\`[code](missing.md)\`
\\[escaped\\](missing.md)

\`\`\`md
[fence](missing.md)
<img src="missing.svg">
\`\`\`
`,
  );
  assert.deepEqual(validateRepository(root), []);
});

test('reference-style registry links preserve version and kind checks', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/README.md',
    read(root, 'docs/README.md').replace(
      '[tasks](tasks/development-redesign-tasks.md)',
      '[tasks][task-ref]',
    ) + '\n[task-ref]: tasks/development-redesign-tasks.md\n',
  );
  assert.deepEqual(validateRepository(root), []);
});

test('evidence report counts follow actual Markdown tables, including reference-style links', (t) => {
  const root = repository(t);
  const path = 'docs/evidence/README.md';
  const original = read(root, path);
  put(
    root,
    path,
    original.replace('[parent](parent.md)', '[parent][parent-ref]') + '\n[parent-ref]: parent.md\n',
  );
  assert.deepEqual(validateRepository(root), []);
  put(root, path, original.replace('| [parent](parent.md)', '\n| [parent](parent.md)'));
  assertError(root, /declares 1 reports but indexes 0/);
});

test('broken, untracked, unregistered and missing-anchor targets fail closed', (t) => {
  const root = repository(t);
  put(root, 'docs/evidence/untracked.md', fm('Complete', false), false);
  put(root, 'docs/evidence/orphan.md', fm('Complete', false));
  put(
    root,
    'docs/evidence/parent.md',
    read(root, 'docs/evidence/parent.md') +
      '\n[broken](missing.md)\n[untracked](untracked.md)\n[anchor](#absent)\n',
  );
  for (const pattern of [
    /untracked target docs\/evidence\/missing.md/,
    /untracked target docs\/evidence\/untracked.md/,
    /orphan.md: unregistered/,
    /missing anchor.*#absent/,
  ])
    assertError(root, pattern);
});

test('malformed and unsupported reference syntax is diagnosed instead of skipped', () => {
  for (const text of [
    '[x][missing]',
    '![missing]',
    '[x](broken path.md)',
    '<img srcset="a.png 1x">',
    '<a href="x" href="y">',
    '[x](x.md)\n\n[x]: y.md\n[x]: z.md',
  ]) {
    assert.ok(analyzeMarkdown(text, 'fixture.md').errors.length > 0, text);
  }
});

test('invalid encoding, local queries, schemes and repository escape are rejected', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/evidence/parent.md',
    read(root, 'docs/evidence/parent.md') +
      '\n[a](%ZZ.md)\n[b](parent.md?x=1)\n[c](file:///tmp/a.md)\n[d](../../../outside.md)\n',
  );
  for (const pattern of [
    /URI malformed/,
    /local query/,
    /unsupported reference scheme/,
    /escapes repository/,
  ])
    assertError(root, pattern);
});

test('kind metadata rejects missing, unknown, duplicate, empty and contradictory values', (t) => {
  const root = repository(t);
  const path = 'docs/evidence/parent.md';
  const invalid = [
    [fm('Verified', false), /invalid evidence status Verified/],
    ['# no metadata\n', /missing frontmatter/],
    [
      fm('Complete', false).replace(
        'status: "Complete"\n',
        'historical_status: "Complete"\nstatus_scope: "past"\n',
      ),
      /missing metadata status/,
    ],
    [fm('Complete', false, 'unknown: "x"\n'), /unknown metadata field unknown/],
    [fm('Complete', false, 'status: "Active"\n'), /duplicate frontmatter field status/],
    [
      fm('Complete', false, 'historical_status: "Verified"\n'),
      /historical_status requires status_scope/,
    ],
    [fm('Complete', false, 'status_scope: ""\n'), /invalid metadata value status_scope/],
    [
      fm('Complete', false, 'superseded_by: "docs/evidence/record.json"\n'),
      /superseded_by contradicts status/,
    ],
    [fm('Complete', false, 'schema_version: "9"\n'), /invalid schema_version/],
    [fm('Complete', false, 'date: "2026-02-30"\n'), /invalid calendar date/],
    [fm('Complete', false, 'source: {nested: value}\n'), /unsupported YAML value/],
    [fm('Complete', false, 'source: &anchor value\n'), /anchors and tags/],
  ];
  for (const [text, pattern] of invalid) {
    put(root, path, text);
    assertError(root, pattern);
  }
});

test('versioned kinds require both version and updated_at; historical values are not current status', (t) => {
  const root = repository(t);
  const path = 'docs/guides/document-governance.md';
  const original = read(root, path);
  put(
    root,
    path,
    original.replace('updated_at: "2026-10-02"\n', '').replace('document_version: "1.0.0"\n', ''),
  );
  assertError(root, /missing metadata document_version/);
  assertError(root, /missing metadata updated_at/);
  put(root, path, original.replace('document_version: "1.0.0"', 'document_version: 7'));
  assertError(root, /invalid document_version/);
  put(
    root,
    'docs/evidence/parent.md',
    fm(
      'Complete',
      false,
      'historical_status: "Complete - Awaiting User UX Confirmation"\nstatus_scope: "implementation only; UX pending"\n',
    ) + '[machine](record.json)',
  );
  assert.ok(!validateRepository(root).some((error) => /invalid evidence status/.test(error)));
});

test('registry rejects absent version, unknown kind, status disagreement and duplicate declarations', (t) => {
  const root = repository(t);
  const path = 'docs/README.md';
  const original = read(root, path);
  for (const [replacement, pattern] of [
    ['requirement／Active', /missing document version/],
    ['unknown／Active v1.0.0', /unknown or contradictory document kind/],
    ['requirement／Proposed v1.0.0', /declares Proposed but frontmatter is Active/],
  ]) {
    put(root, path, original.replace('requirement／Active v1.0.0', replacement));
    assertError(root, pattern);
  }
  put(
    root,
    path,
    original + '\n' + table(['| [same](README.md) | registry／Active v1.0.0 | duplicate |']),
  );
  assertError(root, /duplicate registry declaration/);
});

test('unknown tracked Markdown kind and alias body or wrong target are rejected', (t) => {
  const root = repository(t);
  put(root, 'docs/unknown/file.md', fm());
  assertError(root, /unknown or contradictory document kind/);
  unlinkSync(resolve(root, 'CLAUDE.md'));
  put(root, 'CLAUDE.md', '# Independent body\nstatus: Active\n');
  assertError(root, /invalid alias/);
  unlinkSync(resolve(root, 'CLAUDE.md'));
  symlinkSync('README.md', resolve(root, 'CLAUDE.md'));
  execFileSync('git', ['add', '--', 'CLAUDE.md'], { cwd: root });
  assertError(root, /invalid alias/);
});

test('missing tracked files and unapproved Markdown symlinks are not read through another path', (t) => {
  const root = repository(t);
  unlinkSync(resolve(root, 'docs/evidence/parent.md'));
  assertError(root, /parent.md:.*ENOENT/);
  symlinkSync('README.md', resolve(root, 'docs/evidence/parent.md'));
  execFileSync('git', ['add', '--', 'docs/evidence/parent.md'], { cwd: root });
  assertError(root, /parent.md: expected tracked regular Markdown file/);
});

function addAdr(
  root,
  status = 'accepted',
  extra = 'date: "2026-10-02"\n',
  body = '- Status: accepted\n- Date: 2026-10-02\n',
) {
  put(root, 'docs/adr/001-example.md', fm(status, false, extra) + '# ADR 001\n\n' + body);
  put(
    root,
    'docs/adr/README.md',
    fm() + table([`| [001](001-example.md) | ${status} | decision |`]),
  );
}
test('ADR metadata, body, index, recorded commit and replacement must agree', (t) => {
  const root = repository(t);
  addAdr(root);
  assert.deepEqual(validateRepository(root), []);
  addAdr(
    root,
    'accepted',
    'recorded_commit: "0123456789012345678901234567890123456789"\n',
    '## Status\n\naccepted\n',
  );
  assert.deepEqual(validateRepository(root), []);
  for (const [status, extra, body, pattern] of [
    ['accepted', '', 'Status: accepted', /missing date or recorded_commit/],
    ['accepted', 'recorded_commit: "1234"\n', 'Status: accepted', /invalid recorded_commit/],
    [
      'accepted',
      'date: "2026-10-02"\n',
      'Status: superseded',
      /ADR body status superseded differs/,
    ],
    ['accepted', 'date: "2026-10-02"\n', 'Date: 2026-10-01', /ADR body date.*differs/],
    ['superseded', 'date: "2026-10-02"\n', 'Status: superseded', /missing superseded_by/],
    [
      'superseded',
      'date: "2026-10-02"\nsuperseded_by: "ADR-999"\n',
      'Status: superseded',
      /invalid ADR replacement/,
    ],
  ]) {
    addAdr(root, status, extra, body);
    assertError(root, pattern);
  }
  addAdr(root);
  put(
    root,
    'docs/adr/README.md',
    read(root, 'docs/adr/README.md').replace('| accepted |', '| superseded |'),
  );
  assertError(root, /index status superseded differs/);
  put(root, 'docs/adr/README.md', fm());
  assertError(root, /ADR index: unregistered/);
});

const taskBody = (stamp = '') =>
  `| ID | Task | Status | Depends on | Primary source |\n| --- | --- | --- | --- | --- |\n| TSK-01 | first | in_progress | - | source |\n\n### TSK-01: first\n\nDepends on: -\n\n${stamp}\n\nContract closure matrix:\n\n| Contract ID | Disposition | Verification command | Artifact |\n| --- | --- | --- | --- |\n| \`DOC-LINT-001\` | Apply | docs | Handoff |\n\nHandoff: recorded\n`;
test('UTC timestamps and the final Task section are parsed through EOF; fences are literals', () => {
  for (const stamp of ['2026-10-02T00:00:00Z', '2026-10-02T00:00:00.000Z', 'last section']) {
    assert.deepEqual(validateTaskPlan(taskBody(stamp), new Set(['DOC-LINT-001'])), []);
  }
  assert.deepEqual(
    validateTaskPlan(
      taskBody() + '\n```md\n### TSK-02: fake\n| TSK-02 | fake | in_progress | - | source |\n```\n',
      new Set(['DOC-LINT-001']),
    ),
    [],
  );
});

test('Task status, dependencies, Handoff, closure rows and in_progress are strict', () => {
  const source = taskBody();
  for (const [text, pattern] of [
    [source.replace('| in_progress |', '| unknown |'), /unknown Task status/],
    [source.replace('Depends on: -', 'Depends on: TSK-99'), /differs from index/],
    [
      source.replace('Depends on: -', 'Depends on: -\n\nCurrent status: `done`'),
      /Current status done differs/,
    ],
    [source.replace('| in_progress | - |', '| in_progress | TSK-99 |'), /unknown dependency/],
    [source.replace('| in_progress | - |', '| in_progress | TSK-01 |'), /cyclic dependency/],
    [source.replace('Handoff: recorded', ''), /missing Handoff/],
    [source.replace('`DOC-LINT-001` | Apply', '`UNKNOWN-ID` | Apply'), /unknown Contract ID/],
    [source.replace('| docs | Handoff |', '| - | Handoff |'), /requires command and artifact/],
    [source.replace('| docs | Handoff |', '|  |  |'), /requires command and artifact/],
    [source.replace('| Apply |', '| Deferred: TSK-01 |'), /non-descendant/],
    [
      source.replace(
        '| `DOC-LINT-001` | Apply | docs | Handoff |',
        '| `DOC-LINT-001` | Apply | docs | Handoff |\n| `DOC-LINT-001` | Apply | docs | Handoff |',
      ),
      /duplicate Contract ID/,
    ],
    [
      source.replace(
        '| `DOC-LINT-001` | Apply | docs | Handoff |',
        '| `DOC-LINT-001` | malformed |',
      ),
      /malformed Contract closure row/,
    ],
    [
      source.replace(
        '| TSK-01 | first | in_progress | - | source |',
        '| TSK-01 | first | in_progress | - | source |\n| TSK-02 | second | in_progress | - | source |',
      ),
      /more than one in_progress/,
    ],
    [
      source.replace(
        '| TSK-01 | first | in_progress | - | source |',
        '| TSK-01 | first | in_progress | - | source |\n| TSK-01 | first | in_progress | - | source |',
      ),
      /duplicate Task ID/,
    ],
  ])
    assert.ok(
      validateTaskPlan(text, new Set(['DOC-LINT-001'])).some((error) => pattern.test(error)),
      String(pattern),
    );
});

test('Complete task plans do not count as active ledgers; a second Tasks ledger is rejected', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/tasks/completed.md',
    fm('Complete') + '# Historical plan\n\nTSK-99 in_progress at capture\n',
  );
  const original = read(root, 'docs/README.md');
  put(
    root,
    'docs/README.md',
    original +
      '\n' +
      table(['| [plan](tasks/completed.md) | task plan／Complete v1.0.0 | history |']),
  );
  assert.deepEqual(validateRepository(root), []);
  put(root, 'docs/tasks/second.md', fm() + taskBody());
  put(
    root,
    'docs/README.md',
    read(root, 'docs/README.md') +
      '\n' +
      table(['| [second](tasks/second.md) | Tasks／Active v1.0.0 | second ledger |']),
  );
  assertError(root, /more than one active Task ledger/);
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
test('real CLI succeeds compactly and saves complete verified artifacts in the quality directory', (t) => {
  const root = repository(t);
  const result = cli(root, 'cli-success');
  const { diagnostics, manifest } = assertSaved(result, 0);
  assert.deepEqual(diagnostics.errors, []);
  assert.equal(manifest.outcome, 'success');
  assert.match(result.stdout, /docs integrity passed/);
});
test('real CLI preserves representative failure path and reason with nonzero exit', (t) => {
  const root = repository(t);
  put(root, 'docs/evidence/parent.md', fm('Unknown', false) + '[broken](missing.md)');
  const result = cli(root, 'cli-failure');
  const { diagnostics, manifest } = assertSaved(result, 1);
  assert.equal(manifest.outcome, 'contract_failure');
  assert.ok(
    diagnostics.errors.some((error) => /parent.md: invalid evidence status Unknown/.test(error)),
  );
  assert.match(result.stderr, /parent.md/);
});
test('real CLI bounds large failures but retains every diagnostic and full failure log', (t) => {
  const root = repository(t);
  put(
    root,
    'docs/evidence/parent.md',
    read(root, 'docs/evidence/parent.md') +
      Array.from({ length: 1024 }, (_, i) => `\n[broken ${i}](missing-${i}.md)`).join(''),
  );
  const result = cli(root, 'cli-large-failure');
  const { diagnostics, manifest } = assertSaved(result, 1);
  assert.equal(diagnostics.errors.length, 1024);
  assert.equal(manifest.output.truncated, true);
  assert.match(result.stderr, /1019 errors omitted/);
  assert.ok(diagnostics.errors.some((error) => /missing-1023.md/.test(error)));
  assert.match(readFileSync(resolve(result.directory, 'stderr.log'), 'utf8'), /missing-1023.md/);
});
test('real CLI bounds very long reasons by bytes and retains the full diagnostic value', (t) => {
  const root = repository(t);
  put(root, 'docs/evidence/parent.md', fm('X'.repeat(40000), false) + '[machine](record.json)');
  const result = cli(root, 'cli-long-reason');
  const { diagnostics, manifest } = assertSaved(result, 1);
  assert.equal(manifest.output.truncated, true);
  assert.ok(diagnostics.errors.some((error) => error.includes('X'.repeat(40000))));
  assert.ok(Buffer.byteLength(result.stderr) < 4096);
});
test('real CLI artifact save failure is nonzero and does not use another directory', (t) => {
  const root = repository(t);
  const parent = resolve(root, 'not-a-directory');
  writeFileSync(parent, 'block');
  const result = cli(root, 'cli-save-failure', { FGO_QUALITY_RUN_DIR: parent });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifact or CLI failure/);
  assert.match(result.stderr, /ENOTDIR|EEXIST/);
  assert.ok(!readdirSync(root).includes('.test-results'));
});
