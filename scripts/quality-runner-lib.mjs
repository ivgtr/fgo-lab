import { existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { readJson, sha256File } from './test-observation-lib.mjs';

const QUALITY_STEPS = [
  ['format', ['format:check']],
  ['lint', ['lint']],
  ['typecheck', ['typecheck']],
  ['runner', ['test:runner']],
  ['docs', ['test:docs']],
  ['unit', ['test:unit'], 'unit'],
  ['production', ['test:production'], 'production'],
  ['master', ['validate:master']],
  ['build', ['build']],
  ['browser-observer', ['test:browser-observer']],
  ['playwright', ['test:e2e'], 'playwright'],
];

const QUICK_STEP_IDS = new Set(['format', 'lint', 'typecheck', 'runner', 'docs', 'unit', 'build']);
const BROWSER_STEP_IDS = new Set(['browser-observer', 'playwright']);

export function qualityRunConfiguration(arguments_) {
  if (arguments_.length === 0)
    return { profile: 'full', command: 'pnpm quality', label: 'quality', steps: QUALITY_STEPS };
  if (arguments_.length === 1 && arguments_[0] === '--profile=quick')
    return {
      profile: 'quick',
      command: 'pnpm check',
      label: 'check',
      steps: QUALITY_STEPS.filter(([id]) => QUICK_STEP_IDS.has(id)),
    };
  if (arguments_.length === 1 && arguments_[0] === '--profile=ci')
    return {
      profile: 'ci',
      command: 'pnpm quality:ci',
      label: 'quality:ci',
      steps: QUALITY_STEPS.filter(([id]) => !BROWSER_STEP_IDS.has(id)),
    };
  throw new Error('usage: pnpm quality | pnpm quality:ci | pnpm check');
}

export function verifyChildManifest(runDirectory, name) {
  const childManifestPath = resolve(runDirectory, name, 'manifest.json');
  const verificationErrors = [];
  if (!existsSync(childManifestPath))
    return { manifest: relative(runDirectory, childManifestPath), verificationErrors: ['missing'] };
  let child;
  try {
    child = readJson(childManifestPath);
  } catch (cause) {
    return {
      manifest: relative(runDirectory, childManifestPath),
      verificationErrors: [cause instanceof Error ? cause.message : String(cause)],
    };
  }
  for (const artifact of child.artifacts ?? []) {
    const path = resolve(runDirectory, name, artifact.path);
    if (!existsSync(path)) verificationErrors.push(`${artifact.path}:missing`);
    else if (statSync(path).size !== artifact.bytes)
      verificationErrors.push(`${artifact.path}:bytes`);
    else if (sha256File(path) !== artifact.sha256)
      verificationErrors.push(`${artifact.path}:sha256`);
  }
  return {
    manifest: relative(runDirectory, childManifestPath),
    command: child.command,
    versions: child.versions,
    repository: child.repository,
    durationMs: child.durationMs,
    outcome: child.outcome,
    exit: child.exit,
    counts: child.counts,
    artifacts: child.artifacts,
    verificationErrors,
  };
}

export function reconcileChildStep(step, child) {
  const errors = [];
  const processSignaled = typeof step.signal === 'string' && step.signal.length > 0;
  const processSucceeded = !processSignaled && step.code === 0;
  const manifestSucceeded = child.outcome === 'success';
  if (processSignaled && manifestSucceeded)
    errors.push(`process_signal_with_manifest_success:${step.signal}`);
  else if (!processSucceeded && manifestSucceeded)
    errors.push('process_nonzero_with_manifest_success');
  else if (processSucceeded && !manifestSucceeded)
    errors.push(`process_success_with_manifest_failure:${child.outcome ?? 'missing'}`);
  if (
    manifestSucceeded &&
    (child.exit?.kind !== 'code' || child.exit.code !== 0 || child.exit.signal !== null)
  )
    errors.push('manifest_success_with_nonzero_exit');
  return errors;
}

export function classifyQualityOutcome({ signal, failedStep, children }) {
  if (signal) return 'signal';
  if (failedStep?.signal) return 'signal';
  if (Object.values(children).some((child) => child.verificationErrors.length > 0))
    return 'artifact_failure';
  if (Object.values(children).some((child) => child.reconciliationErrors?.length > 0))
    return 'process_manifest_mismatch';
  if (!failedStep) return 'success';
  return children[failedStep.id]?.outcome ?? 'step_failure';
}

export function writeManifestAtomically(manifestPath, manifest) {
  const temporary = `${manifestPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(temporary, manifestPath);
}
