import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { ManagedAtlasIssues } from '@fgo-lab/atlas-monitor';
import { issueCandidateCertificate } from './issueCertificate';
import { publishCertificate } from './publishCertificate';
import { verifyCertificateDelivery } from './verifyCertificateDelivery';

const run = promisify(execFile);
const [workspaceRoot, ...extra] = process.argv.slice(2);
if (!workspaceRoot || extra.length)
  throw new TypeError('usage: audit-run <new-workspace-directory>');

const githubToken = process.env['GITHUB_TOKEN'];
const repository = process.env['GITHUB_REPOSITORY'];
const runId = process.env['GITHUB_RUN_ID'];
if (!githubToken || repository !== 'ivgtr/fgo-lab' || !runId)
  throw new TypeError('atlas_audit:missing_github_actions_identity');
const monitor = new ManagedAtlasIssues(githubToken, repository);
const root = resolve(import.meta.dirname, '../../..');
const rawRepo = join(workspaceRoot, 'raw');
const exporterRepo = join(workspaceRoot, 'exporter');
const observedDirectory = join(workspaceRoot, 'observed');
const publicationWorkspace = join(workspaceRoot, 'publication');
const remote = 'https://github.com/ivgtr/fgo-lab.git';
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const infoSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{6}$/),
  timestamp: z.number().int().nonnegative(),
  serverHash: z.string().regex(/^[a-f0-9]{6}$/),
  serverTimestamp: z.number().int().nonnegative(),
  dataVer: z.number().int().nonnegative(),
  dateVer: z.number().int().nonnegative(),
  assetbundle: z.strictObject({
    folderName: z.string(),
    animalName: z.string(),
    zooName: z.string(),
  }),
});
const observationSchema = z.strictObject({
  format: z.literal('fgo-lab-atlas-observation-v1'),
  observedAt: z.iso.datetime(),
});

async function command(
  file: string,
  args: string[],
  cwd = root,
  env = process.env,
): Promise<string> {
  const output = await run(file, args, { cwd, env, maxBuffer: 64 * 1024 * 1024 });
  return output.stdout.trim();
}

async function jsonResponse(url: string, token?: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new TypeError(`atlas_audit:source_http_${String(response.status)}`);
  return (await response.json()) as unknown;
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 14_000) : String(cause).slice(0, 14_000);
}

