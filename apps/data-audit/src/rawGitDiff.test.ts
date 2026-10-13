import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffRawGitRevisions, scanRawGitRevision } from './rawGitDiff';

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function commit(repo: string, data: unknown, name: string): string {
  writeFileSync(join(repo, 'master', name), JSON.stringify(data) + '\n');
  git(repo, 'add', 'master');
  git(
    repo,
    '-c',
    'user.name=Audit Test',
    '-c',
    'user.email=audit@example.test',
    'commit',
    '-qm',
    name,
  );
  return git(repo, 'rev-parse', 'HEAD');
}

describe('raw Git audit', () => {
  it('inspects all baseline tables and reports changed concepts without fetching unchanged blobs', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'fgo-raw-audit-'));
    try {
      git(repo, 'init', '-q');
      mkdirSync(join(repo, 'master'));
      const before = commit(repo, [{ id: 1, funcType: 10, value: 'old' }], 'mstFunc.json');
      const base = await scanRawGitRevision({ repo, revision: before });
      expect(base.inventory.tables.map((table) => table.table)).toEqual(['mstFunc']);
      const after = commit(
        repo,
        [
          { id: 1, funcType: 10, value: 'old', newCondition: true },
          { id: 2, funcType: 11, value: 4 },
        ],
        'mstFunc.json',
      );
      const result = await diffRawGitRevisions({ repo, before, after });
      expect(result.changedPaths).toEqual(['master/mstFunc.json']);
      expect(result.differences).toEqual(
        expect.arrayContaining([
          { kind: 'newField', table: 'mstFunc', path: '$[].newCondition' },
          { kind: 'newValue', table: 'mstFunc', path: '$[].funcType', value: '11' },
          { kind: 'newType', table: 'mstFunc', path: '$[].value', value: 'integer' },
        ]),
      );
      const same = await diffRawGitRevisions({ repo, before: after, after });
      expect(same.changedPaths).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('rejects unsupported raw paths and non-commit revision selectors', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'fgo-raw-audit-'));
    try {
      git(repo, 'init', '-q');
      mkdirSync(join(repo, 'master'));
      const before = commit(repo, [{ id: 1 }], 'mstFunc.json');
      await expect(diffRawGitRevisions({ repo, before: 'HEAD', after: before })).rejects.toThrow(
        /revision_must_be_full_sha/,
      );
      const after = commit(repo, { id: 1 }, 'other.txt');
      await expect(diffRawGitRevisions({ repo, before, after })).rejects.toThrow(
        /unsupported_master_path/,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
