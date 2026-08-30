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
          digest: 'e116e91fad16fb6348826f26b5e29fc4db5239e26b49c1c8cad50eb0dd5c2fc2',
          inventory: {
            binaryOutcomeSelections: 44,
            craftEssences: 2_700,
            damageFunctions: 630,
            effects: 13_875,
            mysticCodes: 28,
            noblePhantasmVariantIdentities: 706,
            operations: 14_623,
            playerChoiceSelections: 88,
            probabilisticOccurrences: 49,
            rawBuffTypes: 133,
            rawFunctionTypes: 54,
            rawParameterKeys: 124,
            rawPlayerChoiceOccurrences: 88,
            servants: 469,
            stochasticOutcomeSelections: 49,
            successCountOutcomeSelections: 5,
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
