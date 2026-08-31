import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { calculateRankingDetail } from './ranking';
import { calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import {
  DEFAULT_RANKING_CONDITIONS,
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingProfileInput,
} from './rankingContracts';
import { calculateScenarioWithContributionProjection } from './scenario';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

describe('ranking condition semantics', () => {
  let master: ReturnType<typeof masterSnapshotSchema.parse>;
  const versions = {
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: '',
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  };

  beforeAll(async () => {
    master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
    versions.masterDataVersion = master.version;
  });

  it('does not apply a party-wide recipient modifier without a matching attacker trait', () => {
    const servant = master.servants.find(({ id }) => id === '1100300')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(detail.input).toMatchObject({ attackBuff: 0.2, cardBuff: 0.5 });
    expect(detail.result.status === 'calculated' ? detail.result.rows : null).toEqual([
      { npLevel: 1, minimum: 70_056, average: 77_801.205, maximum: 85_546 },
      { npLevel: 2, minimum: 87_570, average: 97_251.635, maximum: 106_933 },
      { npLevel: 3, minimum: 96_327, average: 106_976.83, maximum: 117_626 },
      { npLevel: 4, minimum: 100_706, average: 111_839.435, maximum: 122_973 },
      { npLevel: 5, minimum: 105_084, average: 116_702.045, maximum: 128_320 },
    ]);
    const dragonOnly = detail.effects.filter(
      (effect) =>
        effect.sourceActive &&
        effect.decision.state === 'enabled' &&
        effect.contributionScope === 'partyWide' &&
        effect.explanation.condition !== null &&
        JSON.stringify(effect.explanation.condition).includes('dragon'),
    );
    expect(dragonOnly.length).toBeGreaterThan(0);
    expect(dragonOnly.every(({ outcome }) => outcome === 'notApplied')).toBe(true);
    expect(dragonOnly.every(({ explanation }) => explanation.code === 'unresolved')).toBe(true);
  });

  it('keeps external field facts absent by default and materializes a finite active witness', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const inactive = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(
      inactive.scenario.worldFactAssertions.filter(({ decisionKey }) =>
        decisionKey.startsWith('ranking:field:'),
      ),
    ).toEqual([]);
    expect(inactive.input).toMatchObject({ attackBuff: 0.15, cardBuff: 0.2, npDamageBuff: 0.25 });
    expect(inactive.result.status === 'calculated' ? inactive.result.rows : null).toEqual([
      { npLevel: 1, minimum: 40_136, average: 44_551.025, maximum: 48_966 },
      { npLevel: 2, minimum: 53_448, average: 59_334.87, maximum: 65_222 },
      { npLevel: 3, minimum: 60_104, average: 66_726.79, maximum: 73_350 },
      { npLevel: 4, minimum: 63_432, average: 70_422.745, maximum: 77_413 },
      { npLevel: 5, minimum: 66_760, average: 74_118.715, maximum: 81_477 },
    ]);
    const active = calculateRankingDetail(
      servant,
      master,
      profile,
      { ...DEFAULT_RANKING_CONDITIONS, field: 'active' },
      versions,
    );
    expect(
      active.scenario.worldFactAssertions.filter(({ decisionKey }) =>
        decisionKey.startsWith('ranking:field:'),
      ),
    ).toEqual([
      {
        decisionKey: 'ranking:field:fieldShore',
        fact: {
          kind: 'trait',
          scope: 'field',
          trait: 'fieldShore',
          present: true,
        },
      },
    ]);
    expect(active.input).toMatchObject({ attackBuff: 0.35, cardBuff: 0.4, npDamageBuff: 0.45 });
    expect(active.result.status === 'calculated' ? active.result.rows : null).toEqual([
      { npLevel: 1, minimum: 63_646, average: 70_660.61, maximum: 77_675 },
      { npLevel: 2, minimum: 84_795, average: 94_147.61, maximum: 103_500 },
      { npLevel: 3, minimum: 95_370, average: 105_891.125, maximum: 116_413 },
      { npLevel: 4, minimum: 100_657, average: 111_762.865, maximum: 122_869 },
      { npLevel: 5, minimum: 105_944, average: 117_634.605, maximum: 129_325 },
    ]);
  });

  it('lets ordered self-generated fields satisfy conditions without an external assertion', () => {
    const servant = master.servants.find(({ id }) => id === '105400')!;
    const detail = calculateRankingDetail(
      servant,
      master,
      profile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(
      detail.scenario.worldFactAssertions.filter(({ decisionKey }) =>
        decisionKey.startsWith('ranking:field:'),
      ),
    ).toEqual([]);
    expect(detail.input.fieldTraits).toContain('fieldSunlight');
    expect(
      detail.effects.some(
        (effect) =>
          effect.outcome === 'applied' &&
          effect.explanation.condition !== null &&
          JSON.stringify(effect.explanation.condition).includes('fieldSunlight'),
      ),
    ).toBe(true);
  });

  it('selects the production 1102300 non-superGiant witness as the stronger legal candidate', () => {
    const servant = master.servants.find(({ id }) => id === '1102300')!;
    const outcome = calculateRankingPolicyDetail(
      servant,
      master,
      profile,
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        conditionalEffects: 'satisfied',
      },
      versions,
    );
    expect(outcome.status).toBe('calculated');
    if (outcome.status !== 'calculated') return;
    expect(outcome.detail.input.powerMod).toBe(0.5);
    expect(
      outcome.detail.result.status === 'calculated' ? outcome.detail.result.rows[0].average : null,
    ).toBe(88_558.08);
    expect(
      outcome.detail.scenario.worldFactAssertions.filter(
        ({ fact }) => fact.kind === 'trait' && fact.trait === 'superGiant',
      ),
    ).toEqual([
      {
        decisionKey: 'ranking:target:superGiant',
        fact: { kind: 'trait', scope: 'target', trait: 'superGiant', present: false },
      },
      {
        decisionKey: 'ranking:targetState:superGiant',
        fact: { kind: 'trait', scope: 'targetState', trait: 'superGiant', present: false },
      },
    ]);
    const bruteDamage = Array.from({ length: 4 }, (_, mask) => {
      const scenario = {
        ...outcome.detail.scenario,
        worldFactAssertions: [
          ...outcome.detail.scenario.worldFactAssertions.filter(
            ({ fact }) => fact.kind !== 'trait' || fact.trait !== 'superGiant',
          ),
          ...(['target', 'targetState'] as const).map((scope, index) => ({
            decisionKey: `oracle:${scope}:superGiant`,
            fact: {
              kind: 'trait' as const,
              scope,
              trait: 'superGiant',
              present: (mask & (1 << index)) !== 0,
            },
          })),
        ],
      };
      const execution = calculateScenarioWithContributionProjection(
        scenario,
        master,
        versions,
        outcome.detail.contributionProjection,
        { initialNpGauge: outcome.detail.candidateEvidence.startNpGauge },
      );
      return execution.result.status === 'calculated'
        ? execution.result.rows[0].average
        : Number.NEGATIVE_INFINITY;
    });
    expect(Math.max(...bruteDamage)).toBe(88_558.08);
  });

  it('lets an initially absent target-state witness become true through ordered self generation', () => {
    const servant = master.servants.find(({ id }) => id === '405900')!;
    const outcome = calculateRankingPolicyDetail(
      servant,
      master,
      profile,
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        conditionalEffects: 'satisfied',
      },
      versions,
    );
    expect(outcome.status).toBe('calculated');
    if (outcome.status !== 'calculated') return;
    expect(outcome.detail.input.targetStateTraits).toEqual(
      expect.arrayContaining(['buffCharm', 'buffConfusion']),
    );
    expect(
      outcome.detail.scenario.worldFactAssertions.filter(
        ({ decisionKey, fact }) =>
          decisionKey.startsWith('ranking:targetState:') &&
          fact.kind === 'trait' &&
          ['buffCharm', 'buffConfusion'].includes(fact.trait),
      ),
    ).toEqual([
      {
        decisionKey: 'ranking:targetState:buffCharm',
        fact: { kind: 'trait', scope: 'targetState', trait: 'buffCharm', present: false },
      },
      {
        decisionKey: 'ranking:targetState:buffConfusion',
        fact: { kind: 'trait', scope: 'targetState', trait: 'buffConfusion', present: false },
      },
    ]);
  });

  it.each(
    ['1100300', '403700', '105400'].flatMap((servantId) =>
      (['included', 'excluded'] as const).flatMap((selfBuffs) =>
        (['baseline', 'satisfied'] as const).map(
          (conditionalEffects) => [servantId, selfBuffs, conditionalEffects] as const,
        ),
      ),
    ),
  )(
    'evaluates policy crossing %s:%s:%s without forging intrinsic facts',
    (servantId, selfBuffs, conditionalEffects) => {
      const servant = master.servants.find(({ id }) => id === servantId)!;
      const outcome = calculateRankingPolicyDetail(
        servant,
        master,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          selfBuffs,
          conditionalEffects,
        },
        versions,
      );
      expect(outcome.status, `${servant.id}:${selfBuffs}:${conditionalEffects}`).toBe('calculated');
      if (outcome.status !== 'calculated') return;
      expect(outcome.detail.candidateEvidence.policyKey).toBe(`${selfBuffs}:${conditionalEffects}`);
      if (servant.id !== '1100300') return;
      const forgedDragon = outcome.detail.scenario.worldFactAssertions.some(
        ({ fact }) =>
          fact.kind === 'trait' &&
          fact.scope === 'attacker' &&
          fact.trait === 'dragon' &&
          fact.present,
      );
      expect(forgedDragon).toBe(false);
    },
  );

  it.each([
    ['included', 'baseline', 48, 16, 32],
    ['included', 'satisfied', 1_056, 104, 952],
    ['excluded', 'baseline', 48, 4, 44],
    ['excluded', 'satisfied', 1_056, 26, 1_030],
  ] as const)(
    'inventories finite production candidates and damage requests for %s:%s',
    (selfBuffs, conditionalEffects, candidateCount, distinctDamageInputCount, cacheHitCount) => {
      const inventoryMaster = {
        ...master,
        servants: ['1100300', '403700', '105400'].map((servantId) =>
          master.servants.find(({ id }) => id === servantId)!,
        ),
      };
      const calculation = calculateRankingPolicy(
        inventoryMaster,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          selfBuffs,
          conditionalEffects,
        },
        versions,
      );
      expect(
        Object.values(calculation.profileResults).filter(({ status }) => status === 'invalid'),
      ).toEqual([]);
      expect(calculation.candidateInventory).toEqual({
        semanticUpperBound: candidateCount,
        generatedCount: candidateCount,
        deduplicatedCount: candidateCount,
        damageRequestUpperBound: candidateCount,
        damageRequestCount: candidateCount,
        distinctDamageInputCount,
      });
      expect(calculation.damageCache.cacheHitCount).toBe(cacheHitCount);
    },
  );
});
