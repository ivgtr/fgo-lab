import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  formatCanonicalAuditMismatch,
  measureProductionAuditLifecycle,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { describe, expect, it } from 'vitest';
import { compileCalculationApplicationProductionAudit } from './productionAudit';

const root = resolve(import.meta.dirname, '../../..');

describe('shared calculation-application production audit', () => {
  it('loads, parses, and compiles every current calculator and ranking identity once', async () => {
    const measured = await measureProductionAuditLifecycle({
      read: () => readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8'),
      parse: (content) => masterSnapshotSchema.parse(JSON.parse(content)),
      compile: compileCalculationApplicationProductionAudit,
    });
    const { audit } = measured;
    const actual: CanonicalAuditRecord[] = [
      { identity: 'manifest', value: { digest: audit.digest, inventory: audit.inventory } },
    ];
    const expected: CanonicalAuditRecord[] = [
      {
        identity: 'manifest',
        value: {
          digest: 'e52da590e30e0eb762b739c2fe5f7462483adcfcb7947522c548b4c7f507e9d5',
          inventory: {
            attackServants: 422,
            attackProfiles: 433,
            preparationPlans: 3453,
            calculatorScenarios: 422,
            rankingRows: 413,
            rankingPolicy: 'current-default',
            resourcePrograms: {
              programs: 7255,
              mutations: 15795,
              opaqueOperations: 54037,
              digest: '830e4f83cdd16e0cacdae8d16d2d9ed3955b064ac4403e7e1702335bc83b1a80',
            },
            calculated: 420,
            inputRequired: 0,
            unsupported: 2,
            unavailable: 0,
            invalid: 0,
            levelStatAvailability: {
              naturalPairs: 422,
              naturalMissing: 0,
              level90Pairs: 422,
              level90Missing: 0,
              referencedPairs: 422,
              referencedMissing: 0,
              missing: [],
            },
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
            runtimeCounters: { ...measured.runtimeCounters, ...audit.counters },
            timings: measured.timings,
          },
          null,
          2,
        )}\n`,
      );
    expect(
      audit.failures.reduce<Record<string, number>>((counts, { kind }) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ unsupported: 2, rankingFailure: 20 });
    expect(
      audit.failures.filter(({ kind }) => kind === 'unsupported').map(({ identity }) => identity),
    ).toEqual(['calculator:702500', 'calculator:705300']);
    expect(
      audit.failures
        .filter(({ kind }) => kind === 'rankingFailure')
        .every(({ reason }) => reason === 'unsupported:unsupportedActionAdmission'),
    ).toBe(true);
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
