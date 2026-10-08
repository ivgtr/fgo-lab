import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import {
  connectProductionAuditBoundary,
  createTsk065ProductionAuditSource,
  formatCanonicalAuditMismatch,
  measureProductionAuditLifecycle,
  type CanonicalAuditRecord,
} from '@fgo-lab/master-data/production-audit';
import { describe, expect, it } from 'vitest';
import tsk065Evidence from '../../../docs/evidence/tsk-06-5-production-closure.json';
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
    const source = createTsk065ProductionAuditSource(tsk065Evidence, {
      masterDataVersion: audit.masterDataVersion,
      artifact: 'docs/evidence/tsk-06-5-production-closure.json',
    });
    const sharedAuditModel = connectProductionAuditBoundary(
      source,
      audit,
      'compileCalculationApplicationProductionAudit',
    );
    const actual: CanonicalAuditRecord[] = [
      { identity: 'manifest', value: { digest: audit.digest, inventory: audit.inventory } },
    ];
    const expected: CanonicalAuditRecord[] = [
      {
        identity: 'manifest',
        value: {
          digest: 'fe57f61c4fdee6091cdf95496df72c45f3055afad9703121f294429bd157aaf8',
          inventory: {
            attackServants: 422,
            attackProfiles: 433,
            preparationPlans: 7596,
            calculatorScenarios: 422,
            rankingRows: 433,
            rankingPolicy: 'current-default',
            resourcePrograms: {
              programs: 7255,
              mutations: 15949,
              opaqueOperations: 52299,
              digest: 'd6aa84743728f5c91681c4f8d2915d672b47a157fe534f25d7bbccc9c227f6c3',
            },
            calculated: 407,
            inputRequired: 15,
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
            sharedAuditModel,
            runtimeCounters: { ...measured.runtimeCounters, ...audit.counters },
            timings: measured.timings,
          },
          null,
          2,
        )}\n`,
      );
    expect(sharedAuditModel.payload).toMatchObject({
      boundary: 'calculation-application',
      producer: 'compileCalculationApplicationProductionAudit',
      digest: audit.digest,
      masterDataVersion: audit.masterDataVersion,
    });
    expect(
      audit.failures.reduce<Record<string, number>>((counts, { kind }) => {
        counts[kind] = (counts[kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ inputRequired: 15 });
    expect(
      audit.failures.filter(({ kind }) => kind === 'inputRequired').map(({ identity }) => identity),
    ).toEqual(
      [
        '102900',
        '303200',
        '505200',
        '505500',
        '603300',
        '605000',
        '704400',
        '901700',
        '1100600',
        '1101900',
        '2500200',
        '2500500',
        '2500900',
        '2501100',
        '4000100',
      ].map((id) => `calculator:${id}`),
    );
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
