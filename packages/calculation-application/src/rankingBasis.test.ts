import { describe, expect, it } from 'vitest';
import { masterSnapshotSchema, naturalServantLevel } from '@fgo-lab/master-data';
import {
  APP_VERSION,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  servantBuildRecordSchema,
  type RankingSelection,
} from '@fgo-lab/schema';
import fixture from '../../test-fixtures/master/fixture.json';
import { applyRankingSelectionCommand, compileRankingSelection } from './rankingBasis';
import { DEFAULT_RANKING_POLICY_CONDITIONS as defaults } from './rankingContracts';
import { rankingBasisFixture } from './rankingBasisFixture';
import { calculateRankingPolicy, calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import {
  createRankingPortableRequest,
  currentCalculationVersionContext,
  executePortableCalculation,
  recoverPortableCalculation,
  replacePortableCalculationScenario,
  attemptPortableCalculationVersionUpgrade,
  attemptPortableCalculationScenarioChange,
} from './portableCalculation';

const master = masterSnapshotSchema.parse(fixture);
const servant = master.servants[0]!;
const smallMaster = { ...master, servants: [servant] };
const lowLevel = Number(
  Object.keys(servant.atkByLevel)
    .map(Number)
    .sort((a, b) => a - b)[0],
);
const profile = {
  servantBuilds: servantBuildRecordSchema.parse({
    [servant.id]: {
      servantId: servant.id,
      level: lowLevel,
      ascension: 0,
      npLevel: 4,
      fouAtk: 2000,
      skills: { '1': 1, '2': 2, '3': 3 },
      appends: {},
      updatedAt: '2026-09-05T00:00:00.000Z',
    },
  }),
};
const versions = {
  schemaVersion: SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  masterDataVersion: master.version,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('ranking independent basis', () => {
  it('changes only illegal axes on an explicit population command', () => {
    const owned: RankingSelection = {
      ...defaults,
      population: 'owned',
      levelBasis: 'ownedLevel',
      npLevelBasis: { kind: 'owned' },
    };
    expect(
      applyRankingSelectionCommand(owned, { kind: 'setPopulation', value: 'all' }),
    ).toMatchObject({ status: 'valid', selection: defaults });
    const uniform: RankingSelection = {
      ...owned,
      levelBasis: 'uniformLevel90',
      npLevelBasis: { kind: 'specified', npLevel: 5 },
    };
    expect(
      applyRankingSelectionCommand(uniform, { kind: 'setPopulation', value: 'all' }),
    ).toMatchObject({ status: 'valid', selection: { ...uniform, population: 'all' } });
    for (const value of [
      { ...owned, population: 'all' },
      { ...defaults, comparisonMode: 'owned' },
      { ...defaults, npLevelBasis: { kind: 'specified', npLevel: 0 } },
    ]) {
      expect(compileRankingSelection(value).status).toBe('invalid');
      expect(
        calculateRankingPolicy(smallMaster, profile, value as RankingSelection, versions),
      ).toMatchObject({ status: 'invalid', rows: [], exclusions: [] });
    }
  });

  it('resolves all legal products once, preserves fixed inputs, and pins replay after profile mutation', () => {
    for (const population of ['all', 'owned'] as const)
      for (const levelBasis of ['naturalLimit', 'uniformLevel90', 'ownedLevel'] as const)
        for (const npLevelBasis of [
          { kind: 'specified', npLevel: 2 },
          { kind: 'owned' },
        ] as const) {
          if (
            population === 'all' &&
            (levelBasis === 'ownedLevel' || npLevelBasis.kind === 'owned')
          )
            continue;
          const selection = { ...defaults, population, levelBasis, npLevelBasis };
          const basis = rankingBasisFixture(servant, selection, profile);
          expect(basis.level).toBe(
            levelBasis === 'ownedLevel'
              ? lowLevel
              : levelBasis === 'uniformLevel90'
                ? 90
                : naturalServantLevel(servant.rarity),
          );
          expect(basis.npLevel).toBe(npLevelBasis.kind === 'owned' ? 4 : 2);
          const summary = calculateRankingPolicy(smallMaster, profile, selection, versions);
          expect(summary.status).toBe('calculated');
          expect(summary.rows.length).toBeGreaterThan(0);
          for (const row of summary.rows) {
            const result = calculateRankingPolicyDetail(
              servant,
              smallMaster,
              profile,
              selection,
              versions,
              row.attackProfile,
            );
            expect(result.status).toBe('calculated');
            if (result.status !== 'calculated') throw new Error('fixture must calculate');
            const detail = result.detail;
            expect(detail.basis).toEqual(basis);
            expect(detail.scenario.attacker).toMatchObject({
              level: basis.level,
              npLevel: basis.npLevel,
              source: 'master',
              fouAtk: 1000,
            });
            expect(
              detail.scenario.preNoblePhantasmPlan
                .filter((action) => action.kind === 'useSkillSlot')
                .every((action) => action.skillLevel === 10),
            ).toBe(true);
            expect(row.average).toBe(detail.result.rows[basis.npLevel - 1]!.average);
            const request = createRankingPortableRequest(
              detail,
              currentCalculationVersionContext(smallMaster),
            );
            const replay = executePortableCalculation(request, smallMaster);
            expect(replay.status).toBe('executed');
            if (replay.status === 'executed')
              expect(replay.execution.result).toEqual(detail.result);
            const changed = {
              servantBuilds: {
                ...profile.servantBuilds,
                [servant.id]: { ...profile.servantBuilds[servant.id]!, npLevel: 0 },
              },
            };
            expect(
              calculateRankingPolicy(
                smallMaster,
                changed,
                { ...selection, population: 'owned' },
                versions,
              ),
            ).toMatchObject({ status: 'calculated', rows: [], exclusions: [] });
            expect(executePortableCalculation(request, smallMaster)).toEqual(replay);
            if (request.executionIntent.kind === 'manual')
              throw new Error('ranking request required');
            const tampered = {
              ...request,
              executionIntent: request.executionIntent,
              scenario: {
                ...detail.scenario,
                attacker: { ...detail.scenario.attacker, level: basis.level + 1 },
              },
            };
            expect(executePortableCalculation(tampered, smallMaster).status).toBe('invalid');
          }
        }
  });

  it('preserves different provenance at numerically equal levels and uses the canonical low-rarity natural limit', () => {
    const lowRarity = { ...servant, rarity: 1, atkByLevel: { ...servant.atkByLevel, '60': 6000 } };
    expect(rankingBasisFixture(lowRarity).level).toBe(60);
    const natural = rankingBasisFixture(servant);
    const uniform = rankingBasisFixture(servant, { ...defaults, levelBasis: 'uniformLevel90' });
    expect(natural.level).toBe(uniform.level);
    expect(natural).not.toEqual(uniform);
  });

  it('rejects forged pinned claims across construction, replacement, replay, recovery and upgrade without replacing the retained pair', () => {
    const outcome = calculateRankingPolicyDetail(servant, smallMaster, profile, defaults, versions);
    if (outcome.status !== 'calculated') throw new Error('detail required');
    const detail = outcome.detail;
    const request = createRankingPortableRequest(
      detail,
      currentCalculationVersionContext(smallMaster),
    );
    if (request.executionIntent.kind !== 'ranking') throw new Error('ranking request required');
    const attacker = { ...detail.scenario.attacker, level: 89 };
    expect(
      attemptPortableCalculationScenarioChange(
        request,
        detail.result,
        { ...detail.scenario, attacker },
        smallMaster,
      ),
    ).toMatchObject({
      status: 'rejected',
      retainedRequest: request,
      retainedResult: detail.result,
      attemptedRequest: null,
    });
    expect(
      attemptPortableCalculationScenarioChange(
        request,
        detail.result,
        { ...detail.scenario, attacker: { ...detail.scenario.attacker, fouAtk: 2000 } },
        smallMaster,
      ),
    ).toMatchObject({
      status: 'rejected',
      retainedRequest: request,
      retainedResult: detail.result,
      failure: { status: 'invalid' },
    });
    expect(
      attemptPortableCalculationScenarioChange(
        request,
        detail.result,
        detail.scenario,
        smallMaster,
      ),
    ).toMatchObject({ status: 'committed', request, result: detail.result });
    expect(() =>
      createRankingPortableRequest(
        { ...detail, scenario: { ...detail.scenario, attacker } },
        request.versionContext,
      ),
    ).toThrow();
    expect(() =>
      replacePortableCalculationScenario(request, { ...detail.scenario, attacker }),
    ).toThrow();
    for (const changed of [
      {
        ...request,
        executionIntent: { ...request.executionIntent, basis: { ...detail.basis, level: 89 } },
        scenario: { ...detail.scenario, attacker },
      },
      {
        ...request,
        executionIntent: request.executionIntent,
        scenario: { ...detail.scenario, attacker: { ...detail.scenario.attacker, fouAtk: 2000 } },
      },
      {
        ...request,
        executionIntent: request.executionIntent,
        scenario: {
          ...detail.scenario,
          attacker: { ...detail.scenario.attacker, source: 'owned' as const },
        },
      },
    ]) {
      expect(executePortableCalculation(changed, smallMaster)).toMatchObject({
        status: 'invalid',
        reason: 'scenarioInvalid',
      });
      expect(recoverPortableCalculation(changed, detail.result, smallMaster)).toMatchObject({
        status: 'invalid',
      });
      expect(
        attemptPortableCalculationVersionUpgrade(
          changed,
          detail.result,
          request.versionContext,
          smallMaster,
        ),
      ).toMatchObject({
        status: 'rejected',
        retainedRequest: changed,
        retainedResult: detail.result,
      });
    }
  });

  it('distinguishes no member, missing ATK, and canonical zero without guessing stats', () => {
    const selection: RankingSelection = {
      ...defaults,
      population: 'owned',
      levelBasis: 'ownedLevel',
      npLevelBasis: { kind: 'owned' },
    };
    expect(
      calculateRankingPolicy(smallMaster, { servantBuilds: {} }, selection, versions),
    ).toMatchObject({ status: 'calculated', rows: [], exclusions: [] });
    for (const available of [false, true]) {
      const atkByLevel: Record<string, number> = Object.fromEntries(
        Object.entries(servant.atkByLevel).filter(([key]) => key !== String(lowLevel)),
      );
      if (available) atkByLevel[String(lowLevel)] = 0;
      const custom = { ...smallMaster, servants: [{ ...servant, atkByLevel }] };
      const summary = calculateRankingPolicy(custom, profile, selection, versions);
      if (available) expect(summary.rows.length).toBeGreaterThan(0);
      else {
        expect(summary.rows).toEqual([]);
        expect(
          summary.exclusions.every(({ reason }) => reason === 'attackerLevelStatUnavailable'),
        ).toBe(true);
      }
    }
  });
});
