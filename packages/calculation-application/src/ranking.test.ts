import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema, naturalServantLevel } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION, type ServantBuild } from '@fgo-lab/schema';
import { calculateScenario } from './scenario';
import {
  calculateRanking,
  createRankingScenario,
  DEFAULT_RANKING_CONDITIONS,
  type RankingProfileInput,
} from './ranking';

const master = masterSnapshotSchema.parse(fixture);
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};
const emptyProfile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

describe('canonical ranking scenarios', () => {
  it('uses the exact calculator scenario and execution result for every ranking row', () => {
    const ranking = calculateRanking(master, emptyProfile, DEFAULT_RANKING_CONDITIONS, versions);
    expect(ranking.failures).toEqual([]);
    expect(ranking.rows).toHaveLength(master.servants.length);
    for (const row of ranking.rows) {
      const detail = ranking.details[row.servantId]!;
      const recalculated = calculateScenario(detail.scenario, master, versions);
      expect(recalculated.input).toEqual(detail.input);
      expect(recalculated.result).toEqual(detail.result);
      expect(recalculated.effects).toEqual(detail.effects);
      expect(recalculated.effectWarnings).toEqual(detail.warnings);
      expect(row).toMatchObject({
        minimum:
          recalculated.result.status === 'calculated' ? recalculated.result.rows[0].minimum : 0,
        average:
          recalculated.result.status === 'calculated' ? recalculated.result.rows[0].average : 0,
        maximum:
          recalculated.result.status === 'calculated' ? recalculated.result.rows[0].maximum : 0,
      });
    }
  });

  it('applies one common育成 rule without mutating conditions into favorable facts', () => {
    const servant = master.servants[0]!;
    const scenario = createRankingScenario(
      servant,
      master,
      emptyProfile,
      {
        ...DEFAULT_RANKING_CONDITIONS,
        levelRule: 'level100',
        npLevel: 2,
        targetTraits: ['dragon'],
        fieldTraits: ['fieldSunlight'],
      },
      versions,
    );
    expect(scenario.attacker).toMatchObject({ level: 100, npLevel: 2, fouAtk: 1_000 });
    expect(scenario.worldFactAssertions).toEqual([
      {
        decisionKey: 'ranking:target:dragon',
        fact: { kind: 'trait', scope: 'target', trait: 'dragon', present: true },
      },
      {
        decisionKey: 'ranking:field:fieldSunlight',
        fact: { kind: 'trait', scope: 'field', trait: 'fieldSunlight', present: true },
      },
    ]);
    expect(
      scenario.effectDecisions.every((decision) => decision.conditionSatisfaction === 'evaluate'),
    ).toBe(true);
  });

  it('never falls back from missing owned data to standard values', () => {
    const servant = master.servants[0]!;
    const owned = calculateRanking(
      master,
      emptyProfile,
      { ...DEFAULT_RANKING_CONDITIONS, comparisonMode: 'owned' },
      versions,
    );
    expect(owned.rows).toEqual([]);
    expect(owned.failures).toEqual([]);

    const build: ServantBuild = {
      servantId: servant.id,
      level: 73,
      ascension: 4,
      npLevel: 3,
      fouAtk: 1_420,
      skills: { '1': 6, '2': 7, '3': 8 },
      appends: {},
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
    const profile = { ...emptyProfile, servantBuilds: { [servant.id]: build } };
    const ranking = calculateRanking(
      master,
      profile,
      {
        ...DEFAULT_RANKING_CONDITIONS,
        comparisonMode: 'owned',
        levelRule: 'level120',
        npLevel: 5,
        fouAtk: 2_000,
      },
      versions,
    );
    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({ level: 73, npLevel: 3, owned: true });
    const scenario = ranking.details[servant.id]!.scenario;
    expect(scenario.attacker.fouAtk).toBe(1_420);
    expect(scenario.attackerSkills.map((skill) => skill.skillLevel)).toEqual(
      servant.skills.slice(0, 3).map((_, index) => build.skills[String(index + 1)] ?? 1),
    );
  });

  it('uses the natural level in the default standard comparison', () => {
    const servant = master.servants[0]!;
    const scenario = createRankingScenario(
      servant,
      master,
      emptyProfile,
      DEFAULT_RANKING_CONDITIONS,
      versions,
    );
    expect(scenario.attacker.level).toBe(naturalServantLevel(servant.rarity));
  });
});
