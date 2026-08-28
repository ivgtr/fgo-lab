import { noblePhantasmVariantKey, type MasterDataSnapshot } from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import type {
  RankingConditions,
  RankingDetail,
  RankingFailure,
  RankingNpLevel,
  RankingProfileInput,
  RankingRowSummary,
  RankingSummaryMatrix,
} from './rankingContracts';
import { createRankingRow, includedRankingServants } from './rankingRows';
import { compileRankingExecutionPlan } from './rankingScenario';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import type { DamageContributionProjection } from '@fgo-lab/battle-execution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import { calculateDamageResolution } from './damageResolution';
import {
  evaluatePreparedCalculationResult,
  evaluatePreparedCalculationScenario,
  projectPreparedCalculationContribution,
  type CalculationExecution,
} from './scenario';
import { selectRankingCandidateIndexes } from './rankingExecution';

const NP_LEVELS = [1, 2, 3, 4, 5] as const;

export function rankingMatrixPolicyKey(conditions: Omit<RankingConditions, 'npLevel'>): string {
  return [
    conditions.comparisonMode,
    conditions.classAffinity,
    conditions.selfBuffs,
    conditions.specialAttack,
    conditions.field,
  ].join(':');
}

function detailAtNpLevel(
  execution: CalculationExecution,
  attackProfile: AttackProfile,
  npLevel: RankingNpLevel,
  worldCandidateCount: number,
  scenarioCalculationCount: number,
  contributionProjection: DamageContributionProjection,
): RankingDetail {
  if (execution.scenario.mode !== 'resolved')
    throw new TypeError('ranking_matrix_resolved_scenario_required');
  const scenario: Extract<CalculationScenario, { mode: 'resolved' }> = {
    ...execution.scenario,
    attacker: { ...execution.scenario.attacker, npLevel },
  };
  const variant = execution.noblePhantasmVariant;
  if (variant?.kind !== 'attack') throw new TypeError('ranking_matrix_attack_variant_required');
  return {
    entryId: attackProfileKey(attackProfile),
    servantId: scenario.attacker.servantId,
    attackProfile,
    noblePhantasmVariant: variant.ref,
    noblePhantasmName: variant.name,
    npCard: variant.card,
    npTarget: variant.targetScope,
    scenario,
    input: { ...execution.input, npLevel },
    result: execution.result,
    effects: execution.effects,
    effectInputs: execution.effectInputs,
    warnings: execution.effectWarnings,
    appliedPreparationActions: execution.appliedPreparationActions,
    contributionProjection,
    areaContribution: null,
    executionMetrics: { worldCandidateCount, scenarioCalculationCount },
  };
}

export function calculateStandardRankingMatrix(
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: Omit<RankingConditions, 'npLevel'>,
  versions: VersionContext,
): RankingSummaryMatrix {
  if (conditions.comparisonMode !== 'standard')
    throw new TypeError('ranking_matrix_standard_mode_required');
  const rows = NP_LEVELS.map(() => [] as RankingRowSummary[]);
  const failures = NP_LEVELS.map(() => [] as RankingFailure[]);
  const baseConditions: RankingConditions = { ...conditions, npLevel: 1 };
  const damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>();
  for (const servant of includedRankingServants(master, profile, baseConditions)) {
    const plan = compileRankingExecutionPlan(servant, master, profile, baseConditions, versions);
    const candidates = plan.preparedRankingScenarios.map((prepared, index) => {
      const projection = plan.contributionProjections[index]!;
      const projected =
        projection.excludedOperationIds.size > 0
          ? projectPreparedCalculationContribution(prepared, projection)
          : prepared;
      const variant = projected.resolved.noblePhantasmVariant;
      if (variant?.kind !== 'attack')
        throw new TypeError(`ranking_matrix_attack_variant_required:${servant.id}`);
      const calculation = damageCache.getOrCreate(
        { noblePhantasmVariant: variant.ref, input: projected.resolved.input },
        () => calculateDamageResolution(projected.resolved.input, versions),
      );
      return {
        projected,
        calculation,
        result: evaluatePreparedCalculationResult(projected, versions, calculation),
      };
    });
    const executionCache = new Map<number, CalculationExecution>();
    for (const npLevel of NP_LEVELS) {
      let selected: ReturnType<typeof selectRankingCandidateIndexes>;
      try {
        selected = selectRankingCandidateIndexes(
          candidates.map(({ projected, result }, index) => {
            const scenario = projected.scenario;
            const actions = projected.resolved.appliedPreparationActions;
            const variant = projected.resolved.noblePhantasmVariant!;
            return {
              index,
              attackProfile: plan.attackProfiles[index]!,
              average:
                result.status === 'calculated' ? (result.rows[npLevel - 1]?.average ?? null) : null,
              externalFieldFactCount:
                scenario.mode === 'resolved'
                  ? scenario.worldFactAssertions.filter(
                      ({ decisionKey, fact }) =>
                        decisionKey.startsWith('ranking:field:') &&
                        fact.kind === 'trait' &&
                        fact.present,
                    ).length
                  : 0,
              activationFactCount: actions.reduce(
                (count, action) => count + action.activationFacts.length,
                0,
              ),
              transitionCount: actions.filter(({ transition }) => transition !== null).length,
              noblePhantasmVariantKey: noblePhantasmVariantKey(variant.ref),
            };
          }),
        );
      } catch (error) {
        throw new TypeError(`ranking_candidate_selection_failed:${servant.id}`, { cause: error });
      }
      for (const selectedIndex of selected.values()) {
        const candidate = candidates[selectedIndex]!;
        let execution = executionCache.get(selectedIndex);
        if (!execution) {
          execution = evaluatePreparedCalculationScenario(
            candidate.projected,
            versions,
            candidate.calculation,
          );
          executionCache.set(selectedIndex, execution);
        }
        const detail = detailAtNpLevel(
          execution,
          plan.attackProfiles[selectedIndex]!,
          npLevel,
          plan.worldCandidateCount,
          1 + candidates.length,
          plan.contributionProjections[selectedIndex]!,
        );
        const row = createRankingRow(servant, detail, profile);
        if ('status' in row) failures[npLevel - 1]!.push(row);
        else rows[npLevel - 1]!.push(row);
      }
    }
  }
  return NP_LEVELS.map((npLevel) => ({
    rows: rows[npLevel - 1]!,
    failures: failures[npLevel - 1]!,
  })) as unknown as RankingSummaryMatrix;
}
