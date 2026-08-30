import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  formatCanonicalAuditMismatch,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { describe, expect, it } from 'vitest';
import { compileDataPipelineProductionAudit } from './productionAudit';

const root = resolve(import.meta.dirname, '../../..');

describe('shared data-pipeline production audit', () => {
  it('loads, parses, and compiles the complete canonical inventory once', async () => {
    const readStarted = performance.now();
    const content = await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8');
    const readDurationMs = performance.now() - readStarted;
    const parseStarted = performance.now();
    const master = masterSnapshotSchema.parse(JSON.parse(content));
    const parseDurationMs = performance.now() - parseStarted;
    const compileStarted = performance.now();
    const audit = compileDataPipelineProductionAudit(master);
    const compileDurationMs = performance.now() - compileStarted;
    const actual: CanonicalAuditRecord[] = [
      { identity: 'manifest', value: { digest: audit.digest, inventory: audit.inventory } },
    ];
    const expected: CanonicalAuditRecord[] = [
      {
        identity: 'manifest',
        value: {
          digest: 'a6766e7ecce70f876515a1fbf01e599b5d3fdff5b0adf4d1d41f7fe77e0f517e',
          inventory: {
            craftEssences: 2_700,
            damageFunctions: 630,
            effects: 13_875,
            mysticCodes: 28,
            operations: 14_623,
            rawBuffTypes: 133,
            rawFunctionTypes: 54,
            rawParameterKeys: 124,
            servants: 469,
          },
        },
      },
    ];
    const artifactDirectory = process.env['FGO_TEST_ARTIFACT_DIR'];
    if (artifactDirectory)
      await writeFile(
        resolve(artifactDirectory, 'production-audit-data-pipeline.json'),
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
    expect(audit.failures).toHaveLength(6);
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
