import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  formatCanonicalAuditMismatch,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { describe, expect, it } from 'vitest';
import { compileCalculationApplicationProductionAudit } from './productionAudit';

const root = resolve(import.meta.dirname, '../../..');

describe('shared calculation-application production audit', () => {
  it('loads, parses, and compiles every current calculator and ranking identity once', async () => {
    const readStarted = performance.now();
    const content = await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8');
    const readDurationMs = performance.now() - readStarted;
    const parseStarted = performance.now();
    const master = masterSnapshotSchema.parse(JSON.parse(content));
    const parseDurationMs = performance.now() - parseStarted;
    const compileStarted = performance.now();
    const audit = compileCalculationApplicationProductionAudit(master);
    const compileDurationMs = performance.now() - compileStarted;
    const actual: CanonicalAuditRecord[] = [
      { identity: 'manifest', value: { digest: audit.digest, inventory: audit.inventory } },
    ];
    const expected: CanonicalAuditRecord[] = [
      {
        identity: 'manifest',
        value: {
          digest: '8dcffe8a09c91ce1d9ee3f6cd1626c7d70c7d1f3f56f41f55be064f70dcf82e3',
          inventory: {
            attackServants: 422,
            calculated: 422,
            calculatorScenarios: 422,
            inputRequired: 0,
            invalid: 0,
            preparationPlans: 3_559,
            rankingPolicy: 'current-default',
            rankingRows: 433,
            unsupported: 0,
          },
        },
      },
    ];
    const artifactDirectory = process.env['FGO_TEST_ARTIFACT_DIR'];
    if (artifactDirectory)
      await writeFile(
        resolve(artifactDirectory, 'production-audit-calculation-application.json'),
        `${JSON.stringify(
          {
            ...audit,
            runtimeCounters: audit.counters,
            timings: { readDurationMs, parseDurationMs, compileDurationMs },
          },
          null,
          2,
        )}\n`,
      );
    expect(audit.failures).toEqual([]);
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
