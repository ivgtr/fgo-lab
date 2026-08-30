import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { actorFormKey, getNoblePhantasmVariants, masterSnapshotSchema } from '@fgo-lab/master-data';
import { activationFactKey, APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  analyzeActivationCondition,
  canonicalExclusiveGroup,
  conditionHasActivationFact,
} from '@fgo-lab/battle-execution';
import { describe, expect, it } from 'vitest';
import { calculateScenarioWithContributionProjection } from './scenario';
import { calculateRanking, DEFAULT_RANKING_CONDITIONS, type RankingProfileInput } from './ranking';
import { calculateStandardRankingMatrix } from './rankingMatrix';
import { fieldTraitsRequiredByCondition } from './conditionProvenance';
import type { ConditionExpression } from '@fgo-lab/battle-execution';
import {
  actorFormProfileIdKey,
  attackProfileForTerminalState,
  attackProfileKey,
  createActorFormProfiles,
} from './attackProfile';
import { planPreNoblePhantasmCandidates } from './preNoblePhantasmPlanner';
import { rankingEffectContributes, resolveRankingEffectContribution } from './rankingContribution';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

const policyDigests = {
  'neutral:inactive': [
    'fa8ad1caa9e4823cbca55fd87174eca1f78ecf2c76ae52d606435ccab964406f',
    '4fd83c3b9ad7d5d8747440d3ebddc80c0450a089a4fc5285c7e2ac388a308c6a',
    '9cd251698c01ad12b5e78bf1400e872522ee80332d3cc93dc4da3480d24c5bc4',
    '77236e31edc521f2f3963cdf6328016e35f6f518c8ed09c9fac4826537153714',
    'e2cee61e4c0c455cc6ab8be35ec0c15a6076ac47b398a84e66a24efb0b4bd3c7',
  ],
  'neutral:active': [
    '89c714451adaa9e036efcff89c4f3f39e2ef34a7cc7b5b501197aae423b7757e',
    'c3084612f6b42bef1a71051aab60abe458e900acaa44b168acd82dd9c9d18b05',
    '406d8dfe158de762955b1a54d95b476ec83319c38701166675fb57b071574e3f',
    'b76d855ac133effe0205818fdb2cdceede6d9d5534c2922f341e4a50355f9ce9',
    'de479953bd964addb3b285d66ee7ecdc94713546e3d5d6d404addb60d04c495c',
  ],
  'favorable:inactive': [
    '2e6fe894fa13a10d7725b60e4c9946b3860ec58854e0822e80cd5bb68b13809b',
    'f61e2b9af57a5c7ad9e00e6c64047edadc965cb0745bebca091988f7a56bf795',
    'd8fd964d773719d6eefcd89e6bf883983ae59b63a8fbc991e7b23f4c76be23bc',
    'df84481d7b8bd924b10d1953ac30d8d211f46a816704ec30b095fa388f2ff247',
    'afa54cb3e18eb9f67ae14dc3a232f8a25239d6dfcc5d16d5846921f33f013a93',
  ],
  'favorable:active': [
    'f237b0b3af7b526d39afb079352bba541ea441a2ef89c88675d3955354bff47e',
    '319fbff9c34b8fb88b0180e5821d5cb95df8fd98e3fa4c16616eba4202f6fead',
    '8a666ed3dfe77388a0e3fc5e7766e208bbff460d14b21f334670c562657c7f41',
    'a4f4cfc018958c960a382c58009db0f01d75b789fbcf87a56a08ad50c082eed8',
    'd79500ca71d5041c451f8f2a8ebd4a64f84050c906ec0d05eb482ac8513ceab8',
  ],
} as const;

function rankingDigest(rows: ReturnType<typeof calculateRanking>['rows']): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        rows
          .map((row) => ({
            entry: row.entryId,
            min: row.minimum,
            avg: row.average,
            max: row.maximum,
            effects: row.appliedEffectCount,
            special: row.specialAttackApplied,
          }))
          .sort((left, right) => left.entry.localeCompare(right.entry)),
      ),
    )
    .digest('hex');
}

function rankingDetailFor(
  ranking: ReturnType<typeof calculateRanking>,
  servantId: string,
  noblePhantasmId?: string,
) {
  const matches = Object.values(ranking.details).filter(
    (detail) =>
      detail.servantId === servantId &&
      (noblePhantasmId === undefined ||
        detail.noblePhantasmVariant.noblePhantasmId === noblePhantasmId),
  );
  if (matches.length !== 1)
    throw new TypeError(
      `ranking_detail_not_unique:${servantId}:${noblePhantasmId ?? 'any'}:${String(matches.length)}`,
    );
  return matches[0]!;
}

