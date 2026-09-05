import {
  noblePhantasmVariantKey,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import type {
  RankingPolicyDetail,
  RankingPolicyConditions,
  RankingProfileInput,
} from './rankingContracts';
import { executeRankingScenarios, selectRankingExecutionIndexes } from './rankingExecution';
import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import type { calculateDamageResolution } from './damageResolution';
import { rankingPolicyKey } from './rankingComparisonPolicy';
import type { CalculationExecution } from './scenario';
import type { RankingExecutionPlan } from './rankingPolicyScenario';
import { reapplyPreparedCalculationPolicy } from './scenario';

export interface RankingCandidateCalculation {
  plan: RankingExecutionPlan;
  executions: readonly CalculationExecution[];
  details: ReadonlyMap<string, RankingPolicyDetail>;
}

export function calculateRankingCandidateSet(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
  damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>(),
): RankingCandidateCalculation {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const candidates = executeRankingScenarios(
    plan.preparedRankingScenarios,
    master,
    versions,
    plan.contributionPolicies,
    damageCache,
  );
  const selected = selectRankingExecutionIndexes(
    candidates,
    plan.attackProfiles,
    conditions.npLevel,
    plan,
  );
  const details = new Map(
    [...selected].flatMap(([profileKey, selectedIndex]) => {
      const blocking = candidates.some((candidate, index) => {
        if (attackProfileKey(plan.attackProfiles[index]!) !== profileKey) return false;
        const rejection = plan.preparedRankingScenarios[index]?.resolved.preparationRejection;
        if (rejection?.code === 'insufficientNpGauge') return false;
        return candidate.result.status !== 'calculated';
      });
      if (blocking) return [];
      const execution = candidates[selectedIndex]!;
      const variant = execution.noblePhantasmVariant;
      const attackProfile = plan.attackProfiles[selectedIndex]!;
      if (
        variant?.kind !== 'attack' ||
        noblePhantasmVariantKey(variant.ref) !==
          noblePhantasmVariantKey(attackProfile.noblePhantasmVariant)
      )
        throw new TypeError(`ranking_attack_profile_mismatch:${servant.id}:${profileKey}`);
      const withoutAreaPolicy = plan.withoutAreaContributionPolicies[selectedIndex];
      const withoutAreaPrepared =
        includeAreaSupport && withoutAreaPolicy
          ? reapplyPreparedCalculationPolicy(
              plan.preparedRankingScenarios[selectedIndex]!,
              withoutAreaPolicy,
            )
          : null;
      const withoutAreaExecution =
        withoutAreaPrepared && withoutAreaPolicy
          ? executeRankingScenarios(
              [withoutAreaPrepared],
              master,
              versions,
              [withoutAreaPolicy],
              damageCache,
            )[0]!
          : null;
      if (execution.status !== 'executable' || execution.result.status !== 'calculated')
        throw new TypeError(`ranking_candidate_rejected:${servant.id}:${profileKey}`);
      const areaContribution =
        withoutAreaExecution?.status === 'executable' && withoutAreaPolicy
          ? {
              withoutAreaScenario: withoutAreaExecution.scenario as Extract<
                CalculationScenario,
                { mode: 'resolved' }
              >,
              withoutAreaInput: withoutAreaExecution.input,
              withoutAreaResult: withoutAreaExecution.result,
              withoutAreaEffects: withoutAreaExecution.effects,
              contributionPolicy: withoutAreaPolicy,
              effectiveContributions: withoutAreaExecution.effectiveContributions,
              warnings: withoutAreaExecution.effectWarnings,
            }
          : null;
      const detail: RankingPolicyDetail = {
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
        contributionPolicy: plan.contributionPolicies[selectedIndex]!,
        effectiveContributions: execution.effectiveContributions,
        rankingPolicy: {
          selfBuffs: conditions.selfBuffs,
          conditionalEffects: conditions.conditionalEffects,
        },
        areaContribution,
        executionMetrics: {
          worldCandidateCount: plan.worldCandidateCount,
          scenarioCalculationCount: 1 + candidates.length + (withoutAreaExecution ? 1 : 0),
        },
        candidateEvidence: {
          policyKey: rankingPolicyKey(conditions.selfBuffs, conditions.conditionalEffects),
          candidateKey: plan.candidateKeys[selectedIndex]!,
          preparationPlanKey: plan.preparationPlanKeys[selectedIndex]!,
          startNpGauge: plan.startNpGauges[selectedIndex]!,
          baselineInputDeviation: plan.baselineInputDeviations[selectedIndex]!,
          attackProfileKey: plan.candidateEvidence[selectedIndex]!.attackProfileKey,
          canonicalInputValues: plan.candidateEvidence[selectedIndex]!.canonicalInputValues,
          targetCandidateKey: plan.candidateEvidence[selectedIndex]!.targetCandidateKey,
          fieldCandidateKey: plan.candidateEvidence[selectedIndex]!.fieldCandidateKey,
          quantityCandidateKey: plan.candidateEvidence[selectedIndex]!.quantityCandidateKey,
        },
      };
      return [[attackProfileKey(attackProfile), detail] as const];
    }),
  );
  return { plan, executions: candidates, details };
}

export function calculateRankingCandidates(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
  damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>(),
): ReadonlyMap<string, RankingPolicyDetail> {
  return calculateRankingCandidateSet(
    servant,
    master,
    profile,
    conditions,
    versions,
    includeAreaSupport,
    damageCache,
  ).details;
}

export function selectRankingDetail(
  details: ReadonlyMap<string, RankingPolicyDetail>,
  servant: ServantMaster,
  attackProfile?: AttackProfile,
): RankingPolicyDetail {
  const detail = attackProfile
    ? details.get(attackProfileKey(attackProfile))
    : details.values().next().value;
  if (!detail) throw new TypeError(`ranking_attack_profile_candidate_missing:${servant.id}`);
  return detail;
}
