import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectContractIds,
  parseFrontmatter,
  validateRegistry,
  validateTaskPlan,
} from './docs-integrity-lib.mjs';

test('frontmatter rejects duplicate fields', () => {
  const result = parseFrontmatter(
    '---\ndocument_version: "1.0.0"\nupdated_at: a\nupdated_at: b\n---',
  );
  assert.deepEqual(result.errors, ['document: duplicate frontmatter field updated_at']);
});

test('registry rejects a stale document version', () => {
  const registry = '| [target](target.md) | requirement／Active v1.0.0 | scope |';
  const errors = validateRegistry(
    '/repo/docs/README.md',
    registry,
    () => '---\ndocument_version: "1.1.0"\nstatus: "Active"\n---',
  );
  assert.match(errors[0], /declares v1\.0\.0.*v1\.1\.0/);
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
