import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ocExecutionOperationSchema } from '@fgo-lab/master-data';
import { normalizeAtlasSnapshot } from '../src/index';
import { normalizeOcSemantics } from '../src/ocSemantics';
import type { AtlasFunction } from '../src/atlasContract';
import { normalizeTargetPolicy } from '../src/executionSemantics';

const output = process.argv[2];
if (!output) throw new Error('an explicit diagnostic snapshot output path is required');
const root = resolve(import.meta.dirname, '../../..');
const [servants, equips, mysticCodes, items, referencedSkills] = await Promise.all(
  ['nice_servant', 'nice_equip', 'nice_mystic_code', 'nice_item', 'referenced_skills'].map(
    async (name) => JSON.parse(await readFile(resolve(root, `data/raw/${name}.json`), 'utf8')),
  ),
);
let occurrences = 0;
let cells = 0;
function auditRawOc(value: unknown) {
  if (value === null || typeof value !== 'object') return;
  const fn = value as AtlasFunction;
  if (fn.buffs?.some(({ type }) => type === 'upChagetd')) {
    const parameterSets = [
      fn.svals ?? [],
      fn.svals2 ?? [],
      fn.svals3 ?? [],
      fn.svals4 ?? [],
      fn.svals5 ?? [],
    ];
    const normalized = normalizeOcSemantics({
      fn,
      parameterSets,
      expressions: [[], [], [], [], []],
      source: 'skill',
      traitNameById: new Map(),
      route: {
        target: normalizeTargetPolicy(fn.funcTargetType ?? '', fn.funcTargetTeam),
        contributionScope: 'personal',
        eligibility: { kind: 'anyRecipient', onMissing: 'unsupported' },
      },
    });
    assert.equal(normalized?.length, 1);
    const operation = ocExecutionOperationSchema.parse(normalized![0]);
    assert.equal(operation.kind, 'grantOcBoost');
    if (operation.kind !== 'grantOcBoost') throw new Error('raw OC grant was not preserved');
    for (const [i, row] of parameterSets.entries()) {
      assert.equal(operation.cells[i]!.length, row.length);
      for (const [j, raw] of row.entries()) {
        const actual = operation.cells[i]![j]!;
        assert.equal(actual.stages, raw.Value);
        assert.equal(actual.applicationRatePermille, raw.Rate);
        assert.deepEqual(
          actual.turns,
          raw['Turn'] === -1 ? { kind: 'unlimited' } : { kind: 'finite', remaining: raw['Turn'] },
        );
        assert.deepEqual(
          actual.uses,
          raw['Count'] === -1 ? { kind: 'unlimited' } : { kind: 'finite', remaining: raw['Count'] },
        );
        cells += 1;
      }
    }
    occurrences += 1;
  }
  for (const child of Object.values(value)) auditRawOc(child);
}
// This check owns raw numeric/lifecycle cells, including unpublished sources. Published source
// lifetime, recipient, CE normal/LB and writer parity are checked against the baseline separately.
for (const raw of [servants, equips, mysticCodes, referencedSkills]) auditRawOc(raw);
assert.equal(occurrences, 167);
assert.equal(cells, 632);
const snapshot = normalizeAtlasSnapshot({
  version: '20260906.1',
  servants,
  equips,
  mysticCodes,
  items,
  referencedSkills,
});
await writeFile(resolve(output), JSON.stringify(snapshot));
console.log(
  JSON.stringify({
    output,
    rawOcOccurrences: occurrences,
    rawOcCells: cells,
    servants: snapshot.servants.length,
  }),
);
