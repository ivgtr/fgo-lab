import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  classifyObservations,
  readJson,
  readJsonLines,
  verifyArtifactFiles,
} from './test-observation-lib.mjs';

const MAX_SUMMARY_LINES = 200;
const MAX_SUMMARY_BYTES = 32 * 1024;
const MAX_FAILURES = 5;
const ABNORMAL_TAIL_LINES = 100;

export const PRODUCTION_RUNTIME_COUNTER_CONTRACT = {
  'calculation-application': {
    masterReadCount: 1,
    masterParseCount: 1,
    compileCount: 1,
    candidateCount: 8_661,
    deduplicatedCandidateCount: 8_651,
    damageRequestCount: 7_255,
    distinctDamageRequestCount: 1_627,
  },
  'data-pipeline': {
    masterReadCount: 1,
    masterParseCount: 1,
    compileCount: 1,
    candidateCount: 0,
    damageRequestCount: 0,
  },
};

function createRunId(now = new Date()) {
  return `${now.toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}-${randomBytes(3).toString('hex')}`;
}

function gitValue(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function repositoryIdentity(root) {
  return {
    commit: gitValue(root, ['rev-parse', 'HEAD']),
    dirty: (gitValue(root, ['status', '--short']) ?? 'unknown').length > 0,
  };
}

function packageVersions(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return {
    node: process.version,
    pnpm: packageJson.packageManager ?? null,
    vitest: packageJson.devDependencies?.vitest ?? null,
    playwright: packageJson.devDependencies?.['@playwright/test'] ?? null,
  };
}

function parseReport(reportPath) {
  try {
    return { report: JSON.parse(readFileSync(reportPath, 'utf8')), error: null };
  } catch (cause) {
    return {
      report: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function runtimeCounterArtifacts(runDirectory) {
  return readdirSync(runDirectory)
    .filter((name) => /^production-audit-[a-z-]+\.json$/.test(name))
    .sort()
    .map((name) => {
      try {
        const artifact = JSON.parse(readFileSync(resolve(runDirectory, name), 'utf8'));
        const validBoundary = typeof artifact.boundary === 'string' && artifact.boundary.length > 0;
        const validCounters =
          artifact.runtimeCounters &&
          typeof artifact.runtimeCounters === 'object' &&
          !Array.isArray(artifact.runtimeCounters) &&
          Object.keys(artifact.runtimeCounters).length > 0 &&
          Object.values(artifact.runtimeCounters).every(
            (value) => Number.isSafeInteger(value) && value >= 0,
          );
        return {
          artifact: name,
          boundary: validBoundary ? artifact.boundary : null,
          counters: validCounters ? artifact.runtimeCounters : null,
          error: !validBoundary
            ? 'invalid_runtime_counter_boundary'
            : validCounters
              ? null
              : 'invalid_runtime_counters',
        };
      } catch (cause) {
        return {
          artifact: name,
          boundary: null,
          counters: null,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    });
}

function runtimeCounterContractErrors(artifacts, requiredCounters) {
  if (!requiredCounters) return [];
  const errors = artifacts.flatMap(({ artifact, error }) =>
    error ? [`${artifact}:${error}`] : [],
  );
  for (const [boundary, expectedCounters] of Object.entries(requiredCounters)) {
    const matches = artifacts.filter((artifact) => artifact.boundary === boundary);
    if (matches.length !== 1) {
      errors.push(`${boundary}:expected_one_artifact:received_${matches.length}`);
      continue;
    }
    const counters = matches[0].counters;
    if (!counters) continue;
    for (const [name, expected] of Object.entries(expectedCounters)) {
      if (!Object.hasOwn(counters, name)) {
        errors.push(`${boundary}:missing_counter:${name}`);
        continue;
      }
      if (counters[name] !== expected)
        errors.push(
          `${boundary}:counter_mismatch:${name}:expected_${expected}:received_${counters[name]}`,
        );
    }
    for (const name of Object.keys(counters))
      if (!Object.hasOwn(expectedCounters, name))
        errors.push(`${boundary}:unexpected_counter:${name}`);
  }
  return errors;
}

function reportCounts(report, resultKind) {
  if (resultKind === 'playwright') {
    const counts = report?.counts;
    return {
      files: {
        total: report ? Object.keys(report.projects ?? {}).length : null,
        passed: report
          ? Object.values(report.projects ?? {}).filter(({ failed }) => failed === 0).length
          : null,
        failed: report
          ? Object.values(report.projects ?? {}).filter(({ failed }) => failed > 0).length
          : null,
        skipped: 0,
      },
      tests: {
        total: counts?.total ?? null,
        passed: counts?.passed ?? null,
        failed: counts?.failed ?? null,
        skipped: counts?.skipped ?? null,
        todo: 0,
        retries: counts?.retries ?? null,
        flaky: counts?.flaky ?? null,
      },
    };
  }
  const testResults = report?.testResults ?? [];
  return {
    files: {
      total: report ? testResults.length : null,
      passed: report ? testResults.filter(({ status }) => status === 'passed').length : null,
      failed: report ? testResults.filter(({ status }) => status === 'failed').length : null,
      skipped: report
        ? testResults.filter(({ status }) => status === 'pending' || status === 'skipped').length
        : null,
    },
    tests: {
      total: report?.numTotalTests ?? null,
      passed: report?.numPassedTests ?? null,
      failed: report?.numFailedTests ?? null,
      skipped: report?.numPendingTests ?? null,
      todo: report?.numTodoTests ?? null,
    },
  };
}

function outcomeFor({
  code,
  signal,
  timedOut,
  runnerError,
  report,
  reportError,
  runtimeCounterErrors,
  observationErrors,
  artifactErrors,
  resultKind,
}) {
  if (runnerError) return 'runner_failure';
  if (timedOut) return 'timeout';
  if (signal) return 'signal';
  if (!report) return code === 0 ? 'reporter_failure' : 'test_failure';
  if (artifactErrors.length > 0) return 'artifact_failure';
  if (
    code !== 0 ||
    (resultKind === 'vitest' && report.success === false) ||
    (resultKind === 'playwright' && report.status !== 'passed')
  )
    return 'test_failure';
  if (runtimeCounterErrors.length > 0) return 'contract_failure';
  if (observationErrors.length > 0) return 'contract_failure';
  if (
    (resultKind === 'vitest' &&
      ((report.numPendingTests ?? 0) > 0 || (report.numTodoTests ?? 0) > 0)) ||
    (resultKind === 'playwright' &&
      ((report.counts?.skipped ?? 0) > 0 ||
        (report.counts?.retries ?? 0) > 0 ||
        (report.counts?.flaky ?? 0) > 0))
  )
    return 'contract_failure';
  return reportError ? 'reporter_failure' : 'success';
}

function prefixWithinBytes(value, maxBytes) {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  const characters = Array.from(value);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(characters.slice(0, middle).join('')) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return characters.slice(0, low).join('');
}

function bounded(lines) {
  const physicalLines = lines.flatMap((line) => String(line).split(/\r?\n/));
  let truncated = physicalLines.length > MAX_SUMMARY_LINES;
  const artifactLine = prefixWithinBytes(physicalLines.at(-1) ?? '', 4 * 1024);
  let selected = physicalLines;
  if (physicalLines.length > MAX_SUMMARY_LINES) {
    const keptBodyLines = MAX_SUMMARY_LINES - 2;
    const omitted = physicalLines.length - keptBodyLines - 1;
    selected = [
      ...physicalLines.slice(0, keptBodyLines),
      `... ${omitted} lines omitted`,
      artifactLine,
    ];
  } else if (physicalLines.length > 0) {
    selected = [...physicalLines.slice(0, -1), artifactLine];
  }

  let text = `${selected.join('\n')}\n`;
  if (Buffer.byteLength(text) > MAX_SUMMARY_BYTES) {
    truncated = true;
    const marker = '... output truncated';
    const suffix = `\n${artifactLine}\n`;
    const available = Math.max(
      0,
      MAX_SUMMARY_BYTES - Buffer.byteLength(marker) - Buffer.byteLength(suffix),
    );
    const body = selected.slice(0, -1).join('\n');
    text = `${prefixWithinBytes(body, available)}${marker}${suffix}`;
  }
  return { text, truncated };
}

function failedAssertions(report, resultKind) {
  if (resultKind === 'playwright')
    return (report?.tests ?? [])
      .filter(({ status }) => ['failed', 'timedOut', 'interrupted'].includes(status))
      .map((test) => ({
        suite: test.titlePath?.slice(0, -1).join(' > ') ?? test.project,
        name: test.titlePath?.join(' > ') ?? test.title,
        messages: test.errors?.map(({ message }) => message).filter(Boolean) ?? [],
      }));
  return (report?.testResults ?? []).flatMap((suite) =>
    (suite.assertionResults ?? [])
      .filter(({ status }) => status === 'failed')
      .map((assertion) => ({
        suite: suite.name,
        name: assertion.fullName ?? assertion.title,
        messages: assertion.failureMessages ?? [],
      })),
  );
}

function displayPath(root, path) {
  const local = relative(root, path);
  return local.startsWith('..') ? path : local;
}

function artifactFiles(runDirectory, directories) {
  const files = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile())
        files.push({
          path: relative(runDirectory, path),
          format: entry.name.endsWith('.json') ? 'json' : 'binary',
          allowEmpty: false,
        });
    }
  };
  for (const directory of directories) visit(resolve(runDirectory, directory));
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function declaredArtifactFiles(report, runDirectory, reservedPaths) {
  const contractKey = 'fgoProductionAuditArtifacts';
  const artifacts = [];
  const errors = [];
  const paths = new Set();
  for (const [suiteIndex, suite] of (report?.testResults ?? []).entries()) {
    for (const [testIndex, assertion] of (suite.assertionResults ?? []).entries()) {
      const meta = assertion.meta;
      if (
        !meta ||
        typeof meta !== 'object' ||
        Array.isArray(meta) ||
        !Object.hasOwn(meta, contractKey)
      )
        continue;
      const label = `vitest.json:${String(suiteIndex)}:${String(testIndex)}`;
      const contract = meta[contractKey];
      if (
        !contract ||
        typeof contract !== 'object' ||
        Array.isArray(contract) ||
        Object.keys(contract).some(
          (key) => !['version', 'requiredArtifacts', 'receipts'].includes(key),
        ) ||
        contract.version !== 2 ||
        !Array.isArray(contract.requiredArtifacts) ||
        !Array.isArray(contract.receipts)
      ) {
        errors.push(`${label}:invalid_artifact_contract`);
        continue;
      }
      const active = assertion.status === 'passed' || assertion.status === 'failed';
      const requiredPaths = new Set();
      for (const [index, descriptor] of contract.requiredArtifacts.entries()) {
        if (
          !descriptor ||
          typeof descriptor !== 'object' ||
          Array.isArray(descriptor) ||
          Object.keys(descriptor).some((key) => !['path', 'format', 'allowEmpty'].includes(key)) ||
          typeof descriptor.path !== 'string' ||
          descriptor.path.length === 0 ||
          descriptor.format !== 'json-gzip' ||
          descriptor.allowEmpty !== false
        ) {
          errors.push(`${label}:required_artifact_${String(index)}_invalid`);
          continue;
        }
        const normalized = normalizeDeclaredArtifactPath(descriptor.path, runDirectory);
        if (!normalized.path) {
          errors.push(`${label}:required_artifact_${String(index)}_${normalized.error}`);
          continue;
        }
        const path = normalized.path;
        if (requiredPaths.has(path)) {
          errors.push(`${label}:duplicate_required_path:${path}`);
          continue;
        }
        requiredPaths.add(path);
        if (!active) continue;
        if (reservedPaths.has(path)) {
          errors.push(`${label}:reserved_path:${path}`);
          continue;
        }
        if (paths.has(path)) {
          errors.push(`${label}:duplicate_path:${path}`);
          continue;
        }
        paths.add(path);
        artifacts.push({ path, format: 'json-gzip', allowEmpty: false });
      }
      const receiptsByPath = new Map();
      for (const [index, receipt] of contract.receipts.entries()) {
        if (
          !receipt ||
          typeof receipt !== 'object' ||
          Array.isArray(receipt) ||
          Object.keys(receipt).some(
            (key) =>
              ![
                'path',
                'expectedBytes',
                'expectedSha256',
                'expectedDecodedBytes',
                'expectedDecodedSha256',
              ].includes(key),
          ) ||
          typeof receipt.path !== 'string' ||
          !Number.isSafeInteger(receipt.expectedBytes) ||
          receipt.expectedBytes < 0 ||
          typeof receipt.expectedSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(receipt.expectedSha256) ||
          !Number.isSafeInteger(receipt.expectedDecodedBytes) ||
          receipt.expectedDecodedBytes <= 0 ||
          typeof receipt.expectedDecodedSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(receipt.expectedDecodedSha256)
        ) {
          errors.push(`${label}:receipt_${String(index)}_invalid`);
          continue;
        }
        const normalized = normalizeDeclaredArtifactPath(receipt.path, runDirectory);
        if (!normalized.path) {
          errors.push(`${label}:receipt_${String(index)}_${normalized.error}`);
          continue;
        }
        const path = normalized.path;
        if (receiptsByPath.has(path)) errors.push(`${label}:duplicate_receipt:${path}`);
        else receiptsByPath.set(path, receipt);
      }
      if (active) {
        for (const path of requiredPaths)
          if (!receiptsByPath.has(path)) errors.push(`${label}:receipt_missing:${path}`);
        for (const path of receiptsByPath.keys())
          if (!requiredPaths.has(path)) errors.push(`${label}:receipt_unexpected:${path}`);
        for (const path of requiredPaths) {
          const receipt = receiptsByPath.get(path);
          if (receipt && artifacts.some((artifact) => artifact.path === path)) {
            const root = resolve(runDirectory);
            const target = resolve(root, ...path.split('/'));
            if (hasSymlinkBetween(root, target)) errors.push(`${label}:symlink_path:${path}`);
            artifacts[artifacts.findIndex((artifact) => artifact.path === path)] = {
              path,
              format: 'json-gzip',
              allowEmpty: false,
              expectedBytes: receipt.expectedBytes,
              expectedSha256: receipt.expectedSha256,
              expectedDecodedBytes: receipt.expectedDecodedBytes,
              expectedDecodedSha256: receipt.expectedDecodedSha256,
            };
          }
        }
      }
    }
  }
  return { artifacts, errors };
}

function normalizeDeclaredArtifactPath(path, runDirectory) {
  if (isAbsolute(path) || path.includes('\\')) return { error: 'outside_run_directory' };
  const resolvedPath = resolve(runDirectory, path);
  const localPath = relative(runDirectory, resolvedPath).split(sep).join('/');
  if (localPath === '.' || localPath === '..' || localPath.startsWith('../'))
    return { error: 'outside_run_directory' };
  if (localPath.split('/').some((segment) => segment === '.' || segment === '..'))
    return { error: 'invalid_path' };
  return { path: localPath };
}

function hasSymlinkBetween(root, target) {
  const localPath = relative(root, target);
  if (localPath === '..' || localPath.startsWith(`..${sep}`)) return true;
  let current = root;
  for (const segment of localPath.split(sep)) {
    current = resolve(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) return true;
    } catch (cause) {
      if (cause?.code !== 'ENOENT') return true;
      break;
    }
  }
  return false;
}

function playwrightAttachmentArtifacts(report, runDirectory) {
  const artifacts = [];
  const errors = [];
  for (const test of report?.tests ?? []) {
    for (const [index, attachment] of (test.attachments ?? []).entries()) {
      if (attachment.inline) continue;
      const identity = `${test.id ?? test.title ?? '<test>'}:attachments[${index}]`;
      if (typeof attachment.path !== 'string' || attachment.path.length === 0) {
        errors.push(`${identity}:missing_path`);
        continue;
      }
      const resolvedPath = resolve(runDirectory, attachment.path);
      const localPath = relative(runDirectory, resolvedPath).split(sep).join('/');
      if (localPath === '..' || localPath.startsWith('../')) {
        errors.push(`${identity}:outside_run_directory`);
        continue;
      }
      if (!localPath.startsWith('playwright-artifacts/')) {
        errors.push(`${identity}:unexpected_location:${localPath}`);
        continue;
      }
      if (!Number.isSafeInteger(attachment.bytes) || attachment.bytes < 0) {
        errors.push(`${identity}:invalid_bytes`);
        continue;
      }
      if (typeof attachment.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(attachment.sha256)) {
        errors.push(`${identity}:invalid_sha256`);
        continue;
      }
      artifacts.push({
        path: localPath,
        format: 'binary',
        allowEmpty: attachment.bytes === 0,
        expectedBytes: attachment.bytes,
        expectedSha256: attachment.sha256,
      });
    }
  }
  return { artifacts, errors };
}

function formatSummary({ manifest, report, tail, tailWasTrimmed, root, runDirectory }) {
  const counts = manifest.counts;
  const status = manifest.outcome === 'success' ? 'PASS' : 'FAIL';
  let semanticallyTruncated = false;
  const lines = [
    `${status} ${manifest.command.label}`,
    `Status: ${manifest.outcome} (${manifest.exit.kind}${manifest.exit.code === null ? '' : ` ${manifest.exit.code}`}${manifest.exit.signal ? ` ${manifest.exit.signal}` : ''})`,
    `Files: ${counts.files.passed ?? '?'} passed, ${counts.files.failed ?? '?'} failed, ${counts.files.skipped ?? 0} skipped`,
    `Tests: ${counts.tests.passed ?? '?'} passed, ${counts.tests.failed ?? '?'} failed, ${(counts.tests.skipped ?? 0) + (counts.tests.todo ?? 0)} skipped/todo`,
    `Duration: ${(manifest.durationMs / 1000).toFixed(2)}s`,
    `Warnings: ${manifest.counts.warnings}`,
  ];

  if (manifest.outcome === 'success') {
    lines.splice(1, 1);
  } else if (manifest.outcome === 'test_failure') {
    const failures = failedAssertions(
      report,
      manifest.reporter.format === 'playwright-observation-json' ? 'playwright' : 'vitest',
    );
    if (failures.length > 0) lines.push('Failures:');
    for (const [index, failure] of failures.slice(0, MAX_FAILURES).entries()) {
      lines.push(`${index + 1}. ${failure.name} (${displayPath(root, failure.suite)})`);
      for (const message of failure.messages) lines.push(...message.split(/\r?\n/).slice(0, 20));
    }
    if (failures.length > MAX_FAILURES) {
      semanticallyTruncated = true;
      lines.push(`... ${failures.length - MAX_FAILURES} failures omitted`);
    }
    if (failures.length === 0) {
      lines.push('No structured assertion failure was available.');
      if (manifest.reporter.error) lines.push(`Reporter: ${manifest.reporter.error}`);
      lines.push('Last output:');
      semanticallyTruncated ||= tailWasTrimmed || tail.length > ABNORMAL_TAIL_LINES;
      lines.push(...tail.slice(-ABNORMAL_TAIL_LINES));
    }
  } else if (
    manifest.outcome === 'contract_failure' &&
    manifest.runtimeCounterContract.errors.length > 0
  ) {
    lines.push('Runtime counter contract failures:');
    lines.push(...manifest.runtimeCounterContract.errors);
  } else if (
    manifest.outcome === 'contract_failure' &&
    manifest.observations.unexpected.length > 0
  ) {
    lines.push('Unexpected observations:');
    lines.push(
      ...manifest.observations.unexpected
        .slice(0, MAX_FAILURES)
        .map(({ testId, kind, message }) => `${testId}: ${kind}: ${message}`),
    );
  } else if (
    manifest.outcome === 'contract_failure' &&
    manifest.observations.infrastructureErrors.length > 0
  ) {
    lines.push('Test-server infrastructure contract failures:');
    lines.push(...manifest.observations.infrastructureErrors.slice(0, MAX_FAILURES));
  } else if (manifest.outcome === 'artifact_failure') {
    lines.push('Artifact contract failures:');
    lines.push(...manifest.artifactVerification.errors);
  } else {
    if (manifest.runner.error) lines.push(`Runner: ${manifest.runner.error}`);
    if (manifest.reporter.error) lines.push(`Reporter: ${manifest.reporter.error}`);
    lines.push('Last output:');
    semanticallyTruncated ||= tailWasTrimmed || tail.length > ABNORMAL_TAIL_LINES;
    lines.push(...tail.slice(-ABNORMAL_TAIL_LINES));
  }
  lines.push(`Artifacts: ${displayPath(root, runDirectory)}`);
  const result = bounded(lines);
  result.truncated ||= semanticallyTruncated;
  return result;
}

export async function runCapturedTest(options) {
  const {
    root,
    mode = 'compact',
    command,
    args,
    commandLabel,
    suite = 'all',
    timeoutMs,
    artifactRoot = resolve(root, '.test-results'),
    runId = createRunId(),
    extraEnv = {},
    forwardSignals = false,
    requiredRuntimeCounters = null,
    resultKind = 'vitest',
    reportName = resultKind === 'vitest' ? 'vitest.json' : 'playwright.json',
    observationName = resultKind === 'vitest' ? 'observations.json' : null,
    allowancePath = resolve(root, 'scripts/test-observation-allowances.json'),
    additionalArtifacts = [],
    additionalArtifactDirectories = [],
    unsetEnv = [],
  } = options;
  const startedAt = new Date();
  const runDirectory = resolve(artifactRoot, runId);
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(runDirectory, { recursive: false });
  const reportPath = resolve(runDirectory, reportName);
  const observationPath = observationName ? resolve(runDirectory, observationName) : null;
  const warningPath = resolve(runDirectory, 'warnings.jsonl');
  const stdoutPath = resolve(runDirectory, 'stdout.log');
  const stderrPath = resolve(runDirectory, 'stderr.log');
  const manifestPath = resolve(runDirectory, 'manifest.json');
  const stdoutChunks = [];
  const stderrChunks = [];
  const tail = [];
  let partialStdout = '';
  let partialStderr = '';
  let timedOut = false;
  let tailWasTrimmed = false;
  writeFileSync(warningPath, '');

  const appendTail = (kind, chunk) => {
    const text = chunk.toString();
    if (kind === 'stdout') stdoutChunks.push(text);
    else stderrChunks.push(text);
    const current = kind === 'stdout' ? partialStdout : partialStderr;
    const parts = `${current}${text}`.split(/\r?\n/);
    if (kind === 'stdout') partialStdout = parts.pop() ?? '';
    else partialStderr = parts.pop() ?? '';
    tail.push(...parts.map((line) => `${kind}: ${line}`));
    if (tail.length > ABNORMAL_TAIL_LINES * 2) {
      tailWasTrimmed = true;
      tail.splice(0, tail.length - ABNORMAL_TAIL_LINES * 2);
    }
  };

  const resolvedArgs = args.map((argument) =>
    argument.replaceAll('$FGO_TEST_REPORT_PATH', reportPath),
  );
  const resolvedExtraEnv = Object.fromEntries(
    Object.entries(extraEnv).map(([name, value]) => [
      name,
      String(value)
        .replaceAll('$FGO_TEST_ARTIFACT_DIR', runDirectory)
        .replaceAll('$FGO_TEST_REPORT_PATH', reportPath),
    ]),
  );
  if (resolvedExtraEnv.FGO_BROWSER_OBSERVATION_PATH)
    writeFileSync(resolvedExtraEnv.FGO_BROWSER_OBSERVATION_PATH, '');
  const detached = forwardSignals && process.platform !== 'win32';
  let child;
  let forceKillTimer;
  let timer;
  let terminateChild = () => {};
  const forwardedSignals = new Map();
  let processResult;
  try {
    const childEnv = {
      ...process.env,
      ...resolvedExtraEnv,
      FGO_TEST_REPORT_PATH: reportPath,
      FGO_TEST_ARTIFACT_DIR: runDirectory,
      FGO_TEST_OBSERVATION_PATH: observationPath ?? '',
      FGO_TEST_WARNING_PATH: warningPath,
      FGO_TEST_RUNNER_KIND: resultKind,
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require=${resolve(root, 'scripts/node-warning-observer.cjs')}`,
        '--no-warnings',
      ]
        .filter(Boolean)
        .join(' '),
    };
    for (const name of unsetEnv) delete childEnv[name];
    child = spawn(command, resolvedArgs, {
      cwd: root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached,
    });
    terminateChild = (signal) => {
      if (detached) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // The process group may already have exited between the close check and signal delivery.
        }
      }
      child.kill(signal);
    };
    if (forwardSignals) {
      for (const signal of ['SIGINT', 'SIGTERM']) {
        const handler = () => terminateChild(signal);
        forwardedSignals.set(signal, handler);
        process.on(signal, handler);
      }
    }
    child.stdout.on('data', (chunk) => {
      appendTail('stdout', chunk);
      if (mode === 'diagnostic') process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      appendTail('stderr', chunk);
      if (mode === 'diagnostic') process.stderr.write(chunk);
    });

    timer = setTimeout(() => {
      timedOut = true;
      terminateChild('SIGTERM');
      forceKillTimer = setTimeout(() => terminateChild('SIGKILL'), 2_000);
      forceKillTimer.unref();
    }, timeoutMs);
    timer.unref();
    processResult = await new Promise((resolveProcess) => {
      child.once('error', (cause) =>
        resolveProcess({
          code: null,
          signal: null,
          runnerError: cause instanceof Error ? cause.message : String(cause),
        }),
      );
      child.once('close', (code, signal) => resolveProcess({ code, signal, runnerError: null }));
    });
  } catch (cause) {
    processResult = {
      code: null,
      signal: null,
      runnerError: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (forceKillTimer) clearTimeout(forceKillTimer);
    for (const [signal, handler] of forwardedSignals) process.off(signal, handler);
  }
  if (partialStdout) tail.push(`stdout: ${partialStdout}`);
  if (partialStderr) tail.push(`stderr: ${partialStderr}`);

  const stdout = stdoutChunks.join('');
  const stderr = stderrChunks.join('');
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);
  const { report, error: reportError } = parseReport(reportPath);
  let structuredObservations = [];
  let observationReportError = null;
  if (observationPath) {
    try {
      structuredObservations = readJson(observationPath).observations ?? [];
    } catch (cause) {
      observationReportError = cause instanceof Error ? cause.message : String(cause);
    }
  } else if (resultKind === 'playwright') structuredObservations = report?.observations ?? [];
  let processWarnings = [];
  try {
    processWarnings = readJsonLines(warningPath);
  } catch (cause) {
    observationReportError = cause instanceof Error ? cause.message : String(cause);
  }
  const allowanceErrors = [];
  let allowances = [];
  try {
    allowances = readJson(allowancePath);
  } catch (cause) {
    allowanceErrors.push(cause instanceof Error ? cause.message : String(cause));
  }
  const activeObservationScopes = new Set(
    resultKind === 'playwright'
      ? (report?.tests ?? [])
          .map(({ observationTestId }) => observationTestId)
          .filter(Boolean)
          .map((testId) => ['playwright', testId].join('\u0000'))
      : [],
  );
  let browserContract = null;
  const browserContractErrors = [];
  if (resultKind === 'playwright') {
    try {
      const appRequire = createRequire(resolve(root, 'apps/web/package.json'));
      const nextVersion = readJson(appRequire.resolve('next/package.json')).version;
      browserContract = {
        runtime: readJson(resolve(root, 'scripts/e2e-runtime-contract.json')),
        declaration: readJson(resolve(root, 'e2e/expected-browser-events.json')),
        installedServerVersion: nextVersion,
      };
    } catch (cause) {
      browserContractErrors.push(cause instanceof Error ? cause.message : String(cause));
    }
  }
  const observationClassification = classifyObservations(
    [...structuredObservations, ...processWarnings],
    allowances,
    new Date(),
    activeObservationScopes,
    browserContract,
  );
  observationClassification.allowanceErrors.push(...allowanceErrors);
  observationClassification.infrastructureErrors.push(...browserContractErrors);
  const observationErrors = [
    ...observationClassification.allowanceErrors,
    ...observationClassification.infrastructureErrors,
    ...observationClassification.unexpected.map(
      ({ testId, kind, message }) => `${testId}:${kind}:${message}`,
    ),
  ];
  const runtimeCounters = runtimeCounterArtifacts(runDirectory);
  const runtimeCounterErrors = runtimeCounterContractErrors(
    runtimeCounters,
    requiredRuntimeCounters,
  );
  const attachmentContract =
    resultKind === 'playwright'
      ? playwrightAttachmentArtifacts(report, runDirectory)
      : { artifacts: [], errors: [] };
  const reservedArtifactPaths = new Set([
    reportName,
    ...(observationName ? [observationName] : []),
    'stdout.log',
    'stderr.log',
    'warnings.jsonl',
    'manifest.json',
    ...runtimeCounters.map(({ artifact }) => artifact),
    ...additionalArtifacts.map(({ path }) => path),
  ]);
  const declaredArtifacts =
    resultKind === 'vitest'
      ? declaredArtifactFiles(report, runDirectory, reservedArtifactPaths)
      : { artifacts: [], errors: [] };
  const artifactSpecs = [
    ...artifactFiles(runDirectory, additionalArtifactDirectories),
    ...(existsSync(reportPath) ? [{ path: reportName, format: 'json', allowEmpty: false }] : []),
    ...(observationName ? [{ path: observationName, format: 'json', allowEmpty: false }] : []),
    { path: 'stdout.log', format: 'text', allowEmpty: true },
    { path: 'stderr.log', format: 'text', allowEmpty: true },
    { path: 'warnings.jsonl', format: 'jsonl', allowEmpty: true },
    ...runtimeCounters.map(({ artifact }) => ({
      path: artifact,
      format: 'json',
      allowEmpty: false,
    })),
    ...additionalArtifacts,
    ...declaredArtifacts.artifacts,
    ...attachmentContract.artifacts,
  ];
  const uniqueArtifactSpecs = [
    ...new Map(artifactSpecs.map((artifact) => [artifact.path, artifact])).values(),
  ];
  const artifactVerification = verifyArtifactFiles(runDirectory, uniqueArtifactSpecs);
  const artifactErrors = [
    ...declaredArtifacts.errors,
    ...attachmentContract.errors,
    ...artifactVerification.errors,
  ];
  const outcome = outcomeFor({
    code: processResult.code,
    signal: processResult.signal,
    timedOut,
    runnerError: processResult.runnerError,
    report,
    reportError: reportError ?? observationReportError,
    runtimeCounterErrors,
    observationErrors,
    artifactErrors,
    resultKind,
  });
  const durationMs = Date.now() - startedAt.getTime();
  const counts = {
    ...reportCounts(report, resultKind),
    warnings:
      processWarnings.length +
      structuredObservations.filter(({ kind }) =>
        ['warning', 'deprecation', 'unhandled_error', 'resource_leak'].includes(kind),
      ).length,
    unexpectedObservations: observationClassification.unexpected.length,
    allowedObservations: observationClassification.allowed.length,
    correlatedObservations: observationClassification.correlated?.length ?? 0,
    infrastructureObservations: observationClassification.infrastructure?.length ?? 0,
  };
  const exit = processResult.runnerError
    ? { kind: 'runner_failure', code: null, signal: null }
    : timedOut
      ? { kind: 'timeout', code: null, signal: processResult.signal }
      : processResult.signal
        ? { kind: 'signal', code: null, signal: processResult.signal }
        : { kind: 'code', code: processResult.code, signal: null };
  const manifest = {
    manifestVersion: 1,
    command: { label: commandLabel, executable: command, args: resolvedArgs, suite, mode },
    startedAt: startedAt.toISOString(),
    durationMs,
    outcome,
    exit,
    versions: packageVersions(root),
    repository: repositoryIdentity(root),
    counts,
    runner: { error: processResult.runnerError },
    reporter: {
      format: resultKind === 'vitest' ? 'vitest-json' : 'playwright-observation-json',
      available: report !== null,
      error: reportError ?? observationReportError,
    },
    observations: {
      unexpected: observationClassification.unexpected,
      allowed: observationClassification.allowed,
      correlated: observationClassification.correlated ?? [],
      infrastructure: observationClassification.infrastructure ?? [],
      allowanceErrors: observationClassification.allowanceErrors,
      infrastructureErrors: observationClassification.infrastructureErrors,
    },
    output: {
      truncated: false,
      summaryLimits: { lines: MAX_SUMMARY_LINES, bytes: MAX_SUMMARY_BYTES },
    },
    runtimeCounters,
    runtimeCounterContract: {
      required: requiredRuntimeCounters ?? {},
      errors: runtimeCounterErrors,
    },
    artifactVerification: { errors: artifactErrors },
    artifacts: artifactVerification.verified,
  };
  const formattedSummary = formatSummary({
    manifest,
    report,
    tail,
    tailWasTrimmed,
    root,
    runDirectory,
  });
  manifest.output.truncated = formattedSummary.truncated;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifest,
    report,
    runDirectory,
    summary: formattedSummary.text,
    exitCode:
      outcome === 'success'
        ? 0
        : processResult.code && processResult.code > 0
          ? processResult.code
          : 1,
  };
}
