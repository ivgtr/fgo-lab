#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyQualityOutcome,
  qualityRunConfiguration,
  reconcileChildStep,
  verifyChildManifest,
  writeManifestAtomically,
} from './quality-runner-lib.mjs';
import { sha256File } from './test-observation-lib.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let configuration;
try {
  configuration = qualityRunConfiguration(process.argv.slice(2));
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exit(2);
}
const startedAt = new Date();
const runId = `${startedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}-${randomBytes(3).toString('hex')}`;
const runDirectory = resolve(root, '.test-results', runId);
mkdirSync(runDirectory, { recursive: true });
const manifestPath = resolve(runDirectory, 'manifest.json');

const steps = configuration.steps;

const repository = {
  commit: git(['rev-parse', 'HEAD']),
  dirty: (git(['status', '--short']) ?? 'unknown').length > 0,
};
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const manifest = {
  manifestVersion: 1,
  runId,
  command: configuration.command,
  profile: configuration.profile,
  startedAt: startedAt.toISOString(),
  durationMs: 0,
  outcome: 'running',
  exit: { kind: 'running', code: null, signal: null },
  versions: {
    node: process.version,
    pnpm: packageJson.packageManager ?? null,
    vitest: packageJson.devDependencies?.vitest ?? null,
    playwright: packageJson.devDependencies?.['@playwright/test'] ?? null,
  },
  repository,
  counts: { warnings: 0, unexpectedConsole: 0 },
  steps: [],
  children: {},
  artifactVerification: { errors: [] },
  artifacts: [],
};
writeManifest();

let activeChild;
let forwardedSignal = null;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    forwardedSignal = signal;
    if (activeChild?.pid) {
      try {
        process.kill(-activeChild.pid, signal);
      } catch {
        activeChild.kill(signal);
      }
    }
  });

for (const [id, scripts, childName] of steps) {
  const result = await runStep(id, scripts);
  manifest.steps.push(result);
  if (childName) {
    const child = verifyChildManifest(runDirectory, childName);
    child.reconciliationErrors = reconcileChildStep(result, child);
    manifest.children[childName] = child;
    manifest.counts.warnings += child.counts?.warnings ?? 0;
    manifest.counts.unexpectedConsole += child.counts?.unexpectedObservations ?? 0;
    if (
      (child.verificationErrors.length > 0 ||
        child.reconciliationErrors.length > 0 ||
        child.outcome !== 'success') &&
      result.code === 0
    )
      result.code = 1;
  }
  writeManifest();
  if (result.code !== 0 || result.signal || forwardedSignal) break;
}

const failedStep = manifest.steps.find((step) => step.code !== 0 || step.signal);
manifest.durationMs = Date.now() - startedAt.getTime();
manifest.outcome = classifyQualityOutcome({
  signal: forwardedSignal,
  failedStep,
  children: manifest.children,
});
manifest.exit = forwardedSignal
  ? { kind: 'signal', code: null, signal: forwardedSignal }
  : { kind: 'code', code: failedStep?.code ?? 0, signal: failedStep?.signal ?? null };
manifest.artifacts = collectArtifacts();
manifest.artifactVerification.errors = verifyParentArtifacts(manifest.artifacts);
if (manifest.artifactVerification.errors.length > 0) {
  manifest.outcome = 'artifact_failure';
  manifest.exit = { kind: 'code', code: 1, signal: null };
}
writeManifest();

