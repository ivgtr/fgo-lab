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
import type {
  CalculationExecution,
  CalculationExecutionObservation,
  PreparedCalculationScenario,
} from './scenario';
import type { RankingExecutionPlan } from './rankingPolicyScenario';
import { reapplyPreparedCalculationPolicy } from './scenario';

export interface RankingCandidateCalculation {
  plan: RankingExecutionPlan;
  executions: readonly CalculationExecution[];
  details: ReadonlyMap<string, RankingPolicyDetail>;
  executionObservations?: ReadonlyMap<
    string,
    {
      candidateKey: string;
      selectedExecution: Extract<CalculationExecution, { status: 'executable' }>;
      withoutAreaExecution: Extract<CalculationExecution, { status: 'executable' }> | null;
      selected: CalculationExecutionObservation;
      selectedInput: Extract<CalculationExecution, { status: 'executable' }>['input'];
      selectedEffectiveContributions: CalculationExecution['effectiveContributions'];
      withoutAreaAlternate: CalculationExecutionObservation | null;
      withoutAreaInput: Extract<CalculationExecution, { status: 'executable' }>['input'] | null;
      withoutAreaEffectiveContributions: CalculationExecution['effectiveContributions'] | null;
    }
  >;
}

export type RankingExecutionObservation =
  NonNullable<RankingCandidateCalculation['executionObservations']> extends ReadonlyMap<
    string,
    infer Observation
  >
    ? Observation
    : never;

function withoutExecutionObservation(execution: CalculationExecution): CalculationExecution {
  const visibleExecution = { ...execution };
  delete visibleExecution.executionObservation;
  return visibleExecution;
}

function withoutPreparedExecutionObservation(
  prepared: PreparedCalculationScenario,
): PreparedCalculationScenario {
  if (prepared.status !== 'executable') return prepared;
  const visiblePrepared = { ...prepared };
  delete visiblePrepared.executionObservation;
  return visiblePrepared;
}

function isTypedUnreachableCandidate(candidate: CalculationExecution): boolean {
  return (
    candidate.result.status === 'unavailable' ||
    (candidate.result.status === 'unsupported' &&
      candidate.result.missingEvidence.length === 1 &&
      candidate.result.missingEvidence[0] === 'preparation:attackNoblePhantasmUnavailable')
  );
}

export function calculateRankingCandidateSet(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
  damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>(),
  captureExecutionObservation = false,
): RankingCandidateCalculation {
  const plan = compileRankingExecutionPlan(
    servant,
    master,
    profile,
    conditions,
    versions,
    captureExecutionObservation,
  );
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
    plan.basis.npLevel,
    plan,
  );
  const executionObservations = captureExecutionObservation
    ? new Map<string, RankingExecutionObservation>()
    : null;
  const details = new Map(
    [...selected].flatMap(([profileKey, selectedIndex]) => {
      const blocking = candidates.some((candidate, index) => {
        if (attackProfileKey(plan.attackProfiles[index]!) !== profileKey) return false;
        if (isTypedUnreachableCandidate(candidate)) return false;
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
      if (captureExecutionObservation) {
        if (!executionObservations)
          throw new TypeError('ranking_execution_observation_map_missing');
        if (!execution.executionObservation)
          throw new TypeError(
            `ranking_selected_execution_observation_missing:${servant.id}:${profileKey}`,
          );
        const withoutAreaObservation =
          withoutAreaExecution?.status === 'executable'
            ? withoutAreaExecution.executionObservation
            : null;
        if (withoutAreaExecution?.status === 'executable' && !withoutAreaObservation)
          throw new TypeError(
            `ranking_without_area_observation_missing:${servant.id}:${profileKey}`,
          );
        executionObservations.set(profileKey, {
          candidateKey: plan.candidateKeys[selectedIndex]!,
          selectedExecution: execution,
          withoutAreaExecution:
            withoutAreaExecution?.status === 'executable' ? withoutAreaExecution : null,
          selected: execution.executionObservation,
          selectedInput: execution.input,
          selectedEffectiveContributions: execution.effectiveContributions,
          withoutAreaAlternate: withoutAreaObservation ?? null,
          withoutAreaInput:
            withoutAreaExecution?.status === 'executable' ? withoutAreaExecution.input : null,
          withoutAreaEffectiveContributions:
            withoutAreaExecution?.status === 'executable'
              ? withoutAreaExecution.effectiveContributions
              : null,
        });
      }
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
        rankingPolicy: conditions,
        basis: plan.basis,
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
  const publicPlan = captureExecutionObservation
    ? {
        ...plan,
        preparedRankingScenarios: plan.preparedRankingScenarios.map(
          withoutPreparedExecutionObservation,
        ),
      }
    : plan;
  return {
    plan: publicPlan,
    executions: captureExecutionObservation
      ? candidates.map(withoutExecutionObservation)
      : candidates,
    details,
    ...(executionObservations ? { executionObservations } : {}),
  };
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
