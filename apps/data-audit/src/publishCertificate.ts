import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  atlasAuditStatusSchema,
  sourceCertificateSchema,
  type AtlasAuditStatus,
  type SourceCertificate,
} from '@fgo-lab/master-data';

const run = promisify(execFile);
const BRANCH = 'atlas-certificates';
const HEX_DIGEST = /^[0-9a-f]{64}$/;

async function git(...args: string[]): Promise<string> {
  const result = await run('git', args, { maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceIdentity(certificate: SourceCertificate): string {
  return digest(
    JSON.stringify({
      region: certificate.region,
      contractSha256: certificate.contractSha256,
      masterSchemaVersion: certificate.masterSchemaVersion,
      canonicalSha256: certificate.canonicalSha256,
      exports: certificate.exports,
      referencedSkills: certificate.referencedSkills,
    }),
  );
}

async function branchExists(remote: string): Promise<boolean> {
  try {
    await git('ls-remote', '--exit-code', '--heads', remote, BRANCH);
    return true;
  } catch (cause) {
    if ((cause as { code?: unknown }).code === 2) return false;
    throw cause;
  }
}

async function assertCertificateOnly(workspace: string): Promise<void> {
  const top = await readdir(workspace);
  if (top.some((name) => name !== '.git' && name !== 'JP'))
    throw new TypeError('atlas_publication:unexpected_branch_file');
  if (!top.includes('JP')) return;
  const names = await readdir(join(workspace, 'JP'));
  if (names.some((name) => name !== 'status.json' && !HEX_DIGEST.test(name.slice(0, -5))))
    throw new TypeError('atlas_publication:unexpected_certificate_file');
  if (names.some((name) => name !== 'status.json' && !name.endsWith('.json')))
    throw new TypeError('atlas_publication:unexpected_certificate_file');
}

export type CertificatePublication = {
  status: 'published' | 'unchanged';
  certificate: SourceCertificate;
  auditStatus: AtlasAuditStatus;
  branchCommit: string;
};

async function commitAndPush(workspace: string, message: string): Promise<void> {
  const changed = await git('-C', workspace, 'diff', '--cached', '--name-only');
  if (!changed) return;
  await git(
    '-C',
    workspace,
    '-c',
    'user.name=FGO Lab Atlas Audit',
    '-c',
    'user.email=atlas-audit@users.noreply.github.com',
    'commit',
    '--quiet',
    '-m',
    message,
  );
  // A concurrent branch update must fail instead of silently replacing its certificate.
  await git('-C', workspace, 'push', '--quiet', 'origin', `HEAD:refs/heads/${BRANCH}`);
}

/** The caller must pass a certificate from the successful independent issuer. */
export async function publishCertificate(input: {
  candidate: SourceCertificate;
  remote: string;
  workspace: string;
  now: Date;
  publisherCommit: string;
  verifyDelivery: (certificate: SourceCertificate) => Promise<void>;
  beforeHeartbeat: () => Promise<void>;
}): Promise<CertificatePublication> {
  const candidate = sourceCertificateSchema.parse(input.candidate);
  if (candidate.publisherCommit !== input.publisherCommit)
    throw new TypeError('atlas_publication:publisher_commit_mismatch');
  if (Number.isNaN(input.now.getTime()) || input.now.getTime() < Date.parse(candidate.observedAt))
    throw new TypeError('atlas_publication:invalid_audit_time');
  const exists = await branchExists(input.remote);
  if (exists)
    await git(
      'clone',
      '--quiet',
      '--single-branch',
      '--branch',
      BRANCH,
      input.remote,
      input.workspace,
    );
  else {
    await git('init', '--quiet', '--initial-branch', BRANCH, input.workspace);
    await git('-C', input.workspace, 'remote', 'add', 'origin', input.remote);
  }
  await assertCertificateOnly(input.workspace);
  const directory = join(input.workspace, 'JP');
  await mkdir(directory, { recursive: true });
  const certificatePath = join(directory, `${candidate.contractSha256}.json`);
  let current: SourceCertificate | undefined;
  try {
    current = sourceCertificateSchema.parse(
      JSON.parse(await readFile(certificatePath, 'utf8')) as unknown,
    );
  } catch (cause) {
    if ((cause as { code?: unknown }).code !== 'ENOENT') throw cause;
  }
  if (current && current.contractSha256 !== candidate.contractSha256)
    throw new TypeError('atlas_publication:contract_mismatch');
  let certificate: SourceCertificate;
  let unchanged = false;
  if (current && sourceIdentity(current) === sourceIdentity(candidate)) {
    certificate = current;
    unchanged = true;
  } else {
    certificate = sourceCertificateSchema.parse({
      ...candidate,
      generation: current ? current.generation + 1 : 1,
      publishedAt: input.now.toISOString(),
    });
  }
  if (!unchanged)
    await writeFile(certificatePath, `${JSON.stringify(certificate)}\n`, {
      flag: current ? 'w' : 'wx',
    });
  if (!unchanged) {
    await git('-C', input.workspace, 'add', '--', certificatePath);
    await commitAndPush(
      input.workspace,
      `Certify JP Atlas source ${String(certificate.generation)}`,
    );
  }
  // The heartbeat advances only after the public endpoint serves the exact certificate.
  await input.verifyDelivery(certificate);
  await input.beforeHeartbeat();
  const auditStatus = atlasAuditStatusSchema.parse({
    format: 'fgo-lab-atlas-audit-status-v1',
    region: 'JP',
    auditedAt: input.now.toISOString(),
    observedAt: candidate.observedAt,
    rawCommit: candidate.rawCommit,
    exporterCommit: candidate.exporterCommit,
    publisherCommit: input.publisherCommit,
    contractSha256: candidate.contractSha256,
    certificateGeneration: certificate.generation,
    certificateSha256: digest(JSON.stringify(certificate)),
  });
  await writeFile(join(directory, 'status.json'), `${JSON.stringify(auditStatus)}\n`);
  await git('-C', input.workspace, 'add', '--', 'JP/status.json');
  await commitAndPush(input.workspace, `Audit JP Atlas source ${String(certificate.generation)}`);
  return {
    status: unchanged ? 'unchanged' : 'published',
    certificate,
    auditStatus,
    branchCommit: await git('-C', input.workspace, 'rev-parse', 'HEAD'),
  };
}
