import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { EffectDecision, WorldFactAssertion } from '@fgo-lab/battle-execution';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario, createDefaultResolvedScenario } from './scenario';

const root = resolve(import.meta.dirname, '../../..');

function withoutBuffHpConditions(master: ReturnType<typeof masterSnapshotSchema.parse>) {
  const legacy = JSON.parse(JSON.stringify(master)) as unknown;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const evidence = record.atlasEvidence as Record<string, unknown> | undefined;
    const keys = evidence?.buffConditionKeys;
    if (Array.isArray(keys) && keys.some((key) => key === 'HP_LOWER' || key === 'HP_HIGHER')) {
      const conditions = record.quantityConditions;
      if (Array.isArray(conditions))
        record.quantityConditions = conditions.filter(
          (condition) =>
            !condition ||
            typeof condition !== 'object' ||
            (condition as Record<string, unknown>).quantity !== 'attackerHpPermille',
        );
      const interaction = record.interaction;
      if (
        interaction &&
        typeof interaction === 'object' &&
        (interaction as Record<string, unknown>).kind === 'quantityThresholdSeries'
      )
        record.interaction = null;
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(legacy);
  return masterSnapshotSchema.parse(legacy);
}

describe('production execution parity ratchet', () => {
  it('reproduces every scenario that was calculated before unsupported convergence', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      appVersion: '0.1.0',
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
      masterDataVersion: master.version,
    };
    const legacyHpMaster = withoutBuffHpConditions(master);
    const fixture = JSON.parse(
      gunzipSync(
        await readFile(
          resolve(
            root,
            'packages/test-fixtures/golden/pre-existing-calculated-scenarios-v1.json.gz',
          ),
        ),
      ).toString('utf8'),
    ) as {
      version: 1;
      cases: Array<{
        key: string;
        attackerId: string;
        effectDecisions: EffectDecision[];
        worldFactAssertions: WorldFactAssertion[];
      }>;
    };
    const calculate = (
      testCase: (typeof fixture.cases)[number],
      calculationMaster: typeof master,
    ) => {
      const servant = calculationMaster.servants.find(
        (candidate) => candidate.id === testCase.attackerId,
      )!;
      const baseline = createDefaultResolvedScenario(calculationMaster, undefined, servant);
      const scenario = {
        ...baseline,
        attackerHpPermille: null,
        battleState: { battlePointPhase: null },
        canonicalInputValues: {},
        effectDecisions: testCase.effectDecisions,
        worldFactAssertions: testCase.worldFactAssertions,
      };
      const calculation = calculateScenario(scenario, calculationMaster, {
        ...versions,
        masterDataVersion: calculationMaster.version,
      });
      expect(calculation.result.status, testCase.key).toBe('calculated');
      return {
        key: testCase.key,
        input: calculation.input,
        rows: calculation.result.rows,
      };
    };
    const records = fixture.cases.map((testCase) => calculate(testCase, master));
    const legacyRecords = fixture.cases.map((testCase) => calculate(testCase, legacyHpMaster));
    const changedKeys = records.flatMap((record, index) =>
      JSON.stringify(record) === JSON.stringify(legacyRecords[index]) ? [] : [record.key],
    );
    expect(records).toHaveLength(1_504);
    expect(changedKeys).toMatchInlineSnapshot(`
      [
        "selected:505300:attacker:attacker:505300:2239550:21071:0",
        "selected:505300:attacker:attacker:505300:2239550:21023:0",
        "selected:505300:attacker:attacker:505300:2239550:21026:0",
        "selected:505300:attacker:attacker:505300:2239550:21029:0",
      ]
    `);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      'ab1d27220c5cbee94b11c9c5b01e5725b2c2df9865bde6c509b275a45111f660',
    );
  }, 30_000);
});
