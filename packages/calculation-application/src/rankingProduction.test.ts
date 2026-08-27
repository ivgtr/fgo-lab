import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { describe, expect, it } from 'vitest';
import { calculateScenario } from './scenario';
import { createDefaultResolvedScenario } from './scenario';
import { calculateRanking, DEFAULT_RANKING_CONDITIONS, type RankingProfileInput } from './ranking';
import { calculateStandardRankingMatrix } from './rankingMatrix';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

const policyDigests = {
  'neutral:inactive': [
    'c05a527fa5e7adb7b027f10188052a0c3aae766e544913fa3f8f0586ddffd861',
    '4b64710cb3133f4d1c6ea6576beae2c802024f834529b594e8d2289b935f5e33',
    'd0fd13632f00b7076b717a0a6de304c10b59e912c60f36980ea34ca5dfb7d5b0',
    'ecb5be52a28b666a60d9608b31f66fb9baf2cb0e09cc6dd897302a1de2fa8839',
    'f3fd03fc1d294e02b62907470d081b72bdb897353a21882645493eab536f3b8b',
  ],
  'neutral:active': [
    '546b863c7f02ea4372bb6e79f6103c67cf71a62842b68d199102c2ef119b3512',
    '51e2d2924c0ec5076c2a3b5b4903e6e7cf90c28bf9e25aefbdd10e31c4d82e0b',
    '87e12bb553a08de168b3accd50969fa4db18d598207f9000932fccc87776158d',
    'd1844e0f66fe4a3f3f2a700d57bf6a925557b898f113e626c76f4dbf0c3346d7',
    'fabc4f8c189fa79f8780284f161c9856b421a33c63f5bf34b43edcd78676c6b6',
  ],
  'favorable:inactive': [
    '333214236e6cb71630018a2d33578046766af3797174bedc4e9d7c2f38d31a8c',
    '3bdb8d3b0eac27978757b26bc0ecb0473e6255065cc0434b974b6876bcf5c293',
    '089008ce7e71fbc746bdd085f85753fbc5c1e7c5b2033f87677ce9972808851c',
    'cda1e06b459f26df41dc8dfc81af7631606c5af99ee08a520bc98396bbe33325',
    '97dc1761f3a0b780376cdbdbd1c09a7fe8b13e2ba97a8b6b17cbc73edd0f195b',
  ],
  'favorable:active': [
    '89e8d1f48d753361854a32c914f7c145d5a383920485729cf2d78ffed573bebb',
    '9b45cc554700e2b5069d2d4f5836478014bbd32513f2b96ef2b5b351a75992c1',
    'd15b2442bbc33d6ff38074673360ff070e1032f8c13319a11929404d276d0c9c',
    '50b703ea8abdf10eba3c4f4475d16c9d217acd9cfb02db33edb236ae51c12815',
    '41455bc79343ab5917f2da33176c552282a07c896a5663b9539289cbdfc71735',
  ],
} as const;

