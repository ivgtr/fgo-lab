import {
  noblePhantasmVariantKey,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import type { RankingConditions, RankingDetail, RankingProfileInput } from './rankingContracts';
import { executeRankingScenarios, selectRankingExecutionIndexes } from './rankingExecution';
import { compileRankingExecutionPlan } from './rankingScenario';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import type { calculateDamageResolution } from './damageResolution';

export function calculateRankingCandidates(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
  damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>(),
): ReadonlyMap<string, RankingDetail> {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const candidates = executeRankingScenarios(
    plan.preparedRankingScenarios,
    master,
    versions,
    plan.contributionProjections,
    damageCache,
  );
  const selected = selectRankingExecutionIndexes(
    candidates,
    plan.attackProfiles,
    conditions.npLevel,
  );
  return new Map(
    [...selected].map(([profileKey, selectedIndex]) => {
      const execution = candidates[selectedIndex]!;
      const variant = execution.noblePhantasmVariant;
      const attackProfile = plan.attackProfiles[selectedIndex]!;
      if (
        variant?.kind !== 'attack' ||
        noblePhantasmVariantKey(variant.ref) !==
          noblePhantasmVariantKey(attackProfile.noblePhantasmVariant)
      )
        throw new TypeError(`ranking_attack_profile_mismatch:${servant.id}:${profileKey}`);
      const withoutAreaPrepared = plan.preparedWithoutAreaScenarios[selectedIndex];
      const withoutAreaProjection = plan.withoutAreaContributionProjections[selectedIndex];
      const withoutAreaExecution =
        includeAreaSupport && withoutAreaPrepared && withoutAreaProjection
          ? executeRankingScenarios(
              [withoutAreaPrepared],
              master,
              versions,
              [withoutAreaProjection],
              damageCache,
            )[0]!
          : null;
      const areaContribution =
        withoutAreaExecution && withoutAreaProjection
          ? {
              withoutAreaScenario: withoutAreaExecution.scenario as Extract<
                CalculationScenario,
                { mode: 'resolved' }
              >,
              withoutAreaInput: withoutAreaExecution.input,
              withoutAreaResult: withoutAreaExecution.result,
              withoutAreaEffects: withoutAreaExecution.effects,
              contributionProjection: withoutAreaProjection,
              warnings: withoutAreaExecution.effectWarnings,
            }
          : null;
      const detail: RankingDetail = {
        entryId: profileKey,
        servantId: servant.id,
        attackProfile,
        noblePhantasmVariant: variant.ref,
        noblePhantasmName: variant.name,
        npCard: variant.card,
        npTarget: variant.targetScope,
        scenario: execution.scenario as Extract<CalculationScenario, { mode: 'resolved' }>,
        input: execution.input,
        result: execution.result,
        effects: execution.effects,
        effectInputs: execution.effectInputs,
        warnings: execution.effectWarnings,
        appliedPreparationActions: execution.appliedPreparationActions,
        contributionProjection: plan.contributionProjections[selectedIndex]!,
        areaContribution,
        executionMetrics: {
          worldCandidateCount: plan.worldCandidateCount,
          scenarioCalculationCount: 1 + candidates.length + (withoutAreaExecution ? 1 : 0),
        },
      };
      return [attackProfileKey(attackProfile), detail] as const;
    }),
  );
}

export function selectRankingDetail(
  details: ReadonlyMap<string, RankingDetail>,
  servant: ServantMaster,
  attackProfile?: AttackProfile,
): RankingDetail {
  const detail = attackProfile
    ? details.get(attackProfileKey(attackProfile))
    : details.values().next().value;
  if (!detail) throw new TypeError(`ranking_attack_profile_candidate_missing:${servant.id}`);
  return detail;
}
