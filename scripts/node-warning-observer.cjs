const { appendFileSync } = require('node:fs');

const path = process.env.FGO_TEST_WARNING_PATH;
if (path) {
  process.on('warning', (warning) => {
    appendFileSync(
      path,
      `${JSON.stringify({
        runner: process.env.FGO_TEST_RUNNER_KIND ?? 'unknown',
        testId: '<process>',
        kind: warning.name === 'DeprecationWarning' ? 'deprecation' : 'warning',
        message: warning.message,
        code: warning.code ?? null,
        stack: warning.stack ?? null,
        pid: process.pid,
      })}\n`,
    );
  });
}
