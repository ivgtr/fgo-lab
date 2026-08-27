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
  calculateRankingSummary,
  DEFAULT_RANKING_CONDITIONS,
  type RankingProfileInput,
} from './ranking';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

const policyDigests = {
  'neutral:inactive': [
    '143960d6bab38f2ee68c1ecd8a9658e6f49dae91fab42ecf1a526ebb5b1b0ffb',
    'b003cad586cdb7240b42be391e739eb6474fa291051ce889fa18d88dbf41601d',
    'fbcba002283e3fa447ffc4e31565e8c713a4b338c3373d585eb4b6b4ada74260',
    '67d88881d5b8b605bc42bd9f33f3edb49f20dbb4421a2102f267a0f2e3dca8b2',
    'ef24643431136540d83dcc5b48d9aa7938f450ed66ccfefbef34859d2544058b',
  ],
  'neutral:active': [
    'ad22557404c856127796c90608260f05bbd27f5b2812a9c1d2e1a7bad6a19e6b',
    'cf27f22bda022a91e13de9bdcdfdc6d1185e6e7fb8a91bba505e84d6db6d030f',
    'fadfaf8e0156c17c86a1821aa75e07cd503d1f9dff73f99cc4faed6bdc80cbfc',
    'ff4223535f19365d7e13ea1abef26ed53926155d147aad793678524237afa476',
    '7b19c240cb038a3fde31d133f884ad01daec24c1c1ab031e889db758b09310fd',
  ],
  'favorable:inactive': [
    'a13599507b91012b973ae0d31e15e7a7c37da314678823e9735b46da7372ad0b',
    'd8e1e77fbd29eec688fecc8e07ead2fb94eac625698fe1de80f341282266df2f',
    'd17c9bd03cd3b426bce1335aeade1f30b33a57c7766e614d1b6cc9e6da3cf7a7',
    '8786de657f46b63c412dd0d86c7fd09b7c7ce66ab33f08a8c8eb8b06e515318c',
    '762715368fe68d22868d82b4d9f1a0e368bb18b467e62cc81cf7dfc92dba71d1',
  ],
  'favorable:active': [
    'eb307083458293cb0c120fd4407f75d6b113d1adde92153c0f2ffa88ff90264f',
    '82084f98e0bfd51d9a616d20dd3160a0935ea04eec0deb4c409be2758a877d32',
    'bebccf122f17af8c4ad8a7c41fa06b60a2b477e655ff87ef400f9d2027cb155f',
    '682ba3fa90511421ce96e24033c41eb63a1c04c138ae5a2982a99f4398cd7e07',
    '2fd56359ea3b71e5cf01aaec7ce5826907e081904f7446dc2893ed0e6a858b6c',
  ],
} as const;

function rankingDigest(rows: ReturnType<typeof calculateRankingSummary>['rows']): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        rows
          .map((row) => ({
            id: row.servantId,
            min: row.minimum,
            avg: row.average,
            max: row.maximum,
            effects: row.appliedEffectCount,
            special: row.specialAttackApplied,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    )
    .digest('hex');
}

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
          "average": 90768.145,
          "name": "ジャンヌ・ダルク〔オルタ〕",
          "servantId": "1100300",
        },
        {
          "average": 74701.015,
          "name": "メルトリリス",
          "servantId": "1000200",
        },
        {
          "average": 74212.83,
          "name": "クー・フーリン〔オルタ〕",
          "servantId": "702000",
        },
        {
          "average": 70660.61,
          "name": "ネモ",
          "servantId": "403700",
        },
        {
          "average": 70129.565,
          "name": "宮本武蔵",
          "servantId": "101700",
        },
        {
          "average": 69393.725,
          "name": "アルトリア・ペンドラゴン〔オルタ〕",
          "servantId": "402700",
        },
        {
          "average": 67035.175,
          "name": "シグルド",
          "servantId": "103300",
        },
        {
          "average": 66536.17,
          "name": "エルキドゥ",
          "servantId": "300800",
        },
        {
          "average": 63785.995,
          "name": "坂田金時",
          "servantId": "700600",
        },
        {
          "average": 63138.515,
          "name": "エリザベート・バートリー〔ブレイブ〕",
          "servantId": "101000",
        },
      ]
    `);
    expect(digest).toMatchInlineSnapshot(
      `"f5b7dc1746ac07387c797d683d695ff434fa5fbfea0a79ad01d810908d29dd2d"`,
    );

    expect(
      ranking.details['1102000']?.effectInputs
        .filter((input) => input.kind === 'matchingActorCount')
        .every((input) => input.value === input.minimum),
    ).toBe(true);
  }, 60_000);

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
            "average": 86738.25,
            "maximum": 95358,
            "minimum": 78118,
            "servantId": "702000",
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
          {
            "average": 78530.235,
            "maximum": 86348,
            "minimum": 70713,
            "servantId": "102000",
          },
          {
            "average": 78443.535,
            "maximum": 86253,
            "minimum": 70634,
            "servantId": "102700",
          },
        ]
      `);
    expect(
      createHash('sha256')
        .update(
          JSON.stringify(legacyEquivalent.sort((a, b) => a.servantId.localeCompare(b.servantId))),
        )
        .digest('hex'),
    ).toMatchInlineSnapshot(`"a6824c8fd85b565baeab5fa6881388e4141031d383e7e1c3f3b55785c55e4d24"`);
  }, 60_000);

  it('ratchets all E4.1 class, special-attack, and NP-level policies', async () => {
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
    for (const classAffinity of ['neutral', 'favorable'] as const)
      for (const specialAttack of ['inactive', 'active'] as const)
        for (const npLevel of [1, 2, 3, 4, 5] as const) {
          const ranking = calculateRankingSummary(
            master,
            profile,
            {
              ...DEFAULT_RANKING_CONDITIONS,
              classAffinity,
              specialAttack,
              npLevel,
            },
            versions,
          );
          expect(ranking.failures, `${classAffinity}:${specialAttack}:NP${npLevel}`).toEqual([]);
          expect(ranking.rows).toHaveLength(420);
          expect(
            ranking.rows.filter(({ specialAttackApplied }) => specialAttackApplied),
          ).toHaveLength(specialAttack === 'active' ? 206 : 0);
          expect(rankingDigest(ranking.rows)).toBe(
            policyDigests[`${classAffinity}:${specialAttack}`][npLevel - 1],
          );
        }
  }, 600_000);

  it('uses the selected NP level for NP-dependent special attack series', async () => {
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
    const expected = {
      '201200': [41_345.805, 55_027.875, 61_868.985, 65_289.45, 68_709.995],
      '505300': [41_920.51, 65_209.955, 78_601.4, 85_755.9, 93_157.3],
      '2300500': [45_754.14, 71_173.42, 85_789.5, 93_598.28, 101_676.515],
    } as const;
    for (const [servantId, averages] of Object.entries(expected)) {
      const servant = master.servants.find(({ id }) => id === servantId)!;
      const actual = [1, 2, 3, 4, 5].map((npLevel) => {
        const detail = calculateRanking(
          { ...master, servants: [servant] },
          profile,
          {
            ...DEFAULT_RANKING_CONDITIONS,
            npLevel: npLevel as 1 | 2 | 3 | 4 | 5,
            specialAttack: 'active',
          },
          versions,
        );
        expect(detail.failures).toEqual([]);
        return detail.rows[0]!.average;
      });
      expect(actual).toEqual(averages);
    }
  }, 60_000);
});
