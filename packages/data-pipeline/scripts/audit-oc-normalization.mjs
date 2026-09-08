import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Compare one normalized snapshot with the occurrence/cell baseline, without reloading per case.
const [snapshotPath, baselinePath, outputPath] = process.argv.slice(2);
if (!snapshotPath || !baselinePath || !outputPath)
  throw new Error('usage: audit-oc-normalization.mjs <snapshot> <baseline-inventory> <output>');
const [snapshotBytes, baselineBytes] = await Promise.all([
  readFile(snapshotPath),
  readFile(baselinePath),
]);
const snapshot = JSON.parse(snapshotBytes);
const baseline = JSON.parse(baselineBytes);
const atPath = (path) =>
  path
    .split('#')[1]
    .split('/')
    .slice(1)
    .reduce((node, key) => node[key], snapshot);
const lifetime = (value) =>
  value === -1 ? { kind: 'unlimited' } : { kind: 'finite', remaining: value };
let checkedCells = 0;
const sources = [];
for (const [family, records] of [
  ['grantOcBoost', baseline.oc],
  ['grantOcApplicationRate', baseline.rates],
]) {
  for (const record of records) {
    const effect = atPath(record.path);
    const operations = effect.execution.filter((operation) => operation.kind === family);
    assert.equal(operations.length, 1, `${family}:${record.path}`);
    const operation = operations[0];
    for (const [rawSets, cells] of [
      [record.parameterSets, operation.cells],
      ...(record.limitBreakParameterSets
        ? [[record.limitBreakParameterSets, operation.limitBreakCells]]
        : []),
    ]) {
      assert.equal(cells?.length, rawSets.length, record.path);
      for (const [i, row] of rawSets.entries()) {
        assert.equal(cells[i].length, row.length, record.path);
        for (const [j, raw] of row.entries()) {
          const cell = cells[i][j];
          assert.equal(cell.applicationRatePermille, raw.Rate, record.path);
          assert.deepEqual(cell.turns, lifetime(raw.Turn), record.path);
          assert.deepEqual(cell.uses, lifetime(raw.Count), record.path);
          if (family === 'grantOcBoost') assert.equal(cell.stages, raw.Value, record.path);
          else
            assert.deepEqual(
              cell.amount,
              raw.RatioHPLow === undefined
                ? { kind: 'fixed', value: raw.Value }
                : {
                    kind: 'inverseHpLinear',
                    basePermille: raw.Value,
                    bonusAtZeroHpPermille: raw.RatioHPLow,
                  },
              record.path,
            );
          checkedCells += 1;
        }
      }
    }
    sources.push({ path: record.path, family, operation });
  }
}
for (const writer of baseline.writers) {
  const effect = atPath(writer.path);
  const expectedKind = ['oc', 'rate'].includes(writer.partition)
    ? 'removeOcState'
    : 'ocStateNonIntersection';
  assert.equal(
    effect.execution.filter((operation) => operation.kind === expectedKind).length,
    1,
    writer.path,
  );
  assert.equal(
    effect.execution.some((operation) => operation.kind === 'stateMutation'),
    false,
    writer.path,
  );
}
assert.equal(baseline.contextWriters.length, 7);
for (const writer of baseline.contextWriters) {
  const effect = atPath(writer.path);
  assert.deepEqual(
    effect.execution.filter(({ kind }) => kind === 'contextMutation'),
    writer.execution,
    writer.path,
  );
  assert.equal(
    effect.execution.filter(({ kind }) => kind === 'ocStateNonIntersection').length,
    1,
    writer.path,
  );
}
const counts = {};
let resistanceCells = 0;
const removalResistanceSources = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.atlasEvidence && Array.isArray(node.execution)) {
    for (const operation of node.execution) {
      if (operation.kind === 'ocRemovalResistance') {
        for (const [rawSets, cells] of [
          [node.atlasEvidence.parameterSets, operation.cells],
          ...(node.atlasEvidence.limitBreakParameterSets
            ? [[node.atlasEvidence.limitBreakParameterSets, operation.limitBreakCells]]
            : []),
        ]) {
          assert.equal(rawSets.length, cells.length);
          for (const [i, row] of rawSets.entries())
            for (const [j, raw] of row.entries()) {
              assert.deepEqual(cells[i][j], {
                applicationRatePermille: raw.Rate,
                turns: lifetime(raw.Turn),
                uses: lifetime(raw.Count),
                amount: { kind: 'fixed', value: raw.Value },
              });
              resistanceCells += 1;
            }
        }
        removalResistanceSources.push({ occurrenceId: node.occurrenceId, operation });
      }
      if (
        [
          'ocRemovalResistance',
          'grantOcBoost',
          'grantOcApplicationRate',
          'removeOcState',
          'ocStateNonIntersection',
        ].includes(operation.kind)
      )
        counts[operation.kind] = (counts[operation.kind] ?? 0) + 1;
    }
  }
  for (const child of Object.values(node)) visit(child);
}
visit(snapshot);
assert.deepEqual(counts, {
  ocRemovalResistance: 60,
  grantOcBoost: 97,
  grantOcApplicationRate: 29,
  ocStateNonIntersection: 131,
  removeOcState: 75,
});
const report = {
  snapshotPath,
  snapshotSha256: createHash('sha256').update(snapshotBytes).digest('hex'),
  baselineSha256: createHash('sha256').update(baselineBytes).digest('hex'),
  counts,
  checkedCells,
  resistanceCells,
  removalResistanceSources,
  checkedWriters: baseline.writers.length,
  writerPartition: baseline.inventory.writerPartition,
  note: '206 lifecycle operations include 199 former generic writers and 7 preserved context writers.',
  sources,
};
await writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, sources: undefined, removalResistanceSources: undefined }));
