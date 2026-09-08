import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only evidence producer. Function IDs join raw evidence, never runtime behavior.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = resolve(root, process.argv[2] ?? '.test-results/tsk-06-48-a0/oc-inventory.json');
const rawPaths = [
  'data/raw/nice_servant.json',
  'data/raw/nice_equip.json',
  'data/raw/nice_mystic_code.json',
  'data/raw/referenced_skills.json',
];
const masterPath = 'apps/web/public/master/master.json';
const digests = {};
const functions = new Map();
const rawOc = [];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function visit(value, path, accept) {
  if (value === null || typeof value !== 'object') return;
  accept(value, path);
  for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key}`, accept);
}
function traits(values = []) {
  return values.map(({ id, name, negative }) => ({ id, name, negative: negative ?? false }));
}
function functionMetadata(fn) {
  return {
    functionType: fn.funcType,
    target: fn.funcTargetType,
    targetTeam: fn.funcTargetTeam,
    traitSelector: traits(fn.traitVals),
    actorSelector: traits(fn.functvals),
    buffs: (fn.buffs ?? []).map((buff) => ({
      type: buff.type,
      stateTraits: traits(buff.vals),
      selector: traits(buff.tvals),
      casterSelector: traits(buff.ckSelfIndv),
      recipientSelector: traits(buff.ckOpIndv),
      group: buff.buffGroup,
      maxRate: buff.maxRate,
    })),
  };
}
for (const path of rawPaths) {
  const bytes = await readFile(resolve(root, path));
  digests[path] = digest(bytes);
  visit(JSON.parse(bytes), '', (value, pointer) => {
    if (!Number.isInteger(value.funcId)) return;
    const metadata = functionMetadata(value);
    const variants = functions.get(String(value.funcId)) ?? new Map();
    variants.set(JSON.stringify(metadata), metadata);
    functions.set(String(value.funcId), variants);
    if (!metadata.buffs.some(({ type }) => type === 'upChagetd')) return;
    rawOc.push({
      path: `${path}#${pointer}`,
      functionId: value.funcId,
      metadata,
      cells: ['svals', 'svals2', 'svals3', 'svals4', 'svals5'].flatMap((key) => value[key] ?? []),
    });
  });
}
const bytes = await readFile(resolve(root, masterPath));
digests[masterPath] = digest(bytes);
const master = JSON.parse(bytes);
const oc = [];
const rates = [];
const writers = [];
const contextWriters = [];
const rateTypes = new Set(['upGrantstate', 'downGrantstate', 'upTolerance', 'downTolerance']);
const writerKinds = new Set(['remove', 'move', 'extendDuration', 'shortenCount']);
visit(master, '', (effect, pointer) => {
  if (!effect.atlasEvidence) return;
  const rawMetadata = [...(functions.get(effect.id)?.values() ?? [])];
  const record = {
    path: `${masterPath}#${pointer}`,
    id: effect.id,
    occurrenceId: effect.occurrenceId,
    timing: effect.timing ?? null,
    requirement: effect.requirement,
    execution: effect.execution,
    rawMetadata,
    parameterSets: effect.atlasEvidence.parameterSets,
    limitBreakParameterSets: effect.atlasEvidence.limitBreakParameterSets ?? null,
  };
  if (effect.atlasEvidence.buffTypes.includes('upChagetd')) oc.push(record);
  if (
    rawMetadata.some(({ buffs }) =>
      buffs.some(
        ({ type, selector }) =>
          rateTypes.has(type) && selector.some(({ name }) => name === 'buffPositiveEffect'),
      ),
    )
  )
    rates.push(record);
  for (const operation of effect.execution) {
    if (operation.kind === 'stateMutation' && writerKinds.has(operation.mutation))
      writers.push({ ...record, operation });
  }
  if (
    rawMetadata.some(({ functionType }) => functionType === 'subState') &&
    effect.execution.some(({ kind }) => kind === 'contextMutation') &&
    !effect.execution.some(
      (operation) => operation.kind === 'stateMutation' && writerKinds.has(operation.mutation),
    )
  )
    contextWriters.push(record);
});
const allCells = (record) => [
  ...record.parameterSets.flat(),
  ...(record.limitBreakParameterSets?.flat() ?? []),
];
const hpKeys = ['RatioHPLow', 'RatioHPHigh', 'RatioHPRangeLow', 'RatioHPRangeHigh'];
const hpDependentRates = rates.filter((record) =>
  allCells(record).some((cell) => hpKeys.some((key) => key in cell)),
);
const writerPartition = { enemy: 0, oc: 0, rate: 0, disjoint: 0 };
for (const writer of writers) {
  const classes = new Set(
    writer.rawMetadata.map(({ traitSelector }) => {
      if (writer.operation.recipient === 'enemy') return 'enemy';
      if (writer.operation.mutation !== 'remove') return 'disjoint';
      if (traitSelector.some(({ name }) => name === 'buffPositiveEffect')) return 'oc';
      if (
        traitSelector.some(({ name }) =>
          ['buffNegativeEffect', 'buffBuffSuccessRateUp'].includes(name),
        )
      )
        return 'rate';
      return 'disjoint';
    }),
  );
  if (classes.size !== 1) throw new Error(`ambiguous_writer_partition:${writer.path}`);
  writer.partition = [...classes][0];
  writerPartition[writer.partition] += 1;
}
const inventory = {
  rawOcByFile: Object.fromEntries(
    rawPaths.map((path) => [
      path,
      rawOc.filter((record) => record.path.startsWith(`${path}#`)).length,
    ]),
  ),
  rawOc: rawOc.length,
  rawOcCells: rawOc.reduce((count, record) => count + record.cells.length, 0),
  publishedOc: oc.length,
  lifecycleWriters: writers.length,
  existingContextWriters: contextWriters.length,
  writerPartition,
  positiveApplicationRateModifiers: rates.length,
  hpDependentRateModifiers: hpDependentRates.length,
  hpDependentRateCells: hpDependentRates.reduce(
    (count, record) => count + allCells(record).length,
    0,
  ),
};
const artifact = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  worktree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
  command: 'node packages/data-pipeline/scripts/audit-oc-planning-baseline.mjs',
  masterVersion: master.version,
  digests,
  inventory,
  hpDependentRates,
  rawOc,
  oc,
  rates,
  writers,
  contextWriters,
};
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ inventory, artifact: output }, null, 2));
if (rawOc.length !== 167 || oc.length !== 97 || rates.length !== 29 || writers.length !== 199)
  throw new Error('OC planning population changed; inspect artifact before implementation');

if (
  JSON.stringify(writerPartition) !== JSON.stringify({ enemy: 92, oc: 2, rate: 73, disjoint: 32 })
)
  throw new Error('writer_partition_changed');
