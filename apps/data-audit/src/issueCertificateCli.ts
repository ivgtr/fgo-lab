import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';
import { issueCandidateCertificate } from './issueCertificate';

const run = promisify(execFile);
const observationSchema = z.strictObject({
  format: z.literal('fgo-lab-atlas-observation-v1'),
  observedAt: z.iso.datetime(),
});
const [
  rawRepo,
  exporterRepo,
  observedDirectory,
  replayDirectory,
  contractSha256,
  generationText,
  outputPath,
  ...extra
] = process.argv.slice(2);
if (
  !rawRepo ||
  !exporterRepo ||
  !observedDirectory ||
  !replayDirectory ||
  !contractSha256 ||
  !generationText ||
  !outputPath ||
  extra.length
)
  throw new TypeError(
    'usage: issue-certificate <raw-repo> <exporter-repo> <observed-directory> <replay-directory> <contract-sha256> <generation> <new-output-path>',
  );
if (!/^[1-9][0-9]*$/.test(generationText))
  throw new TypeError('certificate_issuer:invalid_generation');
const generation = Number(generationText);
if (!Number.isSafeInteger(generation)) throw new TypeError('certificate_issuer:unsafe_generation');
async function head(repo: string): Promise<string> {
  const result = await run('git', ['-C', repo, 'rev-parse', 'HEAD']);
  return result.stdout.trim();
}
const observation = observationSchema.parse(
  JSON.parse(await readFile(`${observedDirectory}/observation.json`, 'utf8')) as unknown,
);
const [rawCommit, exporterCommit, publisherCommit] = await Promise.all([
  head(rawRepo),
  head(exporterRepo),
  head(process.cwd()),
]);
const { certificate, evidence } = await issueCandidateCertificate({
  rawRepo,
  rawCommit,
  exporterRepo,
  exporterCommit,
  observedDirectory,
  replayDirectory,
  observedAt: observation.observedAt,
  publishedAt: new Date().toISOString(),
  publisherCommit,
  contractSha256,
  generation,
});
await writeFile(outputPath, `${JSON.stringify(certificate)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ outputPath, generation, evidence })}\n`);