function rankingDigest(rows: ReturnType<typeof calculateRanking>['rows']): string {
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
      expect(
        detail.effects.filter(
          (effect) =>
            effect.outcome === 'applied' &&
            effect.visibility === 'visible' &&
            (effect.contributionScope === 'partyWide' || effect.contributionScope === 'partyOther'),
        ),
      ).toEqual([]);
      if (detail.areaSupport) {
        const areaCalculator = calculateScenario(detail.areaSupport.scenario, master, versions);
        expect(areaCalculator.input).toEqual(detail.areaSupport.input);
        expect(areaCalculator.result).toEqual(detail.areaSupport.result);
        expect(detail.areaSupport.scenario.targetContext).toEqual(detail.scenario.targetContext);
      }
    }

    const areaDetails = Object.values(ranking.details).filter((detail) => {
      if (
        detail.result.status !== 'calculated' ||
        detail.areaSupport?.result.status !== 'calculated'
      )
        return false;
      const index = detail.scenario.attacker.npLevel - 1;
      return detail.areaSupport.result.rows[index]!.average !== detail.result.rows[index]!.average;
    });
    expect(areaDetails).toHaveLength(176);
    expect(
      areaDetails.reduce(
        (count, detail) =>
          count +
          new Set(
            detail
              .areaSupport!.effects.filter(
                (effect) =>
                  effect.outcome === 'applied' && effect.contributionScope === 'partyWide',
              )
              .map((effect) => effect.projectionKey),
          ).size,
        0,
      ),
    ).toBe(246);
    const tonelico = ranking.details['505300']!;
    expect(tonelico.result.status === 'calculated' ? tonelico.result.rows[0] : null).toEqual({
      npLevel: 1,
      minimum: 16_776,
      average: 18_631.06,
      maximum: 20_486,
    });
    expect(
      tonelico.areaSupport?.result.status === 'calculated'
        ? tonelico.areaSupport.result.rows[0]
        : null,
    ).toEqual({ npLevel: 1, minimum: 25_165, average: 27_946.83, maximum: 30_729 });

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
          "average": 78762.96,
          "name": "謎のヒロインXX〔オルタ〕",
          "servantId": "2501600",
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
          "average": 70129.565,
          "name": "宮本武蔵",
          "servantId": "101700",
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
          "average": 64834.26,
          "name": "ジャンヌ・ダルク〔オルタ〕",
          "servantId": "1100300",
        },
        {
          "average": 63785.995,
          "name": "坂田金時",
          "servantId": "700600",
        },
        {
          "average": 60678.115,
          "name": "カズラドロップ",
          "servantId": "1001800",
        },
        {
          "average": 60609.655,
          "name": "アルトリア・ペンドラゴン〔オルタ〕",
          "servantId": "402700",
        },
      ]
    `);
    expect(digest).toMatchInlineSnapshot(
      `"7210191096fcb7b830061d922728260b31a665d70e66191f321dee73390199f3"`,
    );

    expect(
      ranking.details['1102000']?.effectInputs
        .filter((input) => input.kind === 'matchingActorCount')
        .every((input) => input.value === input.minimum),
    ).toBe(true);
  }, 60_000);

  it('bounds world exploration by canonical candidates rather than effect subsets', async () => {
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
    const ranking = calculateRanking(
      master,
      profile,
      { ...DEFAULT_RANKING_CONDITIONS, specialAttack: 'active' },
      versions,
    );
    expect(ranking.failures).toEqual([]);
    expect(
      Math.max(
        ...Object.values(ranking.details).map(
          ({ executionMetrics }) => executionMetrics.worldCandidateCount,
        ),
      ),
    ).toBe(12);
    expect(
      Math.max(
        ...Object.values(ranking.details).map(
          ({ executionMetrics }) => executionMetrics.scenarioCalculationCount,
        ),
      ),
    ).toBe(14);
  }, 60_000);

  it('ratchets NP-before-damage operations to one execution-valid value across NP levels', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const varying = master.servants.flatMap((servant) =>
      servant.noblePhantasms.flatMap((np) =>
        np.effects.flatMap((effect) =>
          effect.timing !== 'beforeDamage'
            ? []
            : effect.execution.flatMap((operation) =>
                'values' in operation && operation.values.some((set) => new Set(set).size > 1)
                  ? [`${servant.id}:${effect.occurrenceId}:${operation.kind}`]
                  : [],
              ),
        ),
      ),
    );
    expect(varying).toEqual([]);
  });

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
      for (const specialAttack of ['inactive', 'active'] as const) {
        const conditions = {
          comparisonMode: DEFAULT_RANKING_CONDITIONS.comparisonMode,
          classAffinity,
          selfBuffs: DEFAULT_RANKING_CONDITIONS.selfBuffs,
          specialAttack,
        };
        const matrix = calculateStandardRankingMatrix(master, profile, conditions, versions);
        for (const [index, ranking] of matrix.entries()) {
          const npLevel = (index + 1) as 1 | 2 | 3 | 4 | 5;
          expect(ranking.failures, `${classAffinity}:${specialAttack}:NP${npLevel}`).toEqual([]);
          expect(ranking.rows).toHaveLength(420);
          expect(
            ranking.rows.filter(({ specialAttackApplied }) => specialAttackApplied),
          ).toHaveLength(specialAttack === 'active' ? 198 : 0);
          expect(rankingDigest(ranking.rows)).toBe(
            policyDigests[`${classAffinity}:${specialAttack}`][npLevel - 1],
          );
        }
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
      '505300': [27_946.83, 43_473.15, 52_400.755, 57_170.4, 62_104.685],
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
