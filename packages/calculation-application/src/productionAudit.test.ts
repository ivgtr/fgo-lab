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
          digest: 'e0677f9362ef8f9a50e312693a1c8cc5fcc11e22be31b4d7c39f268ad41bbc78',
          inventory: {
            attackProfiles: 433,
            attackServants: 422,
            calculated: 420,
            calculatorScenarios: 422,
            inputRequired: 0,
            invalid: 0,
            preparationPlans: 3_438,
            rankingPolicy: 'current-default',
            rankingRows: 393,
            unsupported: 2,
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
    ).toEqual({ unsupported: 2, rankingFailure: 40 });
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
