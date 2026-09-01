import { copyFileSync, existsSync, lstatSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { sha256File } from './test-observation-lib.mjs';

export default class PlaywrightObservationReporter {
  tests = [];
  observations = [];

  onStdOut(chunk, test) {
    if (test)
      this.observations.push({
        runner: 'playwright',
        testId: test.titlePath().join(' > '),
        kind: 'console.log',
        message: chunk.toString(),
      });
  }

  onStdErr(chunk, test) {
    if (test)
      this.observations.push({
        runner: 'playwright',
        testId: test.titlePath().join(' > '),
        kind: 'console.error',
        message: chunk.toString(),
      });
  }

  onTestEnd(test, result) {
    this.tests.push({
      id: test.id,
      observationTestId: test.titlePath().slice(-2).join(' > '),
      title: test.title,
      titlePath: test.titlePath(),
      project: test.parent.project()?.name ?? '<unknown>',
      expectedStatus: test.expectedStatus,
      outcome: test.outcome(),
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      errors: result.errors.map((error) => ({
        message: error.message ?? null,
        stack: error.stack ?? null,
      })),
      attachments: result.attachments.map((attachment, index) =>
        describeAttachment(attachment, {
          artifactRoot: resolve(process.env.FGO_TEST_ARTIFACT_DIR),
          repositoryRoot: resolve(process.cwd()),
          testId: test.id,
          retry: result.retry,
          index,
        }),
      ),
    });
  }

  onEnd(result) {
    const browserObservations = process.env.FGO_BROWSER_OBSERVATION_PATH
      ? readJsonLines(process.env.FGO_BROWSER_OBSERVATION_PATH)
      : [];
    const tests = this.tests;
    const projects = Object.groupBy(tests, (test) => test.project);
    const countsFor = (values) => ({
      total: values.length,
      passed: values.filter((test) => test.status === 'passed').length,
      failed: values.filter((test) => ['failed', 'timedOut', 'interrupted'].includes(test.status))
        .length,
      skipped: values.filter((test) => test.status === 'skipped').length,
      retries: values.filter((test) => test.retry > 0).length,
      flaky: values.filter((test) => test.outcome === 'flaky').length,
    });
    writeFileSync(
      process.env.FGO_TEST_REPORT_PATH,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          status: result.status,
          startedAt: result.startTime.toISOString(),
          durationMs: result.duration,
          counts: countsFor(tests),
          projects: Object.fromEntries(
            Object.entries(projects).map(([name, values]) => [name, countsFor(values)]),
          ),
          tests,
          observations: [...this.observations, ...browserObservations],
        },
        null,
        2,
      )}\n`,
    );
  }
}

export function describeAttachment(
  attachment,
  { artifactRoot, repositoryRoot, testId, retry, index },
) {
  const base = {
    name: attachment.name,
    contentType: attachment.contentType,
  };
  if (attachment.body) {
    const body = Buffer.from(attachment.body);
    return {
      ...base,
      path: null,
      inline: true,
      sourceKind: 'inline',
      sourcePath: null,
      bytes: body.length,
      sha256: process.getBuiltinModule('crypto').createHash('sha256').update(body).digest('hex'),
    };
  }
  if (!attachment.path)
    return {
      ...base,
      path: null,
      inline: false,
      sourceKind: null,
      sourcePath: null,
      bytes: null,
      sha256: null,
    };
  let absolutePath = resolve(attachment.path);
  let sourceKind = 'run_artifact';
  let sourcePath = null;
  if (!isPathWithin(artifactRoot, absolutePath)) {
    if (!attachment.name.endsWith('-expected.png') || attachment.contentType !== 'image/png')
      throw new Error(`attachment_external_kind:${attachment.name}`);
    if (!existsSync(absolutePath)) throw new Error(`attachment_snapshot_missing:${absolutePath}`);
    if (!lstatSync(absolutePath).isFile())
      throw new Error(`attachment_snapshot_not_regular_file:${absolutePath}`);
    if (!isPathWithin(repositoryRoot, absolutePath))
      throw new Error(`attachment_snapshot_outside_repository:${absolutePath}`);
    const repositoryPath = relative(repositoryRoot, absolutePath).split(sep).join('/');
    if (!/^e2e\/[^/]+\.spec\.ts-snapshots\/[^/]+\.png$/.test(repositoryPath))
      throw new Error(`attachment_snapshot_outside_canonical_root:${repositoryPath}`);
    const safeTestId = testId.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
    const destination = resolve(
      artifactRoot,
      'playwright-artifacts',
      'reporter-attachments',
      `${safeTestId}-retry-${String(retry)}`,
      `${String(index)}-${basename(absolutePath)}`,
    );
    if (existsSync(destination)) throw new Error(`attachment_copy_collision:${destination}`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(absolutePath, destination);
    absolutePath = destination;
    sourceKind = 'repository_snapshot';
    sourcePath = repositoryPath;
  }
  if (!existsSync(absolutePath))
    return {
      ...base,
      path: relative(artifactRoot, absolutePath),
      inline: false,
      sourceKind,
      sourcePath,
      bytes: null,
      sha256: null,
    };
  if (!lstatSync(absolutePath).isFile())
    throw new Error(`attachment_not_regular_file:${absolutePath}`);
  const path = relative(artifactRoot, absolutePath).split(sep).join('/');
  return {
    ...base,
    path,
    inline: false,
    sourceKind,
    sourcePath,
    bytes: statSync(absolutePath).size,
    sha256: sha256File(absolutePath),
  };
}

function isPathWithin(root, path) {
  const local = relative(root, path);
  return local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

function readJsonLines(path) {
  try {
    return requireText(path)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function requireText(path) {
  return process.getBuiltinModule('fs').readFileSync(path, 'utf8');
}
