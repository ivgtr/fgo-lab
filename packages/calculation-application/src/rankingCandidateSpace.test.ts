import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { attackProfileKey, createStaticAttackProfiles } from './attackProfile';
import {
  compileRankingCandidateSpaces,
  materializeRankingCandidateSpace,
} from './rankingCandidateSpace';
import { DEFAULT_RANKING_POLICY_CONDITIONS, type RankingProfileInput } from './rankingContracts';
import { calculateRankingPolicy, calculateRankingPolicyDetail } from './rankingPolicyCalculation';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
  craftEssences: [],
  supportTemplates: [],
};

describe('static ranking candidate space', () => {
  let master: ReturnType<typeof masterSnapshotSchema.parse>;
  beforeAll(async () => {
    master = masterSnapshotSchema.parse(
      JSON.parse(await readFile(resolve(root, 'apps/web/public/master/master.json'), 'utf8')),
    );
  });

  const versions = () => ({
    schemaVersion: SCHEMA_VERSION,
    masterDataVersion: master.version,
    engineVersion: ENGINE_VERSION,
    appVersion: APP_VERSION,
    gameRegion: 'JP' as const,
    masterDataLocale: 'ja-JP' as const,
  });

  it('retains a baseline world and checks the complete semantic product before materializing', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const spaces = compileRankingCandidateSpaces(
      servant,
      master,
      profile,
      { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
      createStaticAttackProfiles(servant),
    );
    expect(spaces.every(({ status }) => status === 'ready')).toBe(true);
    for (const space of spaces) {
      if (space.status !== 'ready') continue;
      const expectedBound = space.programs.reduce(
        (sum, program) =>
          sum +
          [
            program.startNpGauges.length,
            ...program.canonicalInputs.map(({ values }) => values.length),
            program.targets.length,
            program.fields.length,
            program.quantities.length,
          ].reduce((product, size) => product * size, 1),
        0,
      );
      expect(space.upperBound).toBe(expectedBound);
      const candidates = materializeRankingCandidateSpace({
        servant,
        master,
        profile,
        conditions: {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          conditionalEffects: 'satisfied',
        },
        space,
      });
      expect(candidates).toHaveLength(space.upperBound);
      expect(
        candidates.some(
          ({ evidence }) =>
            evidence.targetCandidateKey === 'target:baseline' &&
            evidence.fieldCandidateKey === 'field:none' &&
            evidence.quantityCandidateKey === 'quantity:baseline',
        ),
      ).toBe(true);
    }
  });

  it('returns a typed invalid space instead of a baseline number when the bound is exceeded', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const spaces = compileRankingCandidateSpaces(
      servant,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      createStaticAttackProfiles(servant),
      { candidateLimit: 0 },
    );
    expect(
      spaces.some(
        (space) =>
          space.status === 'invalid' &&
          space.issue.kind === 'candidateLimitExceeded' &&
          space.issue.limit === 0,
      ),
    ).toBe(true);
  });

  it('preserves distinct ordered skill programs with the same used-slot set', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const orders = compileStaticRankingPreparationPrograms(servant).map((program) =>
      program.commands.flatMap((command) =>
        command.kind === 'useSkillSlot' ? [command.slot] : [],
      ),
    );
    expect(orders).toContainEqual([1, 2]);
    expect(orders).toContainEqual([2, 1]);
  });

  it('lets the canonical executor derive 200-percent gauge overcharge for 505300 NP2-5', () => {
    const servant = master.servants.find(({ id }) => id === '505300')!;
    const actual: number[] = [];
    const startNpGauges: number[] = [];
    for (const offset of [0, 1, 2, 3]) {
      const npLevel = (offset + 2) as 2 | 3 | 4 | 5;
      const outcome = calculateRankingPolicyDetail(
        servant,
        master,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevel,
          conditionalEffects: 'satisfied',
        },
        versions(),
      );
      expect(outcome.status, `NP${npLevel}`).toBe('calculated');
      if (outcome.status !== 'calculated') continue;
      expect(outcome.detail.scenario.overcharge).toBe(1);
      expect(outcome.detail.appliedPreparationActions.at(-1)?.resourceBefore.gauge).toBe(
        npLevel === 5 ? 30_000 : 20_000,
      );
      expect(outcome.detail.input.overcharge).toBe(npLevel === 5 ? 3 : 2);
      startNpGauges.push(outcome.detail.candidateEvidence.startNpGauge);
      actual.push(
        outcome.detail.result.status === 'calculated'
          ? outcome.detail.result.rows[npLevel - 1]!.average
          : Number.NaN,
      );
    }
    expect(startNpGauges).toEqual([10_000, 10_000, 10_000, 20_000]);
    expect(actual).toEqual([90_290.91, 108_832.9, 118_739.145, 133_764.555]);
  }, 30_000);

  it('classifies every static production AttackProfile without substituting a sibling', () => {
    const calculation = calculateRankingPolicy(
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      versions(),
    );
    expect({
      candidateInventory: calculation.candidateInventory,
      damageCache: calculation.damageCache,
    }).toEqual({
      candidateInventory: {
        semanticUpperBound: 7_255,
        generatedCount: 7_255,
        deduplicatedCount: 7_255,
        damageRequestUpperBound: 7_255,
        damageRequestCount: 6_913,
        distinctDamageInputCount: 1_599,
      },
      damageCache: {
        requestCount: 6_913,
        distinctDamageInputCount: 1_599,
        cacheHitCount: 5_314,
        cacheHitRate: 5_314 / 6_913,
      },
    });
    const inventoryKeys = master.servants.flatMap((servant) =>
      createStaticAttackProfiles(servant).map(attackProfileKey),
    );
    expect(Object.keys(calculation.profileResults).sort()).toEqual([...inventoryKeys].sort());
    const unavailable = Object.values(calculation.profileResults).filter(
      (result) => result.status !== 'calculated',
    );
    expect(unavailable).toEqual([]);
  }, 30_000);

  it('ratchets the largest static semantic product below the finite planner limit', () => {
    const largest = master.servants
      .flatMap((servant) =>
        compileRankingCandidateSpaces(
          servant,
          master,
          profile,
          { ...DEFAULT_RANKING_POLICY_CONDITIONS, conditionalEffects: 'satisfied' },
          createStaticAttackProfiles(servant),
        ).map((space) => ({ servantId: servant.id, space })),
      )
      .filter(
        (
          entry,
        ): entry is typeof entry & { space: Extract<typeof entry.space, { status: 'ready' }> } =>
          entry.space.status === 'ready',
      )
      .sort((left, right) => right.space.upperBound - left.space.upperBound)
      .slice(0, 1)
      .map(({ servantId, space }) => ({
        servantId,
        upperBound: space.upperBound,
      }));
    expect(largest).toEqual([{ servantId: '3300200', upperBound: 1_920 }]);
    expect(largest[0]!.upperBound).toBeLessThanOrEqual(4_096);
  });
});
