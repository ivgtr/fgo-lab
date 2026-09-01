import { writeFileSync } from 'node:fs';

export default class VitestObservationReporter {
  logs = [];
  taskNames = new Map();

  onUserConsoleLog(log) {
    this.logs.push(log);
  }

  onTestRunEnd(modules, errors) {
    for (const module of modules ?? []) {
      for (const test of module.children?.allTests?.() ?? []) {
        const names = [];
        let task = test.task;
        while (task && task.type !== 'file') {
          if (task.name) names.unshift(task.name);
          task = task.suite;
        }
        const moduleName = module.moduleId ?? module.task?.name ?? '<module>';
        this.taskNames.set(test.task?.id ?? test.id, `${moduleName} > ${names.join(' > ')}`);
      }
    }
    const observations = this.logs.map((log) => ({
      runner: 'vitest',
      testId: this.taskNames.get(log.taskId) ?? log.taskId ?? '<global>',
      kind: log.type === 'stderr' ? 'console.error' : 'console.log',
      message: log.content,
      origin: log.origin ?? null,
    }));
    for (const error of errors ?? [])
      observations.push({
        runner: 'vitest',
        testId: '<global>',
        kind: 'unhandled_error',
        message: error instanceof Error ? error.message : String(error),
      });
    writeFileSync(
      process.env.FGO_TEST_OBSERVATION_PATH,
      `${JSON.stringify({ schemaVersion: 1, observations }, null, 2)}\n`,
    );
  }
}