function groupRankingRows(
  rows: ReturnType<typeof calculateRanking>['rows'],
  keyFor: (row: ReturnType<typeof calculateRanking>['rows'][number]) => string,
) {
  const groups = new Map<string, ReturnType<typeof calculateRanking>['rows'][number][]>();
  for (const row of rows) groups.set(keyFor(row), [...(groups.get(keyFor(row)) ?? []), row]);
  return groups;
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
    expect(ranking.damageCache).toEqual({
      requestCount: 3_744,
      distinctDamageInputCount: 1_644,
      cacheHitCount: 2_100,
      cacheHitRate: 2_100 / 3_744,
    });
    expect(ranking.rows).toHaveLength(433);
    expect(new Set(ranking.rows.map(({ entryId }) => entryId)).size).toBe(433);
    expect(ranking.rows.filter(({ npTarget }) => npTarget === 'single')).toHaveLength(180);
    expect(ranking.rows.filter(({ npTarget }) => npTarget === 'all')).toHaveLength(253);
    const summerLilithRow = ranking.rows.find(
      ({ servantId, noblePhantasmVariant }) =>
        servantId === '405900' && noblePhantasmVariant.noblePhantasmId === '405901',
    );
    expect(summerLilithRow).toBeDefined();
    const summerLilithDetail = summerLilithRow
      ? ranking.details[summerLilithRow.entryId]
      : undefined;
    expect(summerLilithDetail?.input.targetStateTraits).toEqual(
      expect.arrayContaining(['buffCharm', 'buffConfusion']),
    );
    expect(
      summerLilithDetail?.scenario.mode === 'resolved'
        ? summerLilithDetail.scenario.worldFactAssertions.filter(
            ({ decisionKey, fact }) =>
              decisionKey.startsWith('ranking:targetState:') &&
              fact.kind === 'trait' &&
              fact.present,
          )
        : null,
    ).toEqual([]);
    const excludedVisibleEffects = Object.values(ranking.details).flatMap((detail) =>
      detail.effects.flatMap((effect) =>
        effect.visibility === 'visible' &&
        resolveRankingEffectContribution(effect, detail.contributionProjection) ===
          'excludedByRankingPolicy'
          ? [{ entryId: detail.entryId, effect }]
          : [],
      ),
    );
    expect({
      entries: new Set(excludedVisibleEffects.map(({ entryId }) => entryId)).size,
      effects: excludedVisibleEffects.length,
    }).toEqual({ entries: 20, effects: 22 });
    const appliedExcludedVisibleEffects = excludedVisibleEffects.filter(
      ({ effect }) => effect.outcome === 'applied',
    );
    expect({
      entries: new Set(appliedExcludedVisibleEffects.map(({ entryId }) => entryId)).size,
      effects: appliedExcludedVisibleEffects.length,
    }).toEqual({ entries: 13, effects: 14 });
    expect(
      appliedExcludedVisibleEffects
        .filter(({ entryId }) => entryId === summerLilithDetail?.entryId)
        .map(({ effect }) => effect.modifier)
        .sort(),
    ).toEqual(['npSpecial', 'powerMod']);
    const nonAppliedReasonCounts = Object.values(ranking.details)
      .flatMap((detail) => detail.effects)
      .filter((effect) => effect.visibility === 'visible' && effect.outcome !== 'applied')
      .reduce<Record<string, number>>((counts, effect) => {
        counts[effect.explanation.code] = (counts[effect.explanation.code] ?? 0) + 1;
        return counts;
      }, {});
    expect(nonAppliedReasonCounts.unresolved).toBe(303);
    expect(nonAppliedReasonCounts.disabled).toBe(30);
    const mixedProjectionGroups = Object.values(ranking.details).flatMap((detail) => {
      const groups = new Map<string, typeof detail.effects>();
      for (const effect of detail.effects)
        groups.set(effect.projectionKey, [...(groups.get(effect.projectionKey) ?? []), effect]);
      return [...groups.values()].filter(
        (effects) =>
          effects.some((effect) =>
            rankingEffectContributes(effect, detail.contributionProjection),
          ) && effects.some((effect) => effect.outcome !== 'applied'),
      );
    });
    expect(mixedProjectionGroups).toHaveLength(1);
    let actorFormNodeCount = 0;
    let actorFormProfileCount = 0;
    const expectedAttackProfiles = master.servants.flatMap((servant) => {
      const candidates = planPreNoblePhantasmCandidates(servant).candidates;
      if (candidates.length === 0) return [];
      const profiles = createActorFormProfiles(
        servant,
        candidates.map(({ terminalState }) => terminalState),
      );
      actorFormNodeCount += servant.actorFormGraph.forms.length;
      actorFormProfileCount += profiles.length;
      return candidates.map(({ terminalState }) =>
        attackProfileForTerminalState(servant, profiles, terminalState),
      );
    });
    const expectedAttackProfileKeys = [
      ...new Set(expectedAttackProfiles.map(attackProfileKey)),
    ].sort();
    const expectedServantScopeKeys = [
      ...new Set(
        expectedAttackProfiles.map(
          ({ id, targetScope }) => `${id.servantLineageId}:${targetScope}`,
        ),
      ),
    ].sort();
    const expectedAttackServantIds = [
      ...new Set(expectedServantScopeKeys.map((key) => key.split(':')[0]!)),
    ].sort();
    const scopesByServant = new Map<string, Set<'single' | 'all'>>();
    for (const row of ranking.rows) {
      const scopes = scopesByServant.get(row.servantId) ?? new Set();
      scopes.add(row.npTarget);
      scopesByServant.set(row.servantId, scopes);
    }
    const distinctEntryServantIds = [...scopesByServant.keys()].sort();
    expect(ranking.rows.map(({ entryId }) => entryId).sort()).toEqual(expectedAttackProfileKeys);
    expect({ actorFormNodeCount, actorFormProfileCount }).toEqual({
      actorFormNodeCount: 435,
      actorFormProfileCount: 435,
    });
    expect(
      Object.fromEntries(
        [...groupRankingRows(ranking.rows, ({ servantId }) => servantId).values()]
          .map((rows) => rows.length)
          .reduce(
            (counts, count) => counts.set(count, (counts.get(count) ?? 0) + 1),
            new Map<number, number>(),
          ),
      ),
    ).toEqual({ 1: 413, 2: 7, 3: 2 });
    expect({
      arts: ranking.rows.filter(({ npCard }) => npCard === 'arts').length,
      buster: ranking.rows.filter(({ npCard }) => npCard === 'buster').length,
      quick: ranking.rows.filter(({ npCard }) => npCard === 'quick').length,
    }).toEqual({ arts: 144, buster: 182, quick: 107 });
    expect(
      [...groupRankingRows(ranking.rows, ({ servantId, npTarget }) => `${servantId}:${npTarget}`)]
        .filter(([, rows]) => rows.length > 1)
        .map(([key, rows]) => `${key}:${String(rows.length)}`)
        .sort(),
    ).toEqual([
      '1100900:all:3',
      '200100:all:2',
      '304800:all:2',
      '306200:single:2',
      '4000100:all:2',
      '800100:all:2',
    ]);
    expect(
      [
        ...groupRankingRows(
          ranking.rows,
          ({ servantId, noblePhantasmVariant }) =>
            `${servantId}:${noblePhantasmVariant.noblePhantasmId}`,
        ),
      ]
        .filter(([, rows]) => rows.length > 1)
        .map(([key, rows]) => `${key}:${String(rows.length)}`)
        .sort(),
    ).toEqual(['304800:304802:2', '4000100:4000101:2', '800100:800108:2']);
    expect(
      master.servants.filter((servant) => {
        const variants = getNoblePhantasmVariants(servant);
        return variants.length > 0 && variants.every(({ kind }) => kind === 'nonAttack');
      }),
    ).toHaveLength(47);
    expect(distinctEntryServantIds).toEqual(expectedAttackServantIds);
    expect(expectedAttackServantIds.filter((id) => !scopesByServant.has(id))).toEqual([]);
    expect(distinctEntryServantIds.filter((id) => !expectedAttackServantIds.includes(id))).toEqual(
      [],
    );
    const dualScopeServantIds = [...scopesByServant]
      .filter(([, scopes]) => scopes.size === 2)
      .map(([id]) => id)
      .sort();
    const singleOnlyCount = [...scopesByServant.values()].filter(
      (scopes) => scopes.size === 1 && scopes.has('single'),
    ).length;
    const allOnlyCount = [...scopesByServant.values()].filter(
      (scopes) => scopes.size === 1 && scopes.has('all'),
    ).length;
    expect(dualScopeServantIds).toEqual(['204900', '205000', '2301100', '304800']);
    expect({ singleOnlyCount, allOnlyCount }).toEqual({ singleOnlyCount: 175, allOnlyCount: 243 });
    expect(singleOnlyCount + allOnlyCount + dualScopeServantIds.length * 2).toBe(426);
    expect(
      ranking.rows
        .filter(({ servantId }) => servantId === '2301100')
        .map(({ npTarget }) => npTarget)
        .sort(),
    ).toEqual(['all', 'single']);
    expect(
      ranking.rows
        .filter(({ servantId }) => servantId === '205000' || servantId === '304800')
        .map(({ npTarget }) => npTarget)
        .sort(),
    ).toEqual(['all', 'all', 'all', 'single', 'single']);
    expect(ranking.rows.filter(({ servantId }) => servantId === '505600')).toHaveLength(1);
    expect(
      ranking.rows
        .filter(({ servantId }) => servantId === '204900')
        .map(({ npTarget }) => npTarget)
        .sort(),
    ).toEqual(['all', 'single']);
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
      const actionFacts = detail.appliedPreparationActions.flatMap(
        ({ activationFacts }) => activationFacts,
      );
      for (const fact of actionFacts) activationInventory[fact.kind] += 1;
      const factKeys = actionFacts.map(activationFactKey);
      expect(new Set(factKeys).size, row.servantId).toBe(factKeys.length);
      if (actionFacts.length > 0) servantsWithActivationSelections.push(row.servantId);
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
              actionFacts.some(
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
      const calculator = calculateScenarioWithContributionProjection(
        detail.scenario,
        master,
        versions,
        detail.contributionProjection,
      );
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
        const withoutAreaCalculator = calculateScenarioWithContributionProjection(
          detail.areaContribution.withoutAreaScenario,
          master,
          versions,
          detail.areaContribution.contributionProjection,
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
      choice: 16,
      operationTrigger: 3,
      sourceQuantity: 2,
    });
    expect(activationConditionInventory).toEqual({
      choice: 15,
      operationTrigger: 4,
      sourceQuantity: 2,
    });
    expect(servantsWithActivationSelections.sort()).toEqual([
      '101000',
      '1100900',
      '1100900',
      '1100900',
      '200100',
      '200100',
      '204900',
      '204900',
      '2301100',
      '2501100',
      '2800500',
      '2801000',
      '300800',
      '305600',
      '405900',
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
    expect(areaDetails).toHaveLength(180);
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
    ).toBe(241);
    const tonelico = rankingDetailFor(ranking, '505300');
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

    const jalter = rankingDetailFor(ranking, '1100300');
    expect(jalter.input).toMatchObject({ classAffinity: 1, attackBuff: 0.2, cardBuff: 0.5 });
    expect(jalter.result.status === 'calculated' ? jalter.result.rows[0] : null).toEqual({
      npLevel: 1,
      minimum: 70_056,
      average: 77_801.205,
      maximum: 85_546,
    });
    expect(jalter.areaContribution?.withoutAreaInput.attackBuff).toBe(0);

    const xxAlter = rankingDetailFor(ranking, '2501600');
    expect(xxAlter.scenario.targetContext.class).toEqual({ kind: 'relative', relation: 'neutral' });
    expect(xxAlter.input).toMatchObject({ classAffinity: 1, powerMod: 0 });
    expect(xxAlter.input.npSpecialMultipliers).toEqual([1, 1, 1, 1, 1]);
    expect(xxAlter.result.status === 'calculated' ? xxAlter.result.rows[0] : null).toEqual({
      npLevel: 1,
      minimum: 35_461,
      average: 39_381.22,
      maximum: 43_302,
    });

    const digest = rankingDigest(ranking.rows);
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
      `"fa8ad1caa9e4823cbca55fd87174eca1f78ecf2c76ae52d606435ccab964406f"`,
    );
    expect(
      [...ranking.rows]
        .filter(({ npTarget }) => npTarget === 'single')
        .sort((left, right) => right.average - left.average)[0]?.servantId,
    ).toBe('1100300');

    expect(
      rankingDetailFor(ranking, '1102000')
        .effectInputs.filter((input) => input.kind === 'matchingActorCount')
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
    ).toBe(128);
    expect(
      Math.max(
        ...Object.values(ranking.details).map(
          ({ executionMetrics }) => executionMetrics.scenarioCalculationCount,
        ),
      ),
    ).toBe(129);
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
      expect(ranking.rows).toHaveLength(433);
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
      '15291e61f13eba085eca5d31af47cb3397c366df8a762c986c6d083104282e6c',
      '9b519891257a481b29c7f254804f0a3fe936db2fb2098ad141c3da2f05914e7f',
      '14d138b9243238193efcfe0720bbfa0f79104440d80cb6d1228e197f378299d6',
      'de4ca9e15ab2bd3a77559370145a61871b9f8944374ceeda340e100867d07660',
      'cf8de1d8b2cd339c039494547d4d0b020a27cb8420b70363f019de677121567e',
    ];
    const actualDigests: string[] = [];
    for (const [index, ranking] of matrix.entries()) {
      expect(ranking.failures, `field:active:NP${String(index + 1)}`).toEqual([]);
      expect(ranking.rows).toHaveLength(433);
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
    const stateTraitVariantKeys = new Set(
      master.servants.flatMap((servant) =>
        getNoblePhantasmVariants(servant).flatMap((variant) =>
          variant.kind === 'attack' && variant.damage.some(({ kind }) => kind === 'stateTrait')
            ? [`${servant.id}:${variant.ref.noblePhantasmId}`]
            : [],
        ),
      ),
    );
    const stateTraitMatrices: Record<string, unknown> = {};
    expect(stateTraitVariantKeys.size).toBe(13);
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
        if (classAffinity === 'neutral')
          stateTraitMatrices[specialAttack] = matrix.map(({ rows }) =>
            rows
              .filter((row) =>
                stateTraitVariantKeys.has(
                  `${row.servantId}:${row.noblePhantasmVariant.noblePhantasmId}`,
                ),
              )
              .map(({ entryId, average, specialAttackApplied }) => ({
                entryId,
                average,
                specialAttackApplied,
              }))
              .sort((left, right) => left.entryId.localeCompare(right.entryId)),
          );
        if (classAffinity === 'neutral' && specialAttack === 'inactive') {
          const averages = (servantId: string, noblePhantasmId: string) =>
            matrix.map(
              ({ rows }) =>
                rows.find(
                  (row) =>
                    row.servantId === servantId &&
                    row.noblePhantasmVariant.noblePhantasmId === noblePhantasmId,
                )?.average,
            );
          const formAverages = (
            servantId: string,
            noblePhantasmId: string,
            actorId: string,
            limitCount: number,
          ) => {
            const servant = master.servants.find(({ id }) => id === servantId)!;
            const candidates = planPreNoblePhantasmCandidates(servant).candidates;
            const canonicalProfile = createActorFormProfiles(
              servant,
              candidates.map(({ terminalState }) => terminalState),
            ).find(({ formIds }) =>
              formIds.some(
                (formId) => actorFormKey(formId) === actorFormKey({ actorId, limitCount }),
              ),
            )!;
            const canonicalProfileKey = actorFormProfileIdKey(canonicalProfile.id);
            return matrix.map(
              ({ rows }) =>
                rows.find(
                  (row) =>
                    row.servantId === servantId &&
                    row.noblePhantasmVariant.noblePhantasmId === noblePhantasmId &&
                    actorFormProfileIdKey(row.attackProfile.id.terminalActorFormProfileId) ===
                      canonicalProfileKey,
                )?.average,
            );
          };
          expect(averages('2301100', '2301101')).toEqual([
            47_794.55, 63_726.225, 71_692.08, 75_675.005, 79_657.925,
          ]);
          expect(averages('2301100', '2301198')).toEqual([
            31_250.115, 41_666.99, 46_875.425, 49_479.64, 52_083.865,
          ]);
          expect(averages('204900', '204998')).toEqual([
            45_307.295, 60_409.895, 67_961.14, 71_736.845, 75_512.49,
          ]);
          expect(averages('204900', '204901')).toEqual([
            17_425.585, 23_234.27, 26_138.61, 27_590.79, 29_042.96,
          ]);
          expect(averages('1100900', '1100998')).toEqual([
            33_578.155, 44_681.035, 50_232.475, 53_008.195, 55_783.92,
          ]);
          expect(averages('2300600', '2300601')).toEqual([
            22_377.555, 29_753.58, 33_441.59, 35_285.585, 37_129.595,
          ]);
          expect(formAverages('205000', '205001', '205000', 1)).toEqual([
            44_207.22, 58_943.11, 66_311.07, 69_995.055, 73_679.035,
          ]);
          expect(formAverages('205000', '205002', '205000', 3)).toEqual([
            30_162.055, 40_216.24, 45_243.325, 47_756.875, 50_270.43,
          ]);
          expect(formAverages('304800', '304801', '304800', 1)).toEqual([
            43_606.36, 58_141.975, 65_409.795, 69_043.7, 72_677.645,
          ]);
          expect(formAverages('4000100', '4000101', '4000100', 1)).toEqual([
            27_261.025, 36_264.88, 40_766.795, 43_017.765, 45_268.7,
          ]);
          expect(formAverages('4000100', '4000101', '4000100', 3)).toEqual([
            22_249.86, 29_583.285, 33_250.015, 35_083.375, 36_916.74,
          ]);
          expect(formAverages('505600', '505701', '505700', 0)).toEqual([
            21_141.64, 28_157.35, 31_665.21, 33_419.14, 35_173.06,
          ]);
          expect(formAverages('2501400', '2501501', '2501500', 0)).toEqual([
            22_708.935, 30_278.745, 34_063.66, 35_956.115, 37_848.56,
          ]);
          expect(formAverages('800100', '800108', '800100', 17)).toEqual([
            20_935.77, 26_169.845, 28_786.89, 30_095.385, 31_403.91,
          ]);
          expect(averages('2301200', '2301201')).toEqual([
            24_649.355, 32_782.645, 36_849.285, 38_882.615, 40_915.93,
          ]);
          expect(averages('2801000', '2801001')).toEqual([
            23_957.595, 31_943.62, 35_936.64, 37_933.155, 39_929.65,
          ]);
          expect(averages('405900', '405901')).toEqual([
            22_846.02, 30_403.195, 34_181.785, 36_071.07, 37_960.365,
          ]);
          expect(averages('204300', '204302')).toEqual([
            43_838.4, 54_798.11, 60_277.97, 63_017.9, 65_757.83,
          ]);
          expect(averages('305700', '305701')).toEqual([
            36_133.395, 48_178.025, 54_200.34, 57_211.5, 60_222.66,
          ]);
          expect(averages('604800', '604801')).toEqual([
            25_781.7, 34_375.775, 38_672.81, 40_821.315, 42_969.9,
          ]);
          expect(
            matrix[0].rows.find(
              ({ servantId, noblePhantasmVariant }) =>
                servantId === '1100900' && noblePhantasmVariant.noblePhantasmId === '1100998',
            )?.noblePhantasmVariant,
          ).toEqual({
            actorFormId: { actorId: '1100900', limitCount: 0 },
            noblePhantasmId: '1100998',
          });
        }
        for (const [index, ranking] of matrix.entries()) {
          const npLevel = (index + 1) as 1 | 2 | 3 | 4 | 5;
          expect(ranking.failures, `${classAffinity}:${specialAttack}:NP${npLevel}`).toEqual([]);
          expect(ranking.rows).toHaveLength(433);
          expect(
            ranking.rows.filter(({ specialAttackApplied }) => specialAttackApplied),
          ).toHaveLength(specialAttack === 'active' ? 210 : 0);
          actualDigests[key].push(rankingDigest(ranking.rows));
        }
        if (classAffinity === 'neutral' && specialAttack === 'active') {
          const averages = (servantId: string, noblePhantasmId: string) =>
            matrix.map(
              ({ rows }) =>
                rows.find(
                  (row) =>
                    row.servantId === servantId &&
                    row.noblePhantasmVariant.noblePhantasmId === noblePhantasmId,
                )?.average,
            );
          expect(averages('405900', '405901')).toEqual([
            48_351.47, 64_410.47, 72_439.96, 76_454.715, 80_469.455,
          ]);
        }
      }
    expect(actualDigests).toEqual(policyDigests);
    expect(createHash('sha256').update(JSON.stringify(stateTraitMatrices)).digest('hex')).toBe(
      '713da389ca13a9b217d0e21703404482a4267ae2a7aff763225abc67949cf69e',
    );
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
