import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { APP_VERSION, ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import { compileRankingComparisonPolicy, rankingPolicyKey } from './rankingComparisonPolicy';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
  type RankingProfileInput,
} from './rankingContracts';
import { calculateRankingPolicy } from './rankingPolicyCalculation';
import { calculateRankingPolicyMatrix } from './rankingPolicyMatrix';
import { calculateScenarioWithPolicy } from './scenario';
import { selectRankingCandidateIndexes } from './rankingCandidateSelection';
import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { attackProfileKey } from './attackProfile';

const master = masterSnapshotSchema.parse(fixture);
const profile: RankingProfileInput = {
  servantBuilds: {},
};
const versions = {
  schemaVersion: SCHEMA_VERSION,
  masterDataVersion: master.version,
  engineVersion: ENGINE_VERSION,
  appVersion: APP_VERSION,
  gameRegion: 'JP' as const,
  masterDataLocale: 'ja-JP' as const,
};

describe('ranking comparison policy', () => {
  it('compiles the four orthogonal source and condition combinations', () => {
    const policies = (['included', 'excluded'] as const).flatMap((selfBuffs) =>
      (['baseline', 'satisfied'] as const).map((conditionalEffects) =>
        compileRankingComparisonPolicy(
          {
            ...DEFAULT_RANKING_POLICY_CONDITIONS,
            selfBuffs,
            conditionalEffects,
          },
          master,
        ),
      ),
    );
    expect(policies.map(({ key }) => key)).toEqual([
      'included:baseline',
      'included:satisfied',
      'excluded:baseline',
      'excluded:satisfied',
    ]);
    expect(policies.map(({ commands }) => commands)).toEqual([
      [
        { kind: 'setVoluntarySelfContribution', mode: 'include' },
        { kind: 'setConditionalContribution', mode: 'baseline' },
      ],
      [
        { kind: 'setVoluntarySelfContribution', mode: 'include' },
        { kind: 'setConditionalContribution', mode: 'satisfied' },
      ],
      [
        { kind: 'setVoluntarySelfContribution', mode: 'exclude' },
        { kind: 'setConditionalContribution', mode: 'baseline' },
      ],
      [
        { kind: 'setVoluntarySelfContribution', mode: 'exclude' },
        { kind: 'setConditionalContribution', mode: 'satisfied' },
      ],
    ]);
    expect(policies.map(({ initialNpGauge }) => initialNpGauge)).toEqual([
      10000, 10000, 10000, 10000,
    ]);
  });

  it('keeps one trace per calculated value and reuses the calculator executor', () => {
    const calculations = new Map<string, ReturnType<typeof calculateRankingPolicy>>();
    for (const selfBuffs of ['included', 'excluded'] as const)
      for (const conditionalEffects of ['baseline', 'satisfied'] as const) {
        const conditions: RankingPolicyConditions = {
          ...DEFAULT_RANKING_POLICY_CONDITIONS,
          selfBuffs,
          conditionalEffects,
        };
        const calculation = calculateRankingPolicy(master, profile, conditions, versions);
        calculations.set(rankingPolicyKey(selfBuffs, conditionalEffects), calculation);
        expect(
          Object.values(calculation.profileResults).every(({ status }) => status === 'calculated'),
        ).toBe(true);
        expect(calculation.rows.length).toBeGreaterThan(0);
        expect(calculation.candidateInventory.damageRequestCount).toBeGreaterThanOrEqual(
          calculation.candidateInventory.distinctDamageInputCount,
        );
        expect(calculation.candidateInventory.generatedCount).toBeLessThanOrEqual(
          calculation.candidateInventory.semanticUpperBound,
        );
        expect(calculation.candidateInventory.damageRequestCount).toBeLessThanOrEqual(
          calculation.candidateInventory.damageRequestUpperBound,
        );
        for (const result of Object.values(calculation.profileResults)) {
          if (result.status !== 'calculated') continue;
          const detail = result.detail;
          expect(detail.candidateEvidence.policyKey).toBe(
            rankingPolicyKey(selfBuffs, conditionalEffects),
          );
          const recalculated = calculateScenarioWithPolicy(
            detail.scenario,
            master,
            versions,
            detail.contributionPolicy,
            { initialNpGauge: detail.candidateEvidence.startNpGauge },
          );
          expect(recalculated.result).toEqual(detail.result);
          expect(recalculated.effects).toEqual(detail.effects);
        }
      }

    for (const selfBuffs of ['included', 'excluded'] as const) {
      const baseline = calculations.get(rankingPolicyKey(selfBuffs, 'baseline'))!;
      const satisfied = calculations.get(rankingPolicyKey(selfBuffs, 'satisfied'))!;
      const baselineRows = new Map(baseline.rows.map((row) => [row.entryId, row.average]));
      for (const row of satisfied.rows)
        expect(row.average).toBeGreaterThanOrEqual(baselineRows.get(row.entryId) ?? -Infinity);
    }
  });

  it('retains the baseline candidate and applies the stable policy tie-break', () => {
    const conditions: RankingPolicyConditions = {
      ...DEFAULT_RANKING_POLICY_CONDITIONS,
      conditionalEffects: 'satisfied',
    };
    const servant = master.servants[0]!;
    const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
    expect(plan.startNpGauges).toContain(master.npResourceSemantics.noblePhantasmUse.requirement);
    expect(
      plan.candidateKeys.some(
        (key) =>
          key.includes('target:baseline') &&
          key.includes('field:none') &&
          key.includes('quantity:baseline'),
      ),
    ).toBe(true);

    const attackProfile = plan.attackProfiles[0]!;
    const base = {
      attackProfile,
      average: 100,
      externalFactCount: 0,
      activationFactCount: 0,
      transitionCount: 0,
      noblePhantasmVariantKey: 'np',
      preparationActionCount: 1,
    };
    const selected = selectRankingCandidateIndexes([
      { ...base, index: 2, baselineInputDeviation: 1, candidateKey: 'a' },
      { ...base, index: 1, baselineInputDeviation: 0, candidateKey: 'b' },
      { ...base, index: 0, baselineInputDeviation: 0, candidateKey: 'a' },
    ]);
    expect(selected.get(attackProfileKey(attackProfile))).toBe(0);
  });

  it('uses five complete policy executions as the canonical NP matrix oracle', () => {
    const conditions: Omit<RankingPolicyConditions, 'npLevelBasis'> = {
      initialOvercharge: 1,
      population: DEFAULT_RANKING_POLICY_CONDITIONS.population,
      levelBasis: DEFAULT_RANKING_POLICY_CONDITIONS.levelBasis,
      classAffinity: DEFAULT_RANKING_POLICY_CONDITIONS.classAffinity,
      selfBuffs: DEFAULT_RANKING_POLICY_CONDITIONS.selfBuffs,
      conditionalEffects: DEFAULT_RANKING_POLICY_CONDITIONS.conditionalEffects,
    };
    const matrix = calculateRankingPolicyMatrix(master, profile, conditions, versions);
    const direct = ([1, 2, 3, 4, 5] as const).map((npLevel) =>
      calculateRankingPolicy(
        master,
        profile,
        { ...conditions, npLevelBasis: { kind: 'specified', npLevel } },
        versions,
      ),
    );
    expect(matrix).toEqual(direct);
    for (const [index, calculation] of matrix.entries())
      for (const result of Object.values(calculation.profileResults))
        if (result.status === 'calculated') {
          expect(result.detail.scenario.attacker.npLevel).toBe(index + 1);
          expect(result.detail.input.npLevel).toBe(index + 1);
        }
  });
});