if (manifest.outcome === 'success') {
  const unit = manifest.children.unit.counts.tests;
  const production = manifest.children.production?.counts.tests;
  const playwright = manifest.children.playwright?.counts.tests;
  process.stdout.write(
    [
      `PASS ${configuration.label}`,
      `Unit: ${unit.passed} passed, ${unit.skipped + unit.todo} skipped/todo`,
      ...(production
        ? [
            `Production: ${production.passed} passed, ${production.skipped + production.todo} skipped/todo`,
          ]
        : []),
      ...(playwright
        ? [
            `Playwright: ${playwright.passed} passed, ${playwright.skipped} skipped, ${playwright.retries} retries`,
          ]
        : []),
      `Duration: ${(manifest.durationMs / 1000).toFixed(2)}s`,
      `Warnings: ${manifest.counts.warnings}`,
      `Unexpected console: ${manifest.counts.unexpectedConsole}`,
      `Artifacts: ${relative(root, runDirectory)}`,
    ].join('\n') + '\n',
  );
} else {
  const failed = failedStep ?? manifest.steps.at(-1);
  const tail = failed
    ? `${readFileSync(resolve(runDirectory, 'steps', `${failed.id}.stdout.log`), 'utf8')}\n${readFileSync(resolve(runDirectory, 'steps', `${failed.id}.stderr.log`), 'utf8')}`
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-100)
    : [];
  process.stdout.write(
    boundFailure(
      [
        `FAIL ${configuration.label}`,
        `Status: ${manifest.outcome}`,
        ...(failed ? [`Step: ${failed.id} (code ${failed.code ?? '?'})`] : []),
        ...tail,
        `Artifacts: ${relative(root, runDirectory)}`,
      ].join('\n') + '\n',
    ),
  );
}
process.exitCode = manifest.outcome === 'success' ? 0 : failedStep?.code || 1;

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function writeManifest() {
  writeManifestAtomically(manifestPath, manifest);
}

async function runStep(id, scripts) {
  const stepDirectory = resolve(runDirectory, 'steps');
  mkdirSync(stepDirectory, { recursive: true });
  const stdoutPath = resolve(stepDirectory, `${id}.stdout.log`);
  const stderrPath = resolve(stepDirectory, `${id}.stderr.log`);
  const stepStartedAt = new Date();
  const stdout = [];
  const stderr = [];
  activeChild = spawn('pnpm', scripts, {
    cwd: root,
    env: { ...process.env, FGO_QUALITY_RUN_DIR: runDirectory },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  activeChild.stdout.on('data', (chunk) => stdout.push(chunk));
  activeChild.stderr.on('data', (chunk) => stderr.push(chunk));
  const processResult = await new Promise((resolveProcess) => {
    activeChild.once('error', (cause) =>
      resolveProcess({ code: 1, signal: null, error: cause.message }),
    );
    activeChild.once('close', (code, signal) => resolveProcess({ code, signal, error: null }));
  });
  activeChild = null;
  writeFileSync(stdoutPath, Buffer.concat(stdout));
  writeFileSync(stderrPath, Buffer.concat(stderr));
  return {
    id,
    command: ['pnpm', ...scripts],
    startedAt: stepStartedAt.toISOString(),
    durationMs: Date.now() - stepStartedAt.getTime(),
    code: processResult.code,
    signal: processResult.signal,
    error: processResult.error,
    artifacts: [relative(runDirectory, stdoutPath), relative(runDirectory, stderrPath)],
  };
}

function boundFailure(value) {
  const maxBytes = 32 * 1024;
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const artifactLine = value.trimEnd().split(/\r?\n/).at(-1);
  const suffix = `\n... output truncated\n${artifactLine}\n`;
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result + character + suffix) > maxBytes) break;
    result += character;
  }
  return result + suffix;
}

function collectArtifacts() {
  const artifacts = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (path === manifestPath || path === `${manifestPath}.tmp`) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile())
        artifacts.push({
          path: relative(runDirectory, path),
          bytes: statSync(path).size,
          sha256: sha256File(path),
        });
    }
  };
  visit(runDirectory);
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

function verifyParentArtifacts(artifacts) {
  return artifacts.flatMap((artifact) => {
    const path = resolve(runDirectory, artifact.path);
    if (!existsSync(path)) return [`${artifact.path}:missing`];
    if (statSync(path).size !== artifact.bytes) return [`${artifact.path}:bytes`];
    if (sha256File(path) !== artifact.sha256) return [`${artifact.path}:sha256`];
    return [];
  });
}
