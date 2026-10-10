import {
  noblePhantasmVariantKey,
  type MasterDataSnapshot,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import { attackProfileKey } from './attackProfile';
import type {
  RankingPolicyDetail,
  RankingPolicyConditions,
  RankingProfileInput,
  RankingProfileResult,
} from './rankingContracts';
import {
  evaluateRankingCandidateBatch,
  type EvaluatedRankingCandidate,
  type RankingCandidateObserver,
} from './rankingCandidateBatch';
import {
  createRankingRow,
  createRankingPolicyExclusion,
  type RankingRowSource,
} from './rankingRows';
import { compileRankingExecutionPlan } from './rankingPolicyScenario';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import type { DamageResolutionValue } from './damageResolution';
import { rankingPolicyKey } from './rankingComparisonPolicy';
import type { CalculationExecution, CalculationExecutionObservation } from './scenario';
import type { RankingExecutionPlan } from './rankingPolicyScenario';
import { reapplyPreparedCalculationPolicy, evaluatePreparedCalculationScenario } from './scenario';

export interface RankingCandidateCalculation {
  plan: RankingExecutionPlan;
  candidateInventory: ReturnType<typeof evaluateRankingCandidateBatch>['candidateInventory'];
  preparationInventory: ReturnType<typeof evaluateRankingCandidateBatch>['preparationInventory'];
  profileResults: ReadonlyMap<string, RankingProfileResult>;
  details: ReadonlyMap<string, RankingPolicyDetail>;
  executionObservations?: ReadonlyMap<
    string,
    {
      candidateKey: string;
      selectedExecution: Extract<CalculationExecution, { status: 'executable' }>;
      withoutAreaExecution: Extract<CalculationExecution, { status: 'executable' }> | null;
      selected: CalculationExecutionObservation;
      withoutAreaAlternate: CalculationExecutionObservation | null;
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

export function calculateRankingCandidateSet(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  includeAreaSupport: boolean,
  damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>(),
  captureExecutionObservation = false,
  observeCandidate?: RankingCandidateObserver,
  requestedProfileKey?: string,
): RankingCandidateCalculation {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions);
  const batch = evaluateRankingCandidateBatch(
    plan,
    master,
    versions,
    damageCache,
    captureExecutionObservation,
    observeCandidate,
  );
  const executionObservations = captureExecutionObservation
    ? new Map<string, RankingExecutionObservation>()
    : null;
  const details = new Map<string, RankingPolicyDetail>();
  for (const [profileKey, winner] of batch.selected) {
    if (
      (requestedProfileKey !== undefined && requestedProfileKey !== profileKey) ||
      batch.accumulators.get(profileKey)!.blocking
    )
      continue;
    assertCalculatedRankingCandidate(servant, winner);
    const { descriptor, execution } = winner;
    const attackProfile = descriptor.attackProfile;
    const withoutAreaPolicy = descriptor.withoutAreaContributionPolicy;
    const withoutAreaPrepared =
      includeAreaSupport && withoutAreaPolicy
        ? reapplyPreparedCalculationPolicy(winner.prepared, withoutAreaPolicy, damageCache)
        : null;
    const withoutAreaExecution =
      withoutAreaPrepared && withoutAreaPolicy
        ? evaluatePreparedCalculationScenario(withoutAreaPrepared, versions)
        : null;
    if (executionObservations) {
      if (!execution.executionObservation)
        throw new TypeError(
          `ranking_selected_execution_observation_missing:${servant.id}:${profileKey}`,
        );
      const withoutAreaObservation =
        withoutAreaExecution?.status === 'executable'
          ? withoutAreaExecution.executionObservation
          : null;
      if (withoutAreaExecution?.status === 'executable' && !withoutAreaObservation)
        throw new TypeError(`ranking_without_area_observation_missing:${servant.id}:${profileKey}`);
      executionObservations.set(profileKey, {
        candidateKey: descriptor.key,
        selectedExecution: execution,
        withoutAreaExecution:
          withoutAreaExecution?.status === 'executable' ? withoutAreaExecution : null,
        selected: execution.executionObservation,
        withoutAreaAlternate: withoutAreaObservation ?? null,
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
      ...rankingCandidateRowSource(winner),
      servantId: servant.id,
      input: execution.input,
      effects: execution.effects,
      effectInputs: execution.effectInputs,
      warnings: execution.effectWarnings,
      appliedPreparationActions: execution.appliedPreparationActions,
      possibilityCertificate: execution.possibilityCertificate,
      contributionPolicy: descriptor.contributionPolicy,
      rankingPolicy: conditions,
      basis: plan.basis,
      areaContribution,
      executionMetrics: {
        worldCandidateCount: plan.worldCandidateCount,
        scenarioCalculationCount: 1 + plan.worldCandidateCount + (withoutAreaExecution ? 1 : 0),
      },
      candidateEvidence: {
        policyKey: rankingPolicyKey(conditions.selfBuffs, conditions.conditionalEffects),
        candidateKey: descriptor.key,
        preparationPlanKey: descriptor.evidence.preparationPlanKey,
        startNpGauge: descriptor.evidence.startNpGauge,
        baselineInputDeviation: descriptor.baselineInputDeviation,
        attackProfileKey: descriptor.evidence.attackProfileKey,
        canonicalInputValues: descriptor.evidence.canonicalInputValues,
        targetCandidateKey: descriptor.evidence.targetCandidateKey,
        fieldCandidateKey: descriptor.evidence.fieldCandidateKey,
        quantityCandidateKey: descriptor.evidence.quantityCandidateKey,
      },
    };
    details.set(attackProfileKey(attackProfile), detail);
  }
  return {
    plan,
    candidateInventory: batch.candidateInventory,
    preparationInventory: batch.preparationInventory,
    profileResults: new Map(
      [...batch.accumulators]
        .filter(([key]) => requestedProfileKey === undefined || key === requestedProfileKey)
        .map(([key, accumulator]) => [key, accumulator.result(details.get(key))]),
    ),
    details,
    ...(executionObservations ? { executionObservations } : {}),
  };
}

/** Summary borrows only the winning values after every candidate, including losers, has folded. */
export function calculateRankingCandidateSummary(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
  versions: VersionContext,
  damageCache: PreparedDamageMatrixCache<DamageResolutionValue>,
) {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions);
  const batch = evaluateRankingCandidateBatch(plan, master, versions, damageCache);
  const rows = [] as ReturnType<typeof createRankingRow>[];
  const exclusions = [] as ReturnType<typeof createRankingPolicyExclusion>[];
  for (const [key, accumulator] of batch.accumulators) {
    const winner = batch.selected.get(key);
    if (winner && !accumulator.blocking) {
      assertCalculatedRankingCandidate(servant, winner);
      rows.push(createRankingRow(servant, rankingCandidateRowSource(winner), profile));
    } else {
      const result = accumulator.result();
      if (result.status === 'calculated') throw new TypeError('ranking_summary_failure_required');
      exclusions.push(createRankingPolicyExclusion(servant, key, result));
    }
  }
  return {
    plan,
    rows,
    exclusions,
    candidateInventory: batch.candidateInventory,
    preparationInventory: batch.preparationInventory,
  };
}

function rankingCandidateRowSource(winner: CalculatedRankingCandidate): RankingRowSource {
  const { execution } = winner;
  const variant = execution.noblePhantasmVariant;
  return {
    entryId: attackProfileKey(winner.descriptor.attackProfile),
    attackProfile: winner.descriptor.attackProfile,
    noblePhantasmVariant: variant.ref,
    noblePhantasmName: variant.name,
    npCard: variant.card,
    npTarget: variant.targetScope,
    scenario: execution.scenario,
    result: execution.result,
    effectiveContributions: execution.effectiveContributions,
  };
}

type CalculatedRankingCandidate = EvaluatedRankingCandidate & {
  execution: Extract<CalculationExecution, { status: 'executable' }> & {
    scenario: Extract<CalculationScenario, { mode: 'resolved' }>;
    result: Extract<CalculationExecution['result'], { status: 'calculated' }>;
    noblePhantasmVariant: Extract<
      NonNullable<CalculationExecution['noblePhantasmVariant']>,
      { kind: 'attack' }
    >;
  };
};

/** Summary and detail accept the same resolved, calculated winner. */
function assertCalculatedRankingCandidate(
  servant: ServantMaster,
  winner: EvaluatedRankingCandidate,
): asserts winner is CalculatedRankingCandidate {
  const { descriptor, execution } = winner;
  const variant = execution.noblePhantasmVariant;
  const key = attackProfileKey(descriptor.attackProfile);
  if (
    variant?.kind !== 'attack' ||
    noblePhantasmVariantKey(variant.ref) !==
      noblePhantasmVariantKey(descriptor.attackProfile.noblePhantasmVariant)
  )
    throw new TypeError(`ranking_attack_profile_mismatch:${servant.id}:${key}`);
  if (
    execution.status !== 'executable' ||
    execution.result.status !== 'calculated' ||
    execution.scenario.mode !== 'resolved'
  )
    throw new TypeError(`ranking_candidate_rejected:${servant.id}:${key}`);
}
