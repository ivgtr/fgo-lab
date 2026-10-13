import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { loadObservedAtlasFixture } from '../e2e/atlasObservedFixture';
import { normalizeCertifiedAtlasSnapshot } from '../packages/data-pipeline/src/browser';
import { calculateRankingPolicySummary } from '../packages/calculation-application/src/rankingPolicyCalculation';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '../packages/calculation-application/src/rankingContracts';
import { currentCalculationVersionContext } from '../packages/calculation-application/src/portableCalculation';
import { ATLAS_EXPORT_KEYS, type AtlasExportKey } from '../packages/master-data/src/index';

const output = process.argv[2];
if (!output) throw new TypeError('usage: measure-atlas-ranking <new-output-path>');
const source = await loadObservedAtlasFixture();
try {
  const exports = new Map<AtlasExportKey, unknown>();
  for (const key of ATLAS_EXPORT_KEYS)
    exports.set(
      key,
      JSON.parse(source.bodies.get(`/export/JP/${key}.json`)!.toString('utf8')) as unknown,
    );
  const referencedSkills = new Map<number, unknown>();
  for (const { id } of source.certificate.referencedSkills)
    referencedSkills.set(
      id,
      JSON.parse(source.bodies.get(`/nice/JP/skill/${String(id)}`)!.toString('utf8')) as unknown,
    );
  const master = normalizeCertifiedAtlasSnapshot({
    certificate: source.certificate,
    exports,
    referencedSkills,
  });
  const versions = currentCalculationVersionContext(master);
  const samples = [];
  for (let start = 0; start < master.servants.length; start += 50) {
    const subset = { ...master, servants: master.servants.slice(start, start + 50) };
    const began = performance.now();
    const result = calculateRankingPolicySummary(
      subset,
      { servantBuilds: {} },
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions,
    );
    samples.push({
      start,
      count: subset.servants.length,
      milliseconds: performance.now() - began,
      rows: result.rows.length,
      exclusions: result.exclusions.length,
      digest: createHash('sha256').update(JSON.stringify(result.rows)).digest('hex'),
    });
  }
  await writeFile(
    output,
    `${JSON.stringify(
      {
        sourceSha256: source.canonicalSha256,
        conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
        samples,
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );
  process.stdout.write(
    `${JSON.stringify(samples.map(({ start, milliseconds, rows }) => ({ start, milliseconds, rows })))}\n`,
  );
} finally {
  await source.cleanup();
}
