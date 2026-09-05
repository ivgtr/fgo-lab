import { rankingBasisFixture } from './rankingBasisFixture';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
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
import { compileRankingExecutionPlan, executeRankingScenarios } from './rankingPolicyScenario';
import { compileStaticRankingPreparationPrograms } from './rankingStaticPreparation';
import { compileCandidateLocalActionAdmissionDispositions } from './rankingActionAdmission';

const root = resolve(import.meta.dirname, '../../..');
const profile: RankingProfileInput = {
  servantBuilds: {},
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
      rankingBasisFixture(servant),
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
        basis: rankingBasisFixture(servant),
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
      rankingBasisFixture(servant),
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
      rankingBasisFixture(servant),
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
      basis: rankingBasisFixture(servant),
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
          npLevelBasis: { kind: 'specified', npLevel },
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

  it('drops only the concrete start-gauge candidate that cannot pay a represented NP cost', () => {
    const source = master.servants.find(({ id }) => id === '100100')!;
    const costEffect = master.servants
      .find(({ id }) => id === '2501400')!
      .skills.find(({ id }) => id === '2357350')!
      .effects.find(({ id }) => id === '21693')!;
    const costlySkill = source.skills[0]!;
    const servant = {
      ...source,
      skills: source.skills.map((skill) =>
        skill.id === costlySkill.id ? { ...skill, effects: [...skill.effects, costEffect] } : skill,
      ),
    };
    const fixtureMaster = {
      ...master,
      servants: master.servants.map((candidate) =>
        candidate.id === servant.id ? servant : candidate,
      ),
    };
    const compile = (npLevel: 1 | 2, conditionalEffects: 'baseline' | 'satisfied') =>
      compileRankingExecutionPlan(
        servant,
        fixtureMaster,
        profile,
        {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          npLevelBasis: { kind: 'specified', npLevel },
          conditionalEffects,
        },
        versions(),
      );
    const baseline = compile(1, 'baseline');
    const baselineExecutions = executeRankingScenarios(
      baseline.preparedRankingScenarios,
      fixtureMaster,
      versions(),
      baseline.contributionPolicies,
    );
    const costlyBaseline = baseline.preparationPlanKeys.flatMap((key, index) =>
      key.includes('"slot":1') ? [{ index, key }] : [],
    );
    expect(costlyBaseline).not.toHaveLength(0);
    expect(
      costlyBaseline.every(
        ({ index }) =>
          baseline.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ===
            'insufficientNpGauge' && baselineExecutions[index]?.status === 'rejected',
      ),
    ).toBe(true);
    expect(baselineExecutions.some(({ result }) => result.status === 'calculated')).toBe(true);

    const satisfied = compile(2, 'satisfied');
    const costlySatisfied = satisfied.preparationPlanKeys.flatMap((key, index) =>
      key.includes('"slot":1')
        ? [
            {
              startNpGauge: satisfied.startNpGauges[index],
              rejection:
                satisfied.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ??
                null,
            },
          ]
        : [],
    );
    expect(costlySatisfied).toEqual(
      expect.arrayContaining([
        { startNpGauge: 10_000, rejection: 'insufficientNpGauge' },
        { startNpGauge: 20_000, rejection: null },
      ]),
    );
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
        semanticUpperBound: 1_936,
        generatedCount: 1_936,
        deduplicatedCount: 1_936,
        damageRequestUpperBound: 1_936,
        damageRequestCount: 1_924,
        distinctDamageInputCount: 1_298,
      },
      damageCache: {
        requestCount: 1_924,
        distinctDamageInputCount: 1_298,
        cacheHitCount: 626,
        cacheHitRate: 626 / 1_924,
      },
    });
    const inventoryKeys = master.servants.flatMap((servant) =>
      createStaticAttackProfiles(servant).map(attackProfileKey),
    );
    expect(Object.keys(calculation.profileResults).sort()).toEqual([...inventoryKeys].sort());
    const unavailable = Object.values(calculation.profileResults).filter(
      (result) => result.status !== 'calculated',
    );
    expect(unavailable.map((result) => result.attackProfile?.id.servantLineageId).sort()).toEqual(
      [
        '103100',
        '105900',
        '106100',
        '106200',
        '106400',
        '203300',
        '204300',
        '204900',
        '204900',
        '304000',
        '305400',
        '305700',
        '305900',
        '306000',
        '306200',
        '306200',
        '403600',
        '405700',
        '500200',
        '502600',
        '506000',
        '601500',
        '603200',
        '604600',
        '605000',
        '605100',
        '704400',
        '704900',
        '705300',
        '1000400',
        '1000500',
        '1000900',
        '1001800',
        '1101600',
        '1101800',
        '1102300',
        '2301200',
        '2500400',
        '2501400',
        '2501600',
      ].sort(),
    );
    expect(
      unavailable.every(
        (result) =>
          result.status === 'unsupported' && result.reason === 'unsupportedActionAdmission',
      ),
    ).toBe(true);
  }, 30_000);

  it('ratchets adverse action admission and concrete execution dispositions', () => {
    const actionRecords: unknown[] = [];
    const adverseOccurrences = new Set<string>();
    const admissions: Record<string, number> = {};
    const preparationRejections: Record<string, number> = {};
    const policies = [
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'included',
        conditionalEffects: 'baseline',
      },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'included',
        conditionalEffects: 'satisfied',
      },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'excluded',
        conditionalEffects: 'baseline',
      },
      {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        selfBuffs: 'excluded',
        conditionalEffects: 'satisfied',
      },
    ] as const;
    for (const servant of master.servants) {
      for (const skill of servant.skills)
        for (const effect of skill.effects)
          for (const operation of effect.execution) {
            const family =
              operation.kind === 'resourceMutation' && operation.direction === 'loss'
                ? `${operation.resource}:${operation.amount.kind}`
                : operation.kind === 'damageModifier' && operation.sign === -1
                  ? 'negativeModifier'
                  : operation.kind === 'stateMutation' && operation.polarity === 'detrimental'
                    ? 'detrimentalState'
                    : operation.kind === 'contextMutation' &&
                        (operation.mutation === 'removeTrait' ||
                          operation.mutation === 'suppressInitialTrait')
                      ? 'traitRemoval'
                      : null;
            if (family)
              adverseOccurrences.add(`${family}|${servant.id}:${skill.id}:${effect.occurrenceId}`);
          }
      const programs = compileStaticRankingPreparationPrograms(servant);
      for (const policy of policies) {
        const policyKey = `${policy.selfBuffs}:${policy.conditionalEffects}`;
        const dispositions = compileCandidateLocalActionAdmissionDispositions(programs, policy);
        for (const disposition of dispositions) {
          actionRecords.push({ servantId: servant.id, policyKey, ...disposition });
          for (const admission of disposition.actionAdmissions) {
            const dispositionKey =
              admission.kind === 'admitted'
                ? `${admission.kind}:${admission.role}`
                : admission.kind === 'unsupported'
                  ? `${admission.kind}:${admission.reason}`
                  : admission.kind;
            const key = `${policyKey}:${dispositionKey}`;
            admissions[key] = (admissions[key] ?? 0) + 1;
          }
        }
        if (policyKey === 'included:baseline') {
          const plan = compileRankingExecutionPlan(servant, master, profile, policy, versions());
          for (const prepared of plan.preparedRankingScenarios) {
            const code = prepared.resolved.preparationRejection?.code;
            if (code) {
              const key = `${policyKey}:unreachable:${code}`;
              preparationRejections[key] = (preparationRejections[key] ?? 0) + 1;
            }
          }
        }
      }
    }
    const adverseFamilies = [...adverseOccurrences].reduce<Record<string, number>>(
      (counts, occurrence) => {
        const family = occurrence.slice(0, occurrence.indexOf('|'));
        counts[family] = (counts[family] ?? 0) + 1;
        return counts;
      },
      {
        'hp:fixed': 0,
        'hp:dependent': 0,
        'npGauge:fixed': 0,
        'npGauge:dependent': 0,
        'criticalStars:fixed': 0,
        'criticalStars:dependent': 0,
        'battlePoint:fixed': 0,
        'battlePoint:dependent': 0,
        negativeModifier: 0,
        detrimentalState: 0,
        traitRemoval: 0,
      },
    );
    expect({
      adverseFamilies,
      admissions,
      preparationRejections,
      actionDigest: createHash('sha256').update(JSON.stringify(actionRecords)).digest('hex'),
    }).toEqual({
      adverseFamilies: {
        'battlePoint:dependent': 0,
        'battlePoint:fixed': 1,
        'criticalStars:dependent': 0,
        'criticalStars:fixed': 5,
        detrimentalState: 0,
        'hp:dependent': 0,
        'hp:fixed': 23,
        negativeModifier: 27,
        'npGauge:dependent': 0,
        'npGauge:fixed': 38,
        traitRemoval: 3,
      },
      admissions: {
        'excluded:baseline:admitted:structuralRequired': 148,
        'excluded:baseline:policyNoOp': 15024,
        'excluded:satisfied:admitted:structuralRequired': 148,
        'excluded:satisfied:policyNoOp': 15024,
        'included:baseline:admitted:optional': 8029,
        'included:baseline:admitted:structuralRequired': 148,
        'included:baseline:policyNoOp': 6460,
        'included:baseline:unsupported:unresolvedOperation': 535,
        'included:satisfied:admitted:optional': 14467,
        'included:satisfied:admitted:structuralRequired': 148,
        'included:satisfied:policyNoOp': 22,
        'included:satisfied:unsupported:unresolvedOperation': 535,
      },
      preparationRejections: {
        'included:baseline:unreachable:insufficientNpGauge': 12,
      },
      actionDigest: 'bb43fa1ff4df8e68ce460829cba253459ebc2e1a7e053a7ce782529018d6e101',
    });
  }, 30_000);

  it('ratchets the largest static semantic product below the finite planner limit', () => {
    const largest = master.servants
      .flatMap((servant) =>
        compileRankingCandidateSpaces(
          servant,
          master,
          rankingBasisFixture(servant),
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
    expect(largest).toEqual([{ servantId: '3300200', upperBound: 3_840 }]);
    expect(largest[0]!.upperBound).toBeLessThanOrEqual(4_096);
  });
});