let stage = 'preflight';
let rawCommit = '';
let exporterCommit = '';
try {
  await mkdir(workspaceRoot);
  const publisherCommit = commitSchema.parse(await command('git', ['rev-parse', 'HEAD']));
  if (await command('git', ['status', '--porcelain', '--untracked-files=normal']))
    throw new TypeError('atlas_audit:dirty_publisher_checkout');
  const contractSha256 = await command('node', [
    'scripts/atlas-contract-fingerprint.mjs',
    '--check',
  ]);
  if (!/^[a-f0-9]{64}$/.test(contractSha256))
    throw new TypeError('atlas_audit:invalid_contract_fingerprint');

  stage = 'source';
  const info = infoSchema.parse(
    await jsonResponse('https://api.atlasacademy.io/export/JP/info.json'),
  );
  const resolved = z
    .object({ sha: commitSchema })
    .parse(
      await jsonResponse(
        `https://api.github.com/repos/atlasacademy/fgo-game-data-api/commits/${info.serverHash}`,
        githubToken,
      ),
    );
  if (!resolved.sha.startsWith(info.serverHash))
    throw new TypeError('atlas_audit:api_commit_prefix_mismatch');
  await command('git', [
    'clone',
    '--quiet',
    '--filter=blob:none',
    '--depth=1',
    '--branch',
    'JP',
    'https://git.atlasacademy.io/atlasacademy/fgo-game-data.git',
    rawRepo,
  ]);
  rawCommit = commitSchema.parse(await command('git', ['-C', rawRepo, 'rev-parse', 'HEAD']));
  await command('git', [
    'clone',
    '--quiet',
    '--filter=blob:none',
    '--depth=1',
    'https://github.com/atlasacademy/fgo-game-data-api.git',
    exporterRepo,
  ]);
  if ((await command('git', ['-C', exporterRepo, 'rev-parse', 'HEAD'])) !== resolved.sha) {
    await command('git', [
      '-C',
      exporterRepo,
      'fetch',
      '--quiet',
      '--depth=1',
      'origin',
      resolved.sha,
    ]);
    await command('git', ['-C', exporterRepo, 'checkout', '--quiet', '--detach', resolved.sha]);
  }
  exporterCommit = commitSchema.parse(
    await command('git', ['-C', exporterRepo, 'rev-parse', 'HEAD']),
  );

  stage = 'replay-dependencies';
  await command(
    'python',
    ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt'],
    exporterRepo,
  );

  stage = 'capture';
  await command('pnpm', [
    '--filter',
    '@fgo-lab/data-audit',
    'capture-atlas-bodies',
    observedDirectory,
  ]);
  const references = await readdir(join(observedDirectory, 'referenced_skills'));
  const referenceIds = references.map((name) => {
    if (!/^[1-9][0-9]*\.json$/.test(name))
      throw new TypeError('atlas_audit:invalid_reference_filename');
    const id = Number(name.slice(0, -5));
    if (!Number.isSafeInteger(id)) throw new TypeError('atlas_audit:unsafe_reference_id');
    return id;
  });
  referenceIds.sort((left, right) => left - right);
  if (new Set(referenceIds).size !== referenceIds.length)
    throw new TypeError('atlas_audit:duplicate_reference_id');
  const referencePath = join(workspaceRoot, 'reference-ids.json');
  await writeFile(referencePath, JSON.stringify(referenceIds), { flag: 'wx' });

  stage = 'replay';
  await writeFile(
    join(exporterRepo, 'config.json'),
    JSON.stringify({
      data: {
        JP: {
          gamedata: rawRepo,
          postgresdsn: 'postgresql://atlas_audit:atlas_audit@127.0.0.1:5432/atlas_audit',
        },
      },
      redisdsn: 'redis://127.0.0.1:6379/0',
      redis_prefix: 'fgo_lab_atlas_audit',
      clear_redis_cache: true,
      write_postgres_data: true,
      write_redis_data: false,
      skip_script_fulltext: true,
      export_all_nice: false,
      asset_url: 'https://static.atlasacademy.io',
    }),
    { flag: 'wx' },
  );
  await command(
    'python',
    [
      resolve(root, 'apps/data-audit/replay_atlas_exports.py'),
      '--raw-repo',
      rawRepo,
      '--raw-commit',
      rawCommit,
      '--api-commit',
      exporterCommit,
      '--reference-ids',
      referencePath,
    ],
    exporterRepo,
    { ...process.env, PYTHONPATH: exporterRepo },
  );

  stage = 'acceptance';
  const observation = observationSchema.parse(
    JSON.parse(await readFile(join(observedDirectory, 'observation.json'), 'utf8')) as unknown,
  );
  const { certificate, evidence } = await issueCandidateCertificate({
    rawRepo,
    rawCommit,
    exporterRepo,
    exporterCommit,
    observedDirectory,
    replayDirectory: join(exporterRepo, 'export', 'JP'),
    observedAt: observation.observedAt,
    publishedAt: new Date().toISOString(),
    publisherCommit,
    contractSha256,
    generation: 1,
  });
  await writeFile(join(workspaceRoot, 'candidate.json'), `${JSON.stringify(certificate)}\n`, {
    flag: 'wx',
  });

  stage = 'publication';
  const publication = await publishCertificate({
    candidate: certificate,
    remote,
    workspace: publicationWorkspace,
    now: new Date(),
    publisherCommit,
    verifyDelivery: verifyCertificateDelivery,
    beforeHeartbeat: async () => {
      stage = 'notification';
      await monitor.resolve('audit-');
      stage = 'publication';
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      status: publication.status,
      generation: publication.certificate.generation,
      branchCommit: publication.branchCommit,
      rawCommit,
      exporterCommit,
      evidence,
    })}\n`,
  );
} catch (cause) {
  const detail = reason(cause);
  const summary = `Atlas JP ${stage} audit failed`;
  const source = `raw=${rawCommit || 'unknown'} api=${exporterCommit || 'unknown'}`;
  try {
    await monitor.reportFailure({
      key: `audit-${stage}`,
      title: summary,
      summary,
      details: detail,
      source,
      runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
    });
  } catch (notificationCause) {
    process.stderr.write(`atlas_audit:notification_failed:${reason(notificationCause)}\n`);
  }
  throw cause;
}
