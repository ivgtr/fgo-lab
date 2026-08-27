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
    '143960d6bab38f2ee68c1ecd8a9658e6f49dae91fab42ecf1a526ebb5b1b0ffb',
    'b003cad586cdb7240b42be391e739eb6474fa291051ce889fa18d88dbf41601d',
    'fbcba002283e3fa447ffc4e31565e8c713a4b338c3373d585eb4b6b4ada74260',
    '67d88881d5b8b605bc42bd9f33f3edb49f20dbb4421a2102f267a0f2e3dca8b2',
    'ef24643431136540d83dcc5b48d9aa7938f450ed66ccfefbef34859d2544058b',
  ],
  'neutral:active': [
    '1e4e8a2301c293eed4b2d3b7a7cce73383300933f8fc13786adb1b625278c477',
    'b4943d4d51e5ec6b15475e561e819ffe2041730c06f323d115d0221ce373fd48',
    'ddf4af53625223198bcef069967f9f1d63330f241b4cb7cca8704883daafadb0',
    '7c08bf10f39d597b06f56e42f0a5244ad1d0d9d4f41ae2e18afde528c136813d',
    '6940e04855b0448eca74f4c05dd0a9ff13ec310f44d211022a45ddce39f9a94f',
  ],
  'favorable:inactive': [
    'a13599507b91012b973ae0d31e15e7a7c37da314678823e9735b46da7372ad0b',
    'd8e1e77fbd29eec688fecc8e07ead2fb94eac625698fe1de80f341282266df2f',
    'd17c9bd03cd3b426bce1335aeade1f30b33a57c7766e614d1b6cc9e6da3cf7a7',
    '8786de657f46b63c412dd0d86c7fd09b7c7ce66ab33f08a8c8eb8b06e515318c',
    '762715368fe68d22868d82b4d9f1a0e368bb18b467e62cc81cf7dfc92dba71d1',
  ],
  'favorable:active': [
    '2678d1fadb3402139cde114e50d0bd2d371e5c5342729ff0b68c4ed3399c94b6',
    '36262bc679d2b31f7183d33cb798064732c6ae38668b6e1697614659cbc646cb',
    'b7f4a228daae044d9fdfbd66d498ae7a827b6f527543c88c617de4362ad60aab',
    '589f2d178e38b196422a2f70087aedf905f439a431725a997c34221b770ca967',
    'e2105a5c902459306cd558c7ae7c25e62bf67d02f2713110b04d8ea39cff7911',
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
      expect(detail.scenario.targetContext.class, row.servantId).toEqual({
        kind: 'relative',
        relation: 'neutral',
      });
      expect(detail.input.classAffinity, row.servantId).toBe(1);
      const calculator = calculateScenario(detail.scenario, master, versions);
      expect(calculator.input).toEqual(detail.input);
      expect(calculator.result).toEqual(detail.result);
      expect(calculator.effects).toEqual(detail.effects);
      expect(
        detail.effects.filter(
          (effect) =>
            effect.outcome === 'applied' &&
            effect.visibility === 'visible' &&
            effect.contributionScope === 'partyOther',
        ),
      ).toEqual([]);
      if (detail.areaContribution) {
        const withoutAreaCalculator = calculateScenario(
          detail.areaContribution.withoutAreaScenario,
          master,
          versions,
        );
        expect(withoutAreaCalculator.input).toEqual(detail.areaContribution.withoutAreaInput);
        expect(withoutAreaCalculator.result).toEqual(detail.areaContribution.withoutAreaResult);
        expect(detail.areaContribution.withoutAreaScenario.targetContext).toEqual(
          detail.scenario.targetContext,
        );
      }
    }

    const areaDetails = Object.values(ranking.details).filter((detail) => {
      if (
        detail.result.status !== 'calculated' ||
        detail.areaContribution?.withoutAreaResult.status !== 'calculated'
      )
        return false;
      const index = detail.scenario.attacker.npLevel - 1;
      return (
        detail.areaContribution.withoutAreaResult.rows[index]!.average !==
        detail.result.rows[index]!.average
      );
    });
    expect(areaDetails).toHaveLength(176);
    expect(
      areaDetails.reduce(
        (count, detail) =>
          count +
          new Set(
            detail.effects
              .filter(
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
      minimum: 25_165,
      average: 27_946.83,
      maximum: 30_729,
    });
    expect(
      tonelico.areaContribution?.withoutAreaResult.status === 'calculated'
        ? tonelico.areaContribution.withoutAreaResult.rows[0]
        : null,
    ).toEqual({ npLevel: 1, minimum: 16_776, average: 18_631.06, maximum: 20_486 });

    const jalter = ranking.details['1100300']!;
    expect(jalter.input).toMatchObject({ classAffinity: 1, attackBuff: 0.4, cardBuff: 0.5 });
    expect(jalter.result.status === 'calculated' ? jalter.result.rows[0] : null).toEqual({
      npLevel: 1,
      minimum: 81_732,
      average: 90_768.145,
      maximum: 99_804,
    });
    expect(jalter.areaContribution?.withoutAreaInput.attackBuff).toBe(0);

    const xxAlter = ranking.details['2501600']!;
    expect(xxAlter.scenario.targetContext.class).toEqual({ kind: 'relative', relation: 'neutral' });
    expect(xxAlter.input).toMatchObject({ classAffinity: 1, powerMod: 0 });
    expect(xxAlter.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(xxAlter.result.status === 'calculated' ? xxAlter.result.rows[0] : null).toEqual({
      npLevel: 1,
      minimum: 35_461,
      average: 39_381.22,
      maximum: 43_302,
    });

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
      [...ranking.rows]
        .filter(({ npTarget }) => npTarget === 'single')
        .sort((left, right) => right.average - left.average)[0]?.servantId,
    ).toBe('1100300');

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
          ).toHaveLength(specialAttack === 'active' ? 206 : 0);
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
