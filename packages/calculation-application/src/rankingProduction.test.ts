import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario } from './scenario';
import { createDefaultResolvedScenario } from './scenario';
import {
  calculateRanking,
  createRankingScenario,
  DEFAULT_RANKING_CONDITIONS,
  type RankingProfileInput,
} from './ranking';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

describe('production canonical ranking', () => {
  it('keeps every attacking NP on the calculator execution path', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const ranking = calculateRanking(master, profile, DEFAULT_RANKING_CONDITIONS, versions);

    expect(ranking.failures).toEqual([]);
    expect(ranking.rows).toHaveLength(420);
    for (const row of ranking.rows) {
      const detail = ranking.details[row.servantId]!;
      const calculator = calculateScenario(detail.scenario, master, versions);
      expect(calculator.input).toEqual(detail.input);
      expect(calculator.result).toEqual(detail.result);
      expect(calculator.effects).toEqual(detail.effects);
    }

    const digest = createHash('sha256')
      .update(
        JSON.stringify(
          ranking.rows
            .map((row) => ({
              servantId: row.servantId,
              minimum: row.minimum,
              average: row.average,
              maximum: row.maximum,
              appliedEffectCount: row.appliedEffectCount,
            }))
            .sort((left, right) => left.servantId.localeCompare(right.servantId)),
        ),
      )
      .digest('hex');
    expect(
      [...ranking.rows]
        .sort(
          (left, right) =>
            right.average - left.average || left.name.localeCompare(right.name, 'ja'),
        )
        .slice(0, 10)
        .map(({ servantId, name, average }) => ({ servantId, name, average })),
    ).toMatchInlineSnapshot(`
      [
        {
          "average": 155602.905,
          "name": "ジャンヌ・ダルク〔オルタ〕",
          "servantId": "1100300",
        },
        {
          "average": 149177.53,
          "name": "メルトリリス",
          "servantId": "1000200",
        },
        {
          "average": 148276.155,
          "name": "クー・フーリン〔オルタ〕",
          "servantId": "702000",
        },
        {
          "average": 140259.625,
          "name": "宮本武蔵",
          "servantId": "101700",
        },
        {
          "average": 138787.995,
          "name": "アルトリア・ペンドラゴン〔オルタ〕",
          "servantId": "402700",
        },
        {
          "average": 133895.86,
          "name": "シグルド",
          "servantId": "103300",
        },
        {
          "average": 133072.84,
          "name": "エルキドゥ",
          "servantId": "300800",
        },
        {
          "average": 127447.485,
          "name": "坂田金時",
          "servantId": "700600",
        },
        {
          "average": 122325.74,
          "name": "謎のヒロインX〔オルタ〕",
          "servantId": "702400",
        },
        {
          "average": 116896.485,
          "name": "沖田総司",
          "servantId": "102700",
        },
      ]
    `);
    expect(digest).toMatchInlineSnapshot(
      `"6bf7e1358ce7f120d3e29b6490d0946f38d39b8d0a0f682360a88299d178988f"`,
    );

    const john = master.servants.find((servant) => servant.id === '1102000')!;
    const baselineJohn = calculateScenario(
      createRankingScenario(john, master, profile, DEFAULT_RANKING_CONDITIONS, versions),
      master,
      versions,
    );
    const partySizeJohn = calculateScenario(
      createRankingScenario(
        john,
        master,
        profile,
        {
          ...DEFAULT_RANKING_CONDITIONS,
          canonicalInputs: {
            ...DEFAULT_RANKING_CONDITIONS.canonicalInputs,
            allyCount: 6,
          },
        },
        versions,
      ),
      master,
      versions,
    );
    const traitCounts = (execution: typeof baselineJohn) =>
      execution.effectInputs
        .filter((input) => input.kind === 'matchingActorCount' && input.label.includes('一致数'))
        .map(({ key, value }) => ({ key, value }));
    expect(traitCounts(partySizeJohn)).toEqual(traitCounts(baselineJohn));
  }, 30_000);

  it('records the former ranking scenario separately from the new standard conditions', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const versions = {
      schemaVersion: SCHEMA_VERSION,
      masterDataVersion: master.version,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      gameRegion: 'JP' as const,
      masterDataLocale: 'ja-JP' as const,
    };
    const legacyEquivalent = master.servants.flatMap((servant) => {
      if (servant.noblePhantasms.length === 0) return [];
      const scenario = {
        ...createDefaultResolvedScenario(master, undefined, servant),
        attackerSkills: [],
      };
      const execution = calculateScenario(scenario, master, versions);
      if (execution.result.status !== 'calculated') return [];
      const row = execution.result.rows[0];
      return [
        { servantId: servant.id, minimum: row.minimum, average: row.average, maximum: row.maximum },
      ];
    });
    expect(legacyEquivalent).toHaveLength(420);
    expect([...legacyEquivalent].sort((left, right) => right.average - left.average).slice(0, 10))
      .toMatchInlineSnapshot(`
      [
        {
          "average": 115601.175,
          "maximum": 127094,
          "minimum": 104108,
          "servantId": "702000",
        },
        {
          "average": 93506.235,
          "maximum": 102815,
          "minimum": 84198,
          "servantId": "101700",
        },
        {
          "average": 88715.06,
          "maximum": 97547,
          "minimum": 79883,
          "servantId": "300800",
        },
        {
          "average": 88362.375,
          "maximum": 97137,
          "minimum": 79588,
          "servantId": "1000200",
        },
        {
          "average": 86486.235,
          "maximum": 95074,
          "minimum": 77899,
          "servantId": "603700",
        },
        {
          "average": 86445.835,
          "maximum": 95052,
          "minimum": 77840,
          "servantId": "1100300",
        },
        {
          "average": 85006.495,
          "maximum": 93456,
          "minimum": 76557,
          "servantId": "700600",
        },
        {
          "average": 83408.01,
          "maximum": 91711,
          "minimum": 75105,
          "servantId": "702500",
        },
        {
          "average": 81133.125,
          "maximum": 89198,
          "minimum": 73069,
          "servantId": "101300",
        },
        {
          "average": 80247.805,
          "maximum": 88237,
          "minimum": 72259,
          "servantId": "603600",
        },
      ]
    `);
    expect(
      createHash('sha256')
        .update(
          JSON.stringify(legacyEquivalent.sort((a, b) => a.servantId.localeCompare(b.servantId))),
        )
        .digest('hex'),
    ).toMatchInlineSnapshot(`"aaa11d899f7e522c6d0c4993e10978846e8ce2e940e8b480eb8b5a80ffe55d96"`);
  }, 30_000);
});
