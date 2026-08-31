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
import {
  calculateScenarioWithContributionProjection as calculateScenarioWithContributionProjectionOutcome,
  requireExecutableCalculation,
} from './scenario';
import { calculateRanking, DEFAULT_RANKING_CONDITIONS, type RankingProfileInput } from './ranking';
import { calculateStandardRankingMatrix } from './rankingMatrix';
import { fieldTraitsRequiredByCondition } from './conditionProvenance';
import type { ConditionExpression } from '@fgo-lab/battle-execution';
const calculateScenarioWithContributionProjection = (
  ...args: Parameters<typeof calculateScenarioWithContributionProjectionOutcome>
) => requireExecutableCalculation(calculateScenarioWithContributionProjectionOutcome(...args));
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
    '3723d2737e039406399d36b874c4e830e54faace4ffd1f382ba0c12edfe5abb5',
    '6f6ec745324eea6eb7fc89ec678ee0270496268631938d5d5df6151d3ee10247',
    'dd91c8f85d7d0108199bbcd8a383e6973666bb68cebfdeae573c73df5b4cc6fd',
    '19759df4d9ca76d1581f13190351bb9772672dcfe033405e93e56766861107cd',
    '392649e6f04a1f899496ec4ff77f26a0c0933407eef17c59b4185f272e2a7b97',
  ],
  'neutral:active': [
    '26bc7137ae0f2d9f7264a101c1f48862cc87c7073fd125033d02f8983b648c4e',
    '452fffc309b5cfdf67acf18c9a1191e7c5f97519d180f5958c3a6a2a5c24e72f',
    '3b2b25a0ae810656cd4385071c6093ea4b39020824e48da07d6a9731d28dce7d',
    '05548e96c186a8f3cc4b6dd6f435e454be41651b930ad963e76ec556043c2dfb',
    'aae7c425c4cc8bc5ed1a911837bd7e6eeac8dbc59ae00effcb43ea102364a357',
  ],
  'favorable:inactive': [
    'e1d07013b51078e427dcea27f0ff5a8f0150c9bb4df08eb85420dd6f62fe99f1',
    '307f510150a4bc5fe20e3286a9638a25a06c8b24876a062eb7c4c13d7650ef52',
    '189189a45edf658e14feabfbb9464a58457f13600f48d515fbd9809a36cb3057',
    '3d720067d0e047e0b16247b346bcdfaef8afd7e810bcf948d295ea7624efc42d',
    '72d90069487449c0c3f73bf9e97fb0b3a04eb32cd855f98cb418e7eaa18f4276',
  ],
  'favorable:active': [
    '5341f2a1f897eeab7d47a7b4bae62573411835261a188ce930a192d0e6a644dd',
    'b7e49a329885ec5152ce352c8322754f40e778918929e0fadc2a150727793263',
    '93da2d39d8fa1ca33155a1874a1b3f7ba2ced3ca6ce7e6745551965021f0ca20',
    '23fed44ab1b0c76bf902648c7c9c56496f897963c89b141813b97793a72535c0',
    'f1931dd101f66149de4551ded1d966a4c683bd6dfecad7b2cb25f49af8441f09',
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
      requestCount: 3_629,
      distinctDamageInputCount: 1_623,
      cacheHitCount: 2_006,
      cacheHitRate: 2_006 / 3_629,
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
    expect(nonAppliedReasonCounts.unresolved).toBe(302);
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
      const candidates = planPreNoblePhantasmCandidates(
        servant,
        master.npResourceSemantics,
        1,
        1,
      ).candidates;
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
      choice: 15,
      operationTrigger: 3,
      sourceQuantity: 2,
    });
    expect(activationConditionInventory).toEqual({
      choice: 14,
      operationTrigger: 4,
      sourceQuantity: 2,
    });
    expect(servantsWithActivationSelections.sort()).toEqual([
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
    expect(areaDetails).toHaveLength(178);
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
    ).toBe(237);
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
          "average": 61162.615,
          "name": "謎のヒロインX〔オルタ〕",
          "servantId": "702400",
        },
        {
          "average": 58447.99,
          "name": "沖田総司",
          "servantId": "102700",
        },
      ]
    `);
    expect(digest).toMatchInlineSnapshot(
      `"3723d2737e039406399d36b874c4e830e54faace4ffd1f382ba0c12edfe5abb5"`,
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
    ).toBe(96);
    expect(
      Math.max(
        ...Object.values(ranking.details).map(
          ({ executionMetrics }) => executionMetrics.scenarioCalculationCount,
        ),
      ),
    ).toBe(97);
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
      'cbadf19896d560ce58b42bc0daf1de53c3ec781e85f75b8622c37fa1b387ee7f',
      '2b52f2ec728143b7458fc06fb987e4c2e70d95c514eb4170d100bb4e45d6740f',
      'b7cedd364e2c73c8cc3bbbfaaed9e4aedd18819d750c2cd079ce259db637ad42',
      'afaee29a1891e8c616ce3e64c373886fda70d142db360b3071992dd3c5edbaa0',
      'a03e87f2695ac000e35d277a16db09819331fac9b255a8e5c4c3eb095e975419',
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
            const candidates = planPreNoblePhantasmCandidates(
              servant,
              master.npResourceSemantics,
              1,
              1,
            ).candidates;
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
            17_849.775, 23_716.53, 26_649.915, 28_116.59, 29_583.285,
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
    const stateTraitDigest = createHash('sha256')
      .update(JSON.stringify(stateTraitMatrices))
      .digest('hex');
    expect(stateTraitDigest).toBe(
      '61d55ba119f690eb183e1330b13046e4efc18957cfeb5368e3f2bc305723cb15',
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
