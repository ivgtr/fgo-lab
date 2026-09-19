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
          digest: '99be26044e385be6409c6d4db8e6b884b6790517e50b9364888d8b3255fc23f9',
          inventory: {
            attackServants: 422,
            attackProfiles: 433,
            preparationPlans: 3640,
            calculatorScenarios: 422,
            rankingRows: 433,
            rankingPolicy: 'current-default',
            resourcePrograms: {
              programs: 7255,
              mutations: 15949,
              opaqueOperations: 52299,
              digest: '10b5232414d8e2def2119bb8b6ef83aa1cc664628b10bda0e8b745326f6e9a95',
            },
            calculated: 422,
            inputRequired: 0,
            unsupported: 0,
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
    ).toEqual({});
    expect(
      audit.failures.filter(({ kind }) => kind === 'unsupported').map(({ identity }) => identity),
    ).toEqual([]);
    expect(
      audit.failures
        .filter(({ kind }) => kind === 'rankingFailure')
        .map(({ reason }) => reason)
        .sort(),
    ).toEqual([]);
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
