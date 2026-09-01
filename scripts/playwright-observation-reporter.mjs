import { writeFileSync } from 'node:fs';

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
      attachments: result.attachments.map((attachment) => ({
        name: attachment.name,
        contentType: attachment.contentType,
        path: attachment.path ?? null,
        inline: Boolean(attachment.body),
      })),
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
