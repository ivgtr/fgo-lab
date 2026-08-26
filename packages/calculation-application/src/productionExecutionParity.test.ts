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
    const records = fixture.cases.map((testCase) => {
      const servant = master.servants.find((candidate) => candidate.id === testCase.attackerId)!;
      const baseline = createDefaultResolvedScenario(master, undefined, servant);
      const scenario = {
        ...baseline,
        attackerHpPermille: null,
        battleState: { battlePointPhase: null },
        battleContext: { values: {} },
        effectDecisions: testCase.effectDecisions,
        worldFactAssertions: testCase.worldFactAssertions,
      };
      const calculation = calculateScenario(scenario, master, versions);
      expect(calculation.result.status, testCase.key).toBe('calculated');
      return {
        key: testCase.key,
        input: calculation.input,
        rows: calculation.result.rows,
      };
    });
    expect(records).toHaveLength(1_504);
    expect(createHash('sha256').update(JSON.stringify(records)).digest('hex')).toBe(
      '3a13bdfbc13c83e0279ee58311dd212537ed6c667a9d290f97be3916a9fea6ec',
    );
  }, 30_000);
});
