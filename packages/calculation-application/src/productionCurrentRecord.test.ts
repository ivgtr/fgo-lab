import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  auditProductionClosure,
  productionClosureConditions,
  productionClosureRecordDigest,
  type ProductionClosureConditionRecord,
} from './productionClosureAudit';
import { inspectProductionConditionRecords } from './productionClosureRecordIntegrity';
import { verifyCurrentProductionRecord } from './productionCurrentRecord';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';

const root = resolve(import.meta.dirname, '../../..');
const master = masterSnapshotSchema.parse(
  JSON.parse(readFileSync(resolve(root, 'packages/test-fixtures/master/fixture.json'), 'utf8')),
);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const condition = productionClosureConditions()[0]!;
let produced: ProductionClosureConditionRecord | null = null;

async function fixtureRecord(): Promise<ProductionClosureConditionRecord> {
  if (produced) return produced;
  const observed: ProductionClosureConditionRecord[] = [];
  await auditProductionClosure(
    master,
    { servantBuilds: {} },
    versions,
    (record) => {
      observed.push(record);
    },
    [condition],
  );
  const first = observed[0];
  if (!first) throw new Error('current_record_fixture_missing');
  produced = first;
  return first;
}

it('accepts the current producer record through an independent scenario replay', async () => {
  const current = await fixtureRecord();
  expect(current.records).toHaveLength(1);
  expect(
    verifyCurrentProductionRecord({
      value: current.records[0],
      condition,
      master,
      versions,
    }),
  ).toEqual([]);
});

it('rejects nested unknown, missing, range, receipt and rehashed numeric mutation', async () => {
  const current = await fixtureRecord();
  const original = current.records[0] as Record<string, unknown>;
  const mutations: readonly [string, (record: Record<string, unknown>) => void][] = [
    [
      'scenario.attacker.unexpected',
      (record) => {
        ((record['scenario'] as Record<string, unknown>)['attacker'] as Record<string, unknown>)[
          'unexpected'
        ] = true;
      },
    ],
    [
      'basis.level',
      (record) => {
        delete (record['basis'] as Record<string, unknown>)['level'];
      },
    ],
    [
      'scenario.attacker.level',
      (record) => {
        ((record['scenario'] as Record<string, unknown>)['attacker'] as Record<string, unknown>)[
          'level'
        ] = 0;
      },
    ],
    [
      'appliedPreparationActions',
      (record) => {
        const action = (record['appliedPreparationActions'] as Record<string, unknown>[])[0]!;
        (action['resourceTransaction'] as Record<string, unknown>)['unexpected'] = true;
      },
    ],
    [
      'damageRows',
      (record) => {
        (record['damageRows'] as Record<string, unknown>[])[0]!['average'] = 999999;
        ((record['outcome'] as Record<string, unknown>)['rows'] as Record<string, unknown>[])[0]![
          'average'
        ] = 999999;
      },
    ],
    [
      'witness.policyKey',
      (record) => {
        (record['witness'] as Record<string, unknown>)['policyKey'] = 'excluded:baseline';
      },
    ],
    [
      'areaContribution',
      (record) => {
        record['areaContribution'] = { scenario: record['scenario'] };
      },
    ],
  ];
  for (const [expectedPath, mutate] of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    const oldSummary = { ...current, digest: productionClosureRecordDigest([changed]) };
    expect(
      inspectProductionConditionRecords({
        records: [changed],
        conditionKey: current.key,
        summary: oldSummary,
        profileCount: 1,
      }).status,
    ).toBe('accepted');
    const failures = verifyCurrentProductionRecord({ value: changed, condition, master, versions });
    expect(failures.length, expectedPath).toBeGreaterThan(0);
    expect(failures[0]!.firstDifference.path, expectedPath).toContain(expectedPath.split('.')[0]!);
  }
});

it('checks a noncalculated record against the static profile catalog and exact blocker shape', () => {
  const attackProfile = createStaticAttackProfiles(master.servants[0]!)[0]!;
  const profileKey = attackProfileKey(attackProfile);
  const empty = { count: 0, digest: 'fnv1a32:741638a5', representatives: [] };
  const current = {
    profileKey,
    status: 'unavailableUnderPolicy',
    attackProfile,
    reason: 'insufficientNpGauge',
    diagnostics: {
      classes: {
        invalid: empty,
        unsupported: empty,
        inputRequired: empty,
        unavailableUnderPolicy: {
          count: 1,
          digest: 'fnv1a32:fa272aed',
          representatives: [{ candidateKey: '{}', reason: 'insufficientNpGauge' }],
        },
      },
    },
  };
  const verify = (value: unknown) =>
    verifyCurrentProductionRecord({ value, condition, master, versions });
  expect(verify(current)).toEqual([]);
  const changed = structuredClone(current);
  Object.assign(changed.diagnostics.classes.inputRequired, { unknown: true });
  expect(verify(changed)[0]?.firstDifference.path).toBe('diagnostics.classes.inputRequired');
});
