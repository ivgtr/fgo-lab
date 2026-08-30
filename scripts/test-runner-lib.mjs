import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const MAX_SUMMARY_LINES = 200;
const MAX_SUMMARY_BYTES = 32 * 1024;
const MAX_FAILURES = 5;
const ABNORMAL_TAIL_LINES = 100;

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

function reportCounts(report) {
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

function warningCount(stderr) {
  return stderr
    .split(/\r?\n/)
    .filter((line) => /\b(?:warn(?:ing)?|deprecated|unhandled|resource leak)\b/i.test(line)).length;
}

function outcomeFor({ code, signal, timedOut, report, reportError }) {
  if (timedOut) return 'timeout';
  if (signal) return 'signal';
  if (!report) return code === 0 ? 'reporter_failure' : 'test_failure';
  if (code !== 0 || report.success === false) return 'test_failure';
  if ((report.numPendingTests ?? 0) > 0 || (report.numTodoTests ?? 0) > 0)
    return 'contract_failure';
  return reportError ? 'reporter_failure' : 'success';
}

function bounded(lines) {
  let truncated = lines.length > MAX_SUMMARY_LINES;
  const selected = lines.slice(0, MAX_SUMMARY_LINES);
  while (Buffer.byteLength(selected.join('\n')) > MAX_SUMMARY_BYTES && selected.length > 1) {
    truncated = true;
    selected.pop();
  }
  if (selected.length < lines.length)
    selected.push(`... ${lines.length - selected.length} lines omitted`);
  while (Buffer.byteLength(selected.join('\n')) > MAX_SUMMARY_BYTES && selected.length > 1) {
    truncated = true;
    selected.splice(-2, 1);
  }
  return { text: `${selected.join('\n')}\n`, truncated };
}

function failedAssertions(report) {
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
    const failures = failedAssertions(report);
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
  } else {
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
  } = options;
  const startedAt = new Date();
  const runDirectory = resolve(artifactRoot, runId);
  mkdirSync(artifactRoot, { recursive: true });
  mkdirSync(runDirectory, { recursive: false });
  const reportPath = resolve(runDirectory, 'vitest.json');
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
  const detached = forwardSignals && process.platform !== 'win32';
  const child = spawn(command, resolvedArgs, {
    cwd: root,
    env: { ...process.env, ...extraEnv, FGO_TEST_REPORT_PATH: reportPath },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached,
  });
  const terminateChild = (signal) => {
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
  const forwardedSignals = new Map();
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

  let forceKillTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    terminateChild('SIGTERM');
    forceKillTimer = setTimeout(() => terminateChild('SIGKILL'), 2_000);
    forceKillTimer.unref();
  }, timeoutMs);
  timer.unref();
  const processResult = await new Promise((resolveProcess, rejectProcess) => {
    child.once('error', rejectProcess);
    child.once('close', (code, signal) => resolveProcess({ code, signal }));
  });
  clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  for (const [signal, handler] of forwardedSignals) process.off(signal, handler);
  if (partialStdout) tail.push(`stdout: ${partialStdout}`);
  if (partialStderr) tail.push(`stderr: ${partialStderr}`);

  const stdout = stdoutChunks.join('');
  const stderr = stderrChunks.join('');
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);
  const { report, error: reportError } = parseReport(reportPath);
  const outcome = outcomeFor({
    code: processResult.code,
    signal: processResult.signal,
    timedOut,
    report,
    reportError,
  });
  const durationMs = Date.now() - startedAt.getTime();
  const counts = { ...reportCounts(report), warnings: warningCount(stderr) };
  const exit = timedOut
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
    reporter: { format: 'vitest-json', available: report !== null, error: reportError },
    output: {
      truncated: false,
      summaryLimits: { lines: MAX_SUMMARY_LINES, bytes: MAX_SUMMARY_BYTES },
    },
    artifacts: [
      'manifest.json',
      ...(existsSync(reportPath) ? ['vitest.json'] : []),
      'stdout.log',
      'stderr.log',
    ],
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
