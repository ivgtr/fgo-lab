#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectRepository } from './docs-integrity-lib.mjs';
import { writeManifestAtomically } from './quality-runner-lib.mjs';
import { verifyArtifactFiles } from './test-observation-lib.mjs';

const startedAt = new Date();
let root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let result;
let outcome;
let runDirectory;
const short = (value) => {
  const line = String(value).replace(/[\r\n]/g, ' ');
  return Buffer.byteLength(line) <= 2048
    ? line
    : `${Buffer.from(line).subarray(0, 2040).toString('utf8')}…`;
};
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !/^--root=.+$/.test(args[0])))
    throw new Error('usage: node scripts/docs-integrity.mjs [--root=<Git checkout>]');
  if (args.length) root = resolve(args[0].slice('--root='.length));
  try {
    result = inspectRepository(root);
    outcome = result.errors.length ? 'contract_failure' : 'success';
  } catch (cause) {
    result = { errors: [`${root}: inspector failure: ${cause.message}`], counts: null };
    outcome = 'inspector_failure';
  }
  const runId = `${startedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}-${randomBytes(3).toString('hex')}`;
  if (Object.hasOwn(process.env, 'FGO_QUALITY_RUN_DIR')) {
    if (!process.env.FGO_QUALITY_RUN_DIR) throw new Error('empty FGO_QUALITY_RUN_DIR');
    runDirectory = resolve(process.env.FGO_QUALITY_RUN_DIR, 'docs');
  } else runDirectory = resolve(root, '.test-results', runId);
  mkdirSync(resolve(runDirectory, '..'), { recursive: true });
  mkdirSync(runDirectory, { recursive: false });
  const pointer = `Artifacts: ${short(relative(root, runDirectory))}`;
  const header =
    outcome === 'success'
      ? `docs integrity passed (${result.counts.markdown} Markdown, ${result.counts.machineEvidence} machine evidence, ${result.counts.references} references)`
      : `docs integrity failed (${result.errors.length}; ${outcome})`;
  const summary =
    [
      header,
      ...result.errors.slice(0, 5).map((error) => `- ${short(error)}`),
      ...(result.errors.length > 5 ? [`... ${result.errors.length - 5} errors omitted`] : []),
      pointer,
    ].join('\n') + '\n';
  const stdout = outcome === 'success' ? summary : '';
  const stderr =
    outcome === 'success'
      ? ''
      : `${header}\n${result.errors.map((error) => `- ${error}`).join('\n')}\n${pointer}\n`;
  const content = {
    'diagnostics.json': `${JSON.stringify(result, null, 2)}\n`,
    'stdout.log': stdout,
    'stderr.log': stderr,
  };
  const specifications = [];
  for (const [path, text] of Object.entries(content)) {
    writeFileSync(resolve(runDirectory, path), text, { flag: 'wx' });
    specifications.push({
      path,
      format: path.endsWith('.json') ? 'json' : 'text',
      allowEmpty: !path.endsWith('.json'),
      expectedBytes: Buffer.byteLength(text),
      expectedSha256: createHash('sha256').update(text).digest('hex'),
    });
  }
  const verification = verifyArtifactFiles(runDirectory, specifications);
  if (verification.errors.length)
    throw new Error(`artifact verification: ${verification.errors.join(', ')}`);
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const index = git(['ls-files', '--stage', '-z']);
  const headResult = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  let head;
  if (headResult.status === 0) head = headResult.stdout.trim();
  else {
    const branch = git(['symbolic-ref', 'HEAD']).trim();
    const ref = spawnSync('git', ['show-ref', '--verify', '--quiet', branch], { cwd: root });
    if (ref.status !== 1) throw new Error('unable to read repository HEAD');
    head = null; // An indexed, unborn Git fixture has no commit identity.
  }
  writeManifestAtomically(resolve(runDirectory, 'manifest.json'), {
    manifestVersion: 1,
    command: { label: 'docs integrity', executable: process.execPath, args, suite: 'docs' },
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    outcome,
    exit: { kind: 'code', code: outcome === 'success' ? 0 : 1, signal: null },
    versions: { node: process.version },
    repository: {
      commit: head,
      headState: head === null ? 'unborn' : 'committed',
      dirty: git(['status', '--short']).length > 0,
      trackedIndexSha256: createHash('sha256').update(index).digest('hex'),
    },
    counts: result.counts,
    output: {
      truncated:
        result.errors.length > 5 || result.errors.some((error) => Buffer.byteLength(error) > 2048),
      summaryLimits: { lines: 10, bytes: 32768 },
    },
    artifactVerification: { errors: verification.errors },
    artifacts: verification.verified,
  });
  (outcome === 'success' ? process.stdout : process.stderr).write(summary);
  process.exitCode = outcome === 'success' ? 0 : 1;
} catch (cause) {
  process.stderr.write(
    `docs integrity failed (${result?.errors.length ?? 0}; artifact or CLI failure)\n${short(cause.message)}\n${runDirectory ? `Artifacts incomplete: ${short(runDirectory)}` : 'Artifacts unavailable'}\n`,
  );
  process.exitCode = 1;
}
