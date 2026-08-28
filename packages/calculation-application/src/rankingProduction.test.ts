import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getBaseNoblePhantasmGroup,
  getNoblePhantasmVariants,
  masterSnapshotSchema,
} from '@fgo-lab/master-data';
import { activationFactKey, APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  analyzeActivationCondition,
  canonicalExclusiveGroup,
  conditionHasActivationFact,
} from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { calculateScenario } from './scenario';
import { createDefaultResolvedScenario } from './scenario';
import { calculateRanking, DEFAULT_RANKING_CONDITIONS, type RankingProfileInput } from './ranking';
import { calculateStandardRankingMatrix } from './rankingMatrix';
import { fieldTraitsRequiredByCondition } from './conditionProvenance';
import type { ConditionExpression } from '@fgo-lab/battle-execution';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

const policyDigests = {
  'neutral:inactive': [
    '0b3a5ebf92dd367eee872c75fdc64b07854e0624185eff4423bb3c65c472bf18',
    'b92ac13955809736485546279db050a0778290d5a982c56653e31428f2523269',
    '42575cca07289c1adcad024ad1962066adcc29b146a590ebd8eddb8ad20b0a9d',
    '761759714ddc3874cab1cc010cfd19f21b862c8df23f0402c901a10889139085',
    '182baae795da2dd298f4450f7a567f888b1ff6d79dc060c5904d7e639a1cbf6c',
  ],
  'neutral:active': [
    'f027075ed12d05bc203fe60cea50e314ff0c564abb7a2732a54e796ab68371c3',
    'b31a877d5ad06cb3ed545f81e811aa9e0be684fe7a684b12aa8baa3c7851d741',
    'fd921d48a75dec23a60fc8e133b9a8217aec4b7a42f8f566bafd64be3193bad5',
    '1f5aeb44648bb85c793235fbbf28547f7564cea3365102a1f0dc860af310b3a1',
    '794609c30134f637693079018942745439939541ec75f772ce97e43d6c32156d',
  ],
  'favorable:inactive': [
    '3608e604544bb73a97a0f958ede2d2238c870dd930dd10213d13e37439d8bf35',
    '410f3db4f52858c0353ec8c6f1db9bf59dc1a18cff2bd42aa203587a523b0575',
    '5f5fff56199820ade9e2e7619746158cb4c246e90e47e3d013c93d37b4fc5b68',
    '3b5ca0dff09bc8228e5b3fd8b9d60f4ad75b7a49a37cc1a4ee58dcc4165e1d22',
    '1d03ad4dc99d5c99b236892f9785668efe64c7eda1d63e54b5817b214d5cb7a7',
  ],
  'favorable:active': [
    'cd97f4cf9082f17e02c58c83c5d6f6a405bb717164f0d214908e442f9713fb92',
    'e63de2574f5a2f73ab9ed2d8d4813a7c1069e47c3647773aee5c21ef353a28a3',
    'b2acc827d084b8c8b6c92812dc47b9bbc0c44865cc68048e5e8e1ae7e564afeb',
    'b163bf86ee1b22965183634be109c19f5204286aa1f7d8aa839c7b01f528eb7d',
    '9de23902121b8a5f9efb864ceb94ce418ad90ea053e0eb675a52185f357ea0b9',
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

function activationKinds(
  condition: ConditionExpression | null,
): Set<'choice' | 'operationTrigger' | 'sourceQuantity'> {
  if (!condition) return new Set();
  if (
    condition.kind === 'choice' ||
    condition.kind === 'operationTrigger' ||
    condition.kind === 'sourceQuantity'
  )
    return new Set([condition.kind]);
  if (condition.kind === 'all' || condition.kind === 'any')
    return new Set(condition.expressions.flatMap((expression) => [...activationKinds(expression)]));
  return condition.kind === 'not' ? activationKinds(condition.expression) : new Set();
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
    expect(ranking.rows).toHaveLength(422);
    expect(new Set(ranking.rows.map(({ entryId }) => entryId)).size).toBe(422);
    expect(ranking.rows.filter(({ npTarget }) => npTarget === 'single')).toHaveLength(177);
    expect(ranking.rows.filter(({ npTarget }) => npTarget === 'all')).toHaveLength(245);
    expect(
      ranking.rows
        .filter(({ servantId }) => servantId === '2301100')
        .map(({ npTarget }) => npTarget),
    ).toEqual(['single', 'all']);
    expect(
      ranking.rows
        .filter(({ servantId }) => servantId === '204900')
        .map(({ npTarget }) => npTarget),
    ).toEqual(['single', 'all']);
    const unresolvedIncludedDamageEffects: string[] = [];
    const activationInventory = { choice: 0, operationTrigger: 0, sourceQuantity: 0 };
    const activationConditionInventory = { choice: 0, operationTrigger: 0, sourceQuantity: 0 };
    const servantsWithActivationSelections: string[] = [];
    for (const row of ranking.rows) {
      const detail = ranking.details[row.entryId]!;
      expect(detail.npTarget).toBe(row.npTarget);
      expect(detail.noblePhantasmVariant).toEqual(row.noblePhantasmVariant);
      const included = new Set(
        detail.scenario.effectDecisions
          .filter(({ operationEnabled }) => operationEnabled)
          .map(({ decisionKey }) => decisionKey),
      );
      for (const fact of detail.scenario.activationFacts) activationInventory[fact.kind] += 1;
      const factKeys = detail.scenario.activationFacts.map(activationFactKey);
      expect(new Set(factKeys).size, row.servantId).toBe(factKeys.length);
      if (detail.scenario.activationFacts.length > 0)
        servantsWithActivationSelections.push(row.servantId);
      for (const effect of detail.effects) {
        if (effect.modifier === null) continue;
        for (const kind of activationKinds(effect.explanation.condition))
          activationConditionInventory[kind] += 1;
        if (
          included.has(effect.projectionKey) &&
          effect.explanation.condition !== null &&
          conditionHasActivationFact(effect.explanation.condition)
        ) {
          const analysis = analyzeActivationCondition(effect.explanation.condition);
          const facts =
            analysis.status === 'supported' && analysis.materialization.kind === 'deterministic'
              ? analysis.materialization.facts
              : [];
          for (const fact of facts) {
            expect(
              detail.scenario.activationFacts.some(
                (candidate) => activationFactKey(candidate) === activationFactKey(fact),
              ),
              `${row.servantId}:${effect.projectionKey}:${activationFactKey(fact)}`,
            ).toBe(true);
          }
        }
      }
      unresolvedIncludedDamageEffects.push(
        ...detail.effects.flatMap((effect) =>
          included.has(effect.projectionKey) &&
          effect.modifier !== null &&
          effect.explanation.condition !== null &&
          conditionHasActivationFact(effect.explanation.condition) &&
          effect.explanation.code === 'unresolved'
            ? [`${row.servantId}:${effect.projectionKey}:${effect.operationId}`]
            : [],
        ),
      );
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
    expect(unresolvedIncludedDamageEffects).toEqual([]);
    expect(activationInventory).toEqual({
      choice: 9,
      operationTrigger: 4,
      sourceQuantity: 1,
    });
    expect(activationConditionInventory).toEqual({
      choice: 33,
      operationTrigger: 4,
      sourceQuantity: 3,
    });
    expect(servantsWithActivationSelections.sort()).toEqual([
      '101000',
      '1100900',
      '204900',
      '204900',
      '2301100',
      '2301200',
      '2501100',
      '2800500',
      '305600',
      '603800',
      '705300',
    ]);

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
    expect(areaDetails).toHaveLength(175);
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
    ).toBe(234);
    const tonelico = ranking.details['505300:all']!;
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

    const jalter = ranking.details['1100300:single']!;
    expect(jalter.input).toMatchObject({ classAffinity: 1, attackBuff: 0.2, cardBuff: 0.5 });
    expect(jalter.result.status === 'calculated' ? jalter.result.rows[0] : null).toEqual({
      npLevel: 1,
      minimum: 70_056,
      average: 77_801.205,
      maximum: 85_546,
    });
    expect(jalter.areaContribution?.withoutAreaInput.attackBuff).toBe(0);

    const xxAlter = ranking.details['2501600:single']!;
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
          "average": 77801.205,
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
        {
          "average": 61162.615,
          "name": "謎のヒロインX〔オルタ〕",
          "servantId": "702400",
        },
      ]
    `);
    expect(digest).toMatchInlineSnapshot(
      `"da949087fde3947335e292a0b80f59f9a09405debe779c917a83fcdf462f2518"`,
    );
    expect(
      [...ranking.rows]
        .filter(({ npTarget }) => npTarget === 'single')
        .sort((left, right) => right.average - left.average)[0]?.servantId,
    ).toBe('1100300');

    expect(
      ranking.details['1102000:all']?.effectInputs
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
    ).toBe(18);
    expect(
      Math.max(
        ...Object.values(ranking.details).map(
          ({ executionMetrics }) => executionMetrics.scenarioCalculationCount,
        ),
      ),
    ).toBe(20);
  }, 60_000);

  it('uses canonical witnesses for recipient and field conditions', async () => {
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
    for (const field of ['inactive', 'active'] as const) {
      const ranking = calculateRanking(
        master,
        profile,
        { ...DEFAULT_RANKING_CONDITIONS, field },
        versions,
      );
      expect(ranking.failures, field).toEqual([]);
      expect(ranking.rows).toHaveLength(422);
      for (const detail of Object.values(ranking.details)) {
        expect(
          detail.scenario.effectDecisions.filter(
            ({ conditionSatisfaction }) => conditionSatisfaction === 'assumeSatisfied',
          ),
          detail.servantId,
        ).toEqual([]);
        const externalFieldFacts = detail.scenario.worldFactAssertions.filter(
          ({ decisionKey, fact }) =>
            decisionKey.startsWith('ranking:field:') && fact.kind === 'trait' && fact.present,
        );
        if (field === 'inactive') expect(externalFieldFacts, detail.servantId).toEqual([]);
        const exclusiveGroups = externalFieldFacts.flatMap(({ fact }) => {
          if (fact.kind !== 'trait') return [];
          const group = canonicalExclusiveGroup('field', fact.trait);
          return group ? [group] : [];
        });
        expect(new Set(exclusiveGroups).size, detail.servantId).toBe(exclusiveGroups.length);
        for (const effect of detail.effects) {
          if (effect.outcome !== 'applied') continue;
          const fieldTraits = fieldTraitsRequiredByCondition(effect.explanation.condition);
          if (fieldTraits.length === 0) continue;
          expect(
            fieldTraits.some((trait) => detail.input.fieldTraits.includes(trait)),
            `${detail.servantId}:${effect.source.effectOccurrenceId}`,
          ).toBe(true);
        }
        expect(detail.input.classAffinity, detail.servantId).toBe(1);
      }
    }
  }, 120_000);

  it('ratchets the field-active NP series', async () => {
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
    const conditions = {
      comparisonMode: DEFAULT_RANKING_CONDITIONS.comparisonMode,
      classAffinity: DEFAULT_RANKING_CONDITIONS.classAffinity,
      selfBuffs: DEFAULT_RANKING_CONDITIONS.selfBuffs,
      specialAttack: DEFAULT_RANKING_CONDITIONS.specialAttack,
      field: 'active' as const,
    };
    const matrix = calculateStandardRankingMatrix(master, profile, conditions, versions);
    const digests = [
      '60d739247e2a174aa4fc8bea29b57881164170a8411a229f9b4ab88ec6c1d4df',
      'f45ed459836dd9c92643d33c28b0eeacceb9dabbd077dab2aab5a671e9a34f55',
      '785b6aa01e7b1ed493a484ec22e2d01ed241a487de9d65c1028a817176b9cf0b',
      '7417c2dfea4202e76414339659a02082ce24f228b970012631f22e0ce5c0ea1b',
      '218a01de8a54540ea4fdc6e2da6e931babc842c120aac555a821e6d068577b35',
    ];
    const actualDigests: string[] = [];
    for (const [index, ranking] of matrix.entries()) {
      expect(ranking.failures, `field:active:NP${String(index + 1)}`).toEqual([]);
      expect(ranking.rows).toHaveLength(422);
      actualDigests.push(rankingDigest(ranking.rows));
    }
    expect(actualDigests).toEqual(digests);
  }, 120_000);

  it('ratchets NP-before-damage operations to one execution-valid value across NP levels', async () => {
    const master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    const varying = master.servants.flatMap((servant) =>
      getNoblePhantasmVariants(servant).flatMap((np) =>
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
      if (!getBaseNoblePhantasmGroup(servant)?.variants.some(({ kind }) => kind === 'attack'))
        return [];
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
    ).toMatchInlineSnapshot(`"2230ac7617cd9dc634ec1ba9a9bec780b9b692c32e641e0db57080810fdc3f3a"`);
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
    const actualDigests: Record<string, string[]> = {};
    for (const classAffinity of ['neutral', 'favorable'] as const)
      for (const specialAttack of ['inactive', 'active'] as const) {
        const conditions = {
          comparisonMode: DEFAULT_RANKING_CONDITIONS.comparisonMode,
          classAffinity,
          selfBuffs: DEFAULT_RANKING_CONDITIONS.selfBuffs,
          specialAttack,
          field: DEFAULT_RANKING_CONDITIONS.field,
        };
        const matrix = calculateStandardRankingMatrix(master, profile, conditions, versions);
        const key = `${classAffinity}:${specialAttack}`;
        actualDigests[key] = [];
        if (classAffinity === 'neutral' && specialAttack === 'inactive') {
          const averages = (entryId: string) =>
            matrix.map(({ rows }) => rows.find((row) => row.entryId === entryId)?.average);
          expect(averages('2301100:single')).toEqual([
            47_794.55, 63_726.225, 71_692.08, 75_675.005, 79_657.925,
          ]);
          expect(averages('2301100:all')).toEqual([
            31_250.115, 41_666.99, 46_875.425, 49_479.64, 52_083.865,
          ]);
          expect(averages('204900:single')).toEqual([
            45_307.295, 60_409.895, 67_961.14, 71_736.845, 75_512.49,
          ]);
          expect(averages('204900:all')).toEqual([
            22_653.385, 30_204.705, 33_980.14, 35_868.165, 37_755.995,
          ]);
          expect(averages('1100900:all')).toEqual([
            33_578.155, 44_681.035, 50_232.475, 53_008.195, 55_783.92,
          ]);
          expect(averages('2300600:all')).toEqual([
            22_377.555, 29_753.58, 33_441.59, 35_285.585, 37_129.595,
          ]);
          expect(
            matrix[0].rows.find(({ entryId }) => entryId === '1100900:all')?.noblePhantasmVariant,
          ).toEqual({ actorFormId: '1100900', noblePhantasmId: '1100998' });
        }
        for (const [index, ranking] of matrix.entries()) {
          const npLevel = (index + 1) as 1 | 2 | 3 | 4 | 5;
          expect(ranking.failures, `${classAffinity}:${specialAttack}:NP${npLevel}`).toEqual([]);
          expect(ranking.rows).toHaveLength(422);
          expect(
            ranking.rows.filter(({ specialAttackApplied }) => specialAttackApplied),
          ).toHaveLength(specialAttack === 'active' ? 190 : 0);
          actualDigests[key].push(rankingDigest(ranking.rows));
        }
      }
    expect(actualDigests).toEqual(policyDigests);
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
