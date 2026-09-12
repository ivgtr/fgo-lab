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
          digest: 'ba4d2186e3e1be6233625d157acfd6b05a5d67f9f6ee446b2a6c0ec66c1f521d',
          inventory: {
            attackServants: 422,
            attackProfiles: 433,
            preparationPlans: 3490,
            calculatorScenarios: 422,
            rankingRows: 422,
            rankingPolicy: 'current-default',
            resourcePrograms: {
              programs: 7255,
              mutations: 15894,
              opaqueOperations: 54108,
              digest: '576daa298d8952096402012fd3c74a29c150d0ee144550751a05c7d711a312fa',
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
    ).toEqual({ unsupported: 2, rankingFailure: 11 });
    expect(
      audit.failures.filter(({ kind }) => kind === 'unsupported').map(({ identity }) => identity),
    ).toEqual(['calculator:702500', 'calculator:705300']);
    expect(
      audit.failures
        .filter(({ kind }) => kind === 'rankingFailure')
        .map(({ reason }) => reason)
        .sort(),
    ).toEqual(
      [...Array.from({ length: 11 }, () => 'unsupported:unsupportedActionAdmission')].sort(),
    );
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
