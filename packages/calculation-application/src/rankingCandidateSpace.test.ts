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
    expect(spaces.some(({ status }) => status === 'ready')).toBe(true);
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

  it('certifies the complete domain before materialization', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const spaces = compileRankingCandidateSpaces(
      servant,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      createStaticAttackProfiles(servant),
    );
    for (const space of spaces) {
      if (space.status !== 'ready') continue;
      expect(space.certificate.completeUpperBound).toBe(space.upperBound);
      expect(space.certificate.supportedMaximum).toBe(4_096);
      expect(space.certificate.programBounds.reduce((sum, item) => sum + item.upperBound, 0)).toBe(
        space.upperBound,
      );
    }
  });

  it('matches an independent exhaustive oracle for a small prepared context', () => {
    const servant = master.servants.find(({ id }) => id === '403700')!;
    const space = compileRankingCandidateSpaces(
      servant,
      master,
      profile,
      DEFAULT_RANKING_POLICY_CONDITIONS,
      createStaticAttackProfiles(servant),
    ).find((candidate) => candidate.status === 'ready');
    if (!space) throw new Error('ready candidate space required');
    const oracle: string[] = [];
    for (const program of space.programs)
      for (const startNpGauge of program.startNpGauges)
        for (const target of program.targets)
          for (const field of program.fields)
            for (const quantity of program.quantities) {
              const visitInputs = (index: number, values: Record<string, number>) => {
                const input = program.canonicalInputs[index];
                if (input)
                  for (const value of input.values)
                    visitInputs(index + 1, { ...values, [input.key]: value });
                else
                  oracle.push(
                    JSON.stringify({
                      program: program.program.key,
                      startNpGauge,
                      values,
                      target: target?.key ?? 'target:baseline',
                      field: field.key,
                      quantity: quantity.key,
                    }),
                  );
              };
              visitInputs(0, {});
            }
    const materialized = materializeRankingCandidateSpace({
      servant,
      master,
      profile,
      conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
      space,
    }).map(({ evidence }) =>
      JSON.stringify({
        program: evidence.preparationPlanKey,
        startNpGauge: evidence.startNpGauge,
        values: evidence.canonicalInputValues,
        target: evidence.targetCandidateKey,
        field: evidence.fieldCandidateKey,
        quantity: evidence.quantityCandidateKey,
      }),
    );
    expect(materialized.sort()).toEqual(oracle.sort());
    expect(materialized).toHaveLength(space.certificate.completeUpperBound);
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
      actual.push(outcome.detail.result.rows[npLevel - 1]!.average);
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
        semanticUpperBound: 576,
        generatedCount: 576,
        deduplicatedCount: 576,
        damageRequestUpperBound: 576,
        damageRequestCount: 575,
        distinctDamageInputCount: 556,
      },
      damageCache: {
        requestCount: 575,
        distinctDamageInputCount: 556,
        cacheHitCount: 19,
        cacheHitRate: 19 / 575,
      },
    });
    const inventoryKeys = master.servants.flatMap((servant) =>
      createStaticAttackProfiles(servant).map(attackProfileKey),
    );
    expect(Object.keys(calculation.profileResults).sort()).toEqual([...inventoryKeys].sort());
    const unavailable = Object.values(calculation.profileResults).filter(
      (result) => result.status !== 'calculated',
    );
    expect(
      unavailable.map((result) => ({
        status: result.status,
        reason: 'reason' in result ? result.reason : null,
        servantLineageId: result.attackProfile?.id.servantLineageId,
      })),
    ).toEqual([
      {
        status: 'unavailableUnderPolicy',
        reason: 'insufficientNpGauge',
        servantLineageId: '2501400',
      },
    ]);
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
    expect(largest).toEqual([{ servantId: '3300200', upperBound: 2_880 }]);
    expect(largest[0]!.upperBound).toBeLessThanOrEqual(4_096);
  });
});
