import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { sourceCertificateSchema } from '@fgo-lab/master-data';
import { ManagedAtlasIssues } from '@fgo-lab/atlas-monitor';
import { publishCertificate } from './publishCertificate';
import { verifyCertificateDelivery } from './verifyCertificateDelivery';

const run = promisify(execFile);
const [candidatePath, remote, workspace, ...extra] = process.argv.slice(2);
if (!candidatePath || !remote || !workspace || extra.length)
  throw new TypeError(
    'usage: publish-certificate <issued-candidate-json> <git-remote> <new-workspace>',
  );
const [head, status] = await Promise.all([
  run('git', ['rev-parse', 'HEAD']),
  run('git', ['status', '--porcelain', '--untracked-files=normal']),
]);
if (status.stdout.trim()) throw new TypeError('atlas_publication:dirty_publisher_checkout');
const candidate = sourceCertificateSchema.parse(
  JSON.parse(await readFile(candidatePath, 'utf8')) as unknown,
);
const githubToken = process.env['GITHUB_TOKEN'];
const repository = process.env['GITHUB_REPOSITORY'];
if (!githubToken || repository !== 'ivgtr/fgo-lab')
  throw new TypeError('atlas_publication:missing_monitor_identity');
const monitor = new ManagedAtlasIssues(githubToken, repository);
const result = await publishCertificate({
  candidate,
  remote,
  workspace,
  now: new Date(),
  publisherCommit: head.stdout.trim(),
  verifyDelivery: verifyCertificateDelivery,
  beforeHeartbeat: async () => {
    await monitor.resolve('audit-');
  },
});
process.stdout.write(
  `${JSON.stringify({
    status: result.status,
    generation: result.certificate.generation,
    certificateSha256: result.auditStatus.certificateSha256,
    branchCommit: result.branchCommit,
  })}\n`,
);
