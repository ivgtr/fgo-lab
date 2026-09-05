import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  calculateScenario as calculateScenarioOutcome,
  createDefaultResolvedScenario,
  requireExecutableCalculation,
} from './scenario';
const calculateScenario = (...args: Parameters<typeof calculateScenarioOutcome>) =>
  requireExecutableCalculation(calculateScenarioOutcome(...args));

const root = resolve(import.meta.dirname, '../../..');
const versions = (masterDataVersion: string) => ({
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: '0.1.0',
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
  masterDataVersion,
});

interface GoldenState {
  lb: 0 | 4;
  input: string;
  mods: [number, number, number, number];
  rows: [number, number, number][];
}

interface GoldenCase {
  ce: string;
  ceName: string;
  servant: string;
  servantName: string;
  states: GoldenState[];
}

function inputDigest(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

describe('MLB-only production damage golden', () => {
  let master: ReturnType<typeof masterSnapshotSchema.parse>;
  beforeAll(async () => {
    master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
  }, 5_000);

  it('locks LB0 and LB4 damage input plus NP1-5 for all five damage effects', async () => {
    const golden = JSON.parse(
      await readFile(
        resolve(root, 'packages/test-fixtures/golden/mlb-only-effects-v1.json'),
        'utf8',
      ),
    ) as { caseId: string; engineVersion: string; cases: GoldenCase[] };
    expect(golden).toMatchObject({ caseId: 'mlb-only-effects-v1', engineVersion: ENGINE_VERSION });
    expect(golden.cases).toHaveLength(5);

    for (const goldenCase of golden.cases) {
      const servant = master.servants.find((candidate) => candidate.id === goldenCase.servant)!;
      const craftEssence = master.craftEssences.find(
        (candidate) => candidate.id === goldenCase.ce,
      )!;
      expect([servant.name, craftEssence.name]).toEqual([
        goldenCase.servantName,
        goldenCase.ceName,
      ]);
      expect(
        craftEssence.effects.filter((effect) => effect.availability === 'maximumLimitBreakOnly'),
      ).toHaveLength(1);

      for (const expected of goldenCase.states) {
        const scenario = createDefaultResolvedScenario(master, undefined, servant);
        scenario.preNoblePhantasmPlan = [{ kind: 'executeAttackNoblePhantasm' }];
        scenario.craftEssence = {
          craftEssenceId: craftEssence.id,
          level: 1,
          limitBreak: expected.lb,
        };
        const execution = calculateScenario(scenario, master, versions(master.version));
        expect(execution.result.status).toBe('calculated');
        expect(inputDigest(execution.input)).toBe(expected.input);
        expect([
          execution.input.attackBuff,
          execution.input.cardBuff,
          execution.input.npDamageBuff,
          execution.input.flatDamage,
        ]).toEqual(expected.mods);
        expect(execution.result.rows.map((row) => [row.minimum, row.average, row.maximum])).toEqual(
          expected.rows,
        );
      }
    }
  });

  it('does not apply MLB-only effects at limit-break states 0 through 3', async () => {
    const golden = JSON.parse(
      await readFile(
        resolve(root, 'packages/test-fixtures/golden/mlb-only-effects-v1.json'),
        'utf8',
      ),
    ) as { cases: GoldenCase[] };
    for (const goldenCase of golden.cases) {
      const servant = master.servants.find((candidate) => candidate.id === goldenCase.servant)!;
      const lb0 = goldenCase.states.find((state) => state.lb === 0)!;
      for (const limitBreak of [0, 1, 2, 3] as const) {
        const scenario = createDefaultResolvedScenario(master, undefined, servant);
        scenario.preNoblePhantasmPlan = [{ kind: 'executeAttackNoblePhantasm' }];
        scenario.craftEssence = { craftEssenceId: goldenCase.ce, level: 1, limitBreak };
        const execution = calculateScenario(scenario, master, versions(master.version));
        expect(inputDigest(execution.input)).toBe(lb0.input);
        expect(execution.result.rows.map((row) => [row.minimum, row.average, row.maximum])).toEqual(
          lb0.rows,
        );
      }
    }
  });
});
