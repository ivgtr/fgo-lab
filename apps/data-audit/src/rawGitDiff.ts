import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  diffRawInventory,
  scanRawTables,
  type RawInventory,
  type RawInventoryDifference,
} from '@fgo-lab/data-pipeline';

const runFile = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/;
const TABLE = /^master\/[A-Za-z][A-Za-z0-9_]*\.json$/;
const MAX_BLOB_BYTES = 128 * 1024 * 1024;
const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const TRACKED_CONCEPTS = new Set([
  'mstFunc:$[].funcType',
  'mstFunc:$[].targetType',
  'mstFunc:$[].applyTarget',
  'mstFunc:$[].categoryId',
  'mstFunc:$[].cond',
  'mstBuff:$[].type',
  'mstBuff:$[].buffGroup',
  'mstSkill:$[].type',
  'mstSvt:$[].type',
  'mstSvt:$[].classId',
  'mstSvt:$[].genderType',
  'mstSvt:$[].attri',
  'mstSvt:$[].attackAttri',
  'mstTreasureDevice:$[].effectFlag',
  'mstTreasureDevice:$[].attackAttri',
  'mstCard:$[].id',
  'mstClass:$[].id',
  'mstClassRelationOverwrite:$[].type',
  'mstBuffConvert:$[].convertType',
]);

export type RawGitDiff = {
  before: string;
  after: string;
  beforeTableCount: number;
  afterTableCount: number;
  changedPaths: string[];
  differences: RawInventoryDifference[];
};

async function git(repo: string, args: string[], maxBuffer = MAX_BLOB_BYTES): Promise<Buffer> {
  const result = await runFile('git', ['-C', repo, ...args], {
    encoding: 'buffer',
    maxBuffer,
    timeout: 120_000,
  });
  return result.stdout;
}

async function commit(repo: string, revision: string): Promise<string> {
  if (!SHA.test(revision)) throw new TypeError('raw_git:revision_must_be_full_sha');
  const resolved = (await git(repo, ['rev-parse', '--verify', `${revision}^{commit}`]))
    .toString('ascii')
    .trim();
  if (resolved !== revision) throw new TypeError('raw_git:revision_mismatch');
  return resolved;
}

async function tree(repo: string, revision: string): Promise<Map<string, string>> {
  const output = await git(repo, ['ls-tree', '-r', '-z', revision, 'master']);
  const entries = new Map<string, string>();
  for (const item of output.toString('utf8').split('\0')) {
    if (!item) continue;
    const match = /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(item);
    if (!match) throw new TypeError(`raw_git:unsupported_tree_entry:${item}`);
    const path = match[2]!;
    if (!TABLE.test(path)) throw new TypeError(`raw_git:unsupported_master_path:${path}`);
    if (entries.has(path)) throw new TypeError(`raw_git:duplicate_path:${path}`);
    entries.set(path, match[1]!);
  }
  if (entries.size === 0) throw new TypeError('raw_git:empty_master_tree');
  return entries;
}

async function inventory(repo: string, oid: string, path: string) {
  const blob = await git(repo, ['cat-file', 'blob', oid]);
  if (blob.byteLength > MAX_BLOB_BYTES) throw new RangeError(`raw_git:blob_size_limit:${path}`);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(blob);
  const value = JSON.parse(text) as unknown;
  return scanRawTables(new Map([[path, value]]), TRACKED_CONCEPTS);
}

/** Initial baseline: inspect each table, including those unchanged in later diffs. */
export async function scanRawGitRevision(input: {
  repo: string;
  revision: string;
}): Promise<{ revision: string; inventory: RawInventory }> {
  const revision = await commit(input.repo, input.revision);
  const source = await tree(input.repo, revision);
  const tables: RawInventory['tables'] = [];
  for (const [path, oid] of [...source].sort(([left], [right]) => compareCodeUnits(left, right))) {
    const scanned = await inventory(input.repo, oid, path);
    tables.push(...scanned.tables);
  }
  return { revision, inventory: { tables } };
}

/** The tree comparison covers every raw table and downloads only changed blobs. */
export async function diffRawGitRevisions(input: {
  repo: string;
  before: string;
  after: string;
}): Promise<RawGitDiff> {
  const before = await commit(input.repo, input.before);
  const after = await commit(input.repo, input.after);
  const [oldTree, newTree] = await Promise.all([tree(input.repo, before), tree(input.repo, after)]);
  const changedPaths = [...new Set([...oldTree.keys(), ...newTree.keys()])]
    .filter((path) => oldTree.get(path) !== newTree.get(path))
    .sort(compareCodeUnits);
  const differences: RawInventoryDifference[] = [];
  for (const path of changedPaths) {
    const oldOid = oldTree.get(path);
    const newOid = newTree.get(path);
    const [oldInventory, newInventory] = await Promise.all([
      oldOid ? inventory(input.repo, oldOid, path) : { tables: [] },
      newOid ? inventory(input.repo, newOid, path) : { tables: [] },
    ]);
    differences.push(...diffRawInventory(oldInventory, newInventory));
  }
  return {
    before,
    after,
    beforeTableCount: oldTree.size,
    afterTableCount: newTree.size,
    changedPaths,
    differences,
  };
}
