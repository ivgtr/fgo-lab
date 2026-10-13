import { readFile } from 'node:fs/promises';
import { scanRawGitRevision } from './rawGitDiff';
import type { RawInventory } from '@fgo-lab/data-pipeline';

export type RawVocabularyBaseline = {
  format: string;
  revision: string;
  tables: Record<string, Record<string, { types: string[]; values?: string[] }>>;
};

export type VocabularyChange = {
  kind: 'table' | 'field' | 'type' | 'value';
  table: string;
  path?: string;
  value?: string;
};

export function compareRawVocabulary(
  baseline: RawVocabularyBaseline,
  inventory: RawInventory,
): VocabularyChange[] {
  if (baseline.format !== 'fgo-lab-raw-vocabulary-v1' || !/^[a-f0-9]{40}$/.test(baseline.revision))
    throw new TypeError('raw_vocabulary:invalid_baseline');
  const changes: VocabularyChange[] = [];
  const current = new Map(inventory.tables.map((table) => [table.table, table]));
  for (const table of inventory.tables) {
    const expected = baseline.tables[table.table];
    if (!expected) {
      changes.push({ kind: 'table', table: table.table });
      continue;
    }
    for (const field of table.fields) {
      const declaration = expected[field.path];
      if (!declaration) {
        changes.push({ kind: 'field', table: table.table, path: field.path });
        continue;
      }
      for (const type of field.types)
        if (!declaration.types.includes(type))
          changes.push({ kind: 'type', table: table.table, path: field.path, value: type });
      if (declaration.values)
        for (const value of field.values ?? [])
          if (!declaration.values.includes(value))
            changes.push({ kind: 'value', table: table.table, path: field.path, value });
    }
  }
  for (const table of Object.keys(baseline.tables))
    if (!current.has(table)) changes.push({ kind: 'table', table });
  return changes.sort((left, right) =>
    JSON.stringify(left) < JSON.stringify(right)
      ? -1
      : JSON.stringify(left) > JSON.stringify(right)
        ? 1
        : 0,
  );
}

export async function auditRawVocabulary(input: {
  repo: string;
  revision: string;
  baselinePath: string;
}): Promise<{ revision: string; baselineRevision: string; changes: VocabularyChange[] }> {
  const baseline = JSON.parse(await readFile(input.baselinePath, 'utf8')) as RawVocabularyBaseline;
  const scanned = await scanRawGitRevision({ repo: input.repo, revision: input.revision });
  return {
    revision: scanned.revision,
    baselineRevision: baseline.revision,
    changes: compareRawVocabulary(baseline, scanned.inventory),
  };
}
