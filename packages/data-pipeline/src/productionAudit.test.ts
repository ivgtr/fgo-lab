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
          digest: '3dea1c05818b0df7925f21d30b1ba84228d02c22ab40f6437eed685e620d7b03',
          inventory: {
            servants: 469,
            craftEssences: 2700,
            mysticCodes: 28,
            effects: 13875,
            oc: {
              grantOcBoost: 97,
              grantOcApplicationRate: 29,
              removeOcState: 75,
              ocStateNonIntersection: 131,
              ocRemovalResistance: 60,
              grantCells: 868,
              resistanceCells: 514,
              rawGrantCells: 866,
              rawResistanceCells: 513,
              unchangedLimitBreakCells: 3,
              hpRateEffects: 1,
              hpRateCells: 25,
              boostOrigins: {
                constant: 54,
                active: 43,
              },
              nonIntersectionProofs: {
                stateSelector: 32,
                enemyRecipient: 99,
              },
            },
            operations: 14633,
            damageFunctions: 630,
            noblePhantasmVariantIdentities: 706,
            rawFunctionTypes: 54,
            rawBuffTypes: 133,
            rawParameterKeys: 124,
            rawPlayerChoiceOccurrences: 88,
            probabilisticOccurrences: 49,
            playerChoiceSelections: 88,
            stochasticOutcomeSelections: 49,
            binaryOutcomeSelections: 44,
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
