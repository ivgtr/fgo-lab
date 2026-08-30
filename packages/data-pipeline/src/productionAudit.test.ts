import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  formatCanonicalAuditMismatch,
  measureProductionAuditLifecycle,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { describe, expect, it } from 'vitest';
import { compileDataPipelineProductionAudit } from './productionAudit';

const root = resolve(import.meta.dirname, '../../..');

describe('shared data-pipeline production audit', () => {
  it('loads, parses, and compiles the complete canonical inventory once', async () => {
    const measured = await measureProductionAuditLifecycle({
      read: () => readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8'),
      parse: (content) => masterSnapshotSchema.parse(JSON.parse(content)),
      compile: compileDataPipelineProductionAudit,
    });
    const { audit } = measured;
    const actual: CanonicalAuditRecord[] = [
      { identity: 'manifest', value: { digest: audit.digest, inventory: audit.inventory } },
    ];
    const expected: CanonicalAuditRecord[] = [
      {
        identity: 'manifest',
        value: {
          digest: '96c0795337dbf34308c67a6c9ae1f938d6503fe424cead81116a99d596f15323',
          inventory: {
            craftEssences: 2_700,
            damageFunctions: 630,
            effects: 13_875,
            mysticCodes: 28,
            noblePhantasmVariantIdentities: 706,
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
            runtimeCounters: { ...measured.runtimeCounters, ...audit.counters },
            timings: measured.timings,
          },
          null,
          2,
        )}\n`,
      );
    expect(audit.failures).toHaveLength(6);
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
