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
import { rankingMatrixPolicyKey } from './rankingMatrix';

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
      const detail = ranking.details[row.entryId]!;
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

  it('applies the fixed standard policy without inventing favorable facts', () => {
    const servant = master.servants[0]!;
    const scenario = createRankingScenario(
      servant,
      master,
      emptyProfile,
      {
        ...DEFAULT_RANKING_CONDITIONS,
        npLevel: 2,
      },
      versions,
    );
    expect(scenario.attacker).toMatchObject({
      level: naturalServantLevel(servant.rarity),
      npLevel: 2,
      fouAtk: 1_000,
    });
    expect(scenario.overcharge).toBe(1);
    expect(scenario.targetContext).toMatchObject({
      class: { kind: 'relative', relation: 'neutral' },
      attribute: { kind: 'relative', relation: 'neutral' },
    });
    expect(scenario.worldFactAssertions).toEqual([]);
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
      },
      versions,
    );
    expect(ranking.rows).toHaveLength(1);
    expect(ranking.rows[0]).toMatchObject({ level: 73, npLevel: 3, owned: true });
    const scenario = ranking.details[ranking.rows[0]!.entryId]!.scenario;
    expect(scenario.attacker.fouAtk).toBe(1_420);
    expect(
      scenario.preNoblePhantasmPlan.flatMap((command) =>
        command.kind === 'useSkillSlot' ? [command.skillLevel] : [],
      ),
    ).toEqual(servant.skills.slice(0, 3).map((_, index) => build.skills[String(index + 1)] ?? 1));
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

  it('keys the prepared standard matrix independently from the selected NP level', () => {
    const policy = {
      comparisonMode: DEFAULT_RANKING_CONDITIONS.comparisonMode,
      classAffinity: DEFAULT_RANKING_CONDITIONS.classAffinity,
      selfBuffs: DEFAULT_RANKING_CONDITIONS.selfBuffs,
      specialAttack: DEFAULT_RANKING_CONDITIONS.specialAttack,
      field: DEFAULT_RANKING_CONDITIONS.field,
    };
    expect(rankingMatrixPolicyKey(policy)).toBe('standard:neutral:included:inactive:inactive');
    expect(
      rankingMatrixPolicyKey({
        ...policy,
        specialAttack: 'active',
      }),
    ).not.toBe(rankingMatrixPolicyKey(policy));
  });
});
