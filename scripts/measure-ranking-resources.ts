import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cpus, platform } from 'node:os';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '../packages/master-data/src/index';
import { calculateRankingPolicy } from '../packages/calculation-application/src/rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '../packages/calculation-application/src/rankingContracts';
import { currentCalculationVersionContext } from '../packages/calculation-application/src/portableCalculation';

const output = process.argv[2];
if (!output) throw new Error('usage: tsx scripts/measure-ranking-resources.ts <output.json>');
process.chdir(resolve(import.meta.dirname, '..'));
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const content = await readFile('packages/test-fixtures/production-master/master.json', 'utf8');
const master = masterSnapshotSchema.parse(JSON.parse(content));
const versions = currentCalculationVersionContext(master);
const run = () =>
  calculateRankingPolicy(
    master,
    { servantBuilds: {} },
    DEFAULT_RANKING_POLICY_CONDITIONS,
    versions,
  );
run();
const samples = [];
for (let index = 0; index < 3; index++) {
  const start = performance.now();
  const result = run();
  samples.push({
    milliseconds: performance.now() - start,
    rows: result.rows.length,
    exclusions: result.exclusions.length,
    digest: hash(JSON.stringify(result)),
  });
}
const evidence = {
  command:
    'pnpm --filter @fgo-lab/data-pipeline exec tsx ../../scripts/measure-ranking-resources.ts <output.json>',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  diffHash: hash(execFileSync('git', ['diff'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })),
  node: process.version,
  platform: platform(),
  cpu: cpus()[0]?.model,
  scriptHash: hash(await readFile('scripts/measure-ranking-resources.ts', 'utf8')),
  masterHash: hash(content),
  versions,
  conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
  samples,
  medianMs: samples.map(({ milliseconds }) => milliseconds).sort((a, b) => a - b)[1],
};
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    medianMs: evidence.medianMs,
    rows: samples[0]?.rows,
    exclusions: samples[0]?.exclusions,
  }),
);
