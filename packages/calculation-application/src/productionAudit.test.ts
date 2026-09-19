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
          digest: '292dbbf9ef855d275eadb9bfed702396a830f8446d7f2fe85127b895655f3968',
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
    const uniqueCriticalStarPaths = [
      ...new Map(
        audit.criticalStarPaths.map((path) => [
          JSON.stringify([path.servantId, path.writer, path.firstReader, path.deferredReader]),
          path,
        ]),
      ).values(),
    ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    expect(audit.criticalStarPaths).toHaveLength(174);
    expect(uniqueCriticalStarPaths).toEqual(
      [
        ...(['475:0', '475:1', '475:2', '475:3', '475:4'] as const).flatMap((writer) => [
          {
            servantId: '203700',
            writer,
            firstReader: '463:0',
            deferredReader: '4817:0',
            cells: 10,
          },
          {
            servantId: '203700',
            writer,
            firstReader: null,
            deferredReader: '4817:0',
            cells: 10,
          },
        ]),
        {
          servantId: '2300700',
          writer: '475:0',
          firstReader: null,
          deferredReader: '22020:0',
          cells: 10,
        },
        {
          servantId: '2300800',
          writer: '475:0',
          firstReader: null,
          deferredReader: '22020:0',
          cells: 10,
        },
        {
          servantId: '2801300',
          writer: '476:0',
          firstReader: null,
          deferredReader: '23594:0',
          cells: 10,
        },
        {
          servantId: '305600',
          writer: '21522:0',
          firstReader: null,
          deferredReader: '22305:0',
          cells: 10,
        },
        {
          servantId: '305600',
          writer: '22299:0',
          firstReader: null,
          deferredReader: '22305:0',
          cells: 10,
        },
        {
          servantId: '305600',
          writer: '476:0',
          firstReader: null,
          deferredReader: '22305:0',
          cells: 10,
        },
      ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    );
    expect(actual, formatCanonicalAuditMismatch(expected, actual)).toEqual(expected);
  }, 120_000);
});
