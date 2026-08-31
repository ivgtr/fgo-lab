import type { DamageContributionProjection } from '@fgo-lab/battle-execution';
import {
  actorFormKey,
  noblePhantasmVariantKey,
  type ActorFormId,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { AttackProfile } from './attackProfile';
import { calculateDamageResolution } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import {
  evaluatePreparedCalculationScenario,
  prepareCalculationScenario,
  projectPreparedCalculationContribution,
  type CalculationExecution,
  type PreparedCalculationScenario,
} from './scenario';
import type { ResolvedScenario } from './rankingPolicy';
import { selectRankingCandidateIndexes } from './rankingCandidateSelection';
export { selectRankingCandidateIndexes } from './rankingCandidateSelection';

function selectedAverage(
  execution: CalculationExecution,
  attackProfile: AttackProfile,
  expectedTerminalFormId: ActorFormId | undefined,
  npLevel: 1 | 2 | 3 | 4 | 5,
): number | null {
  if (execution.result.status !== 'calculated' || execution.scenario.mode !== 'resolved')
    return null;
  if (
    execution.noblePhantasmVariant?.kind !== 'attack' ||
    noblePhantasmVariantKey(execution.noblePhantasmVariant.ref) !==
      noblePhantasmVariantKey(attackProfile.noblePhantasmVariant) ||
    execution.terminalActorFormId === null ||
    (expectedTerminalFormId !== undefined &&
      actorFormKey(expectedTerminalFormId) !== actorFormKey(execution.terminalActorFormId))
  )
    return null;
  return execution.result.rows[npLevel - 1]?.average ?? null;
}

function externalFactCount(execution: CalculationExecution): number {
  if (execution.scenario.mode !== 'resolved') return 0;
  return execution.scenario.worldFactAssertions.filter(
    ({ decisionKey, fact }) =>
      decisionKey.startsWith('ranking:') && fact.kind === 'trait' && fact.present,
  ).length;
}

const activationFactCount = (execution: CalculationExecution): number =>
  execution.appliedPreparationActions.reduce(
    (count, action) => count + action.activationFacts.length,
    0,
  );

const transitionCount = (execution: CalculationExecution): number =>
  execution.appliedPreparationActions.filter(({ transition }) => transition !== null).length;

export function executeRankingScenarios(
  scenarios: readonly (ResolvedScenario | PreparedCalculationScenario)[],
  master: MasterDataSnapshot,
  versions: VersionContext,
  contributionProjections?: readonly DamageContributionProjection[],
  damageCache = new PreparedDamageMatrixCache<ReturnType<typeof calculateDamageResolution>>(),
): CalculationExecution[] {
  const prepared = scenarios.map((scenario) =>
    'resolved' in scenario ? scenario : prepareCalculationScenario(scenario, master),
  );
  if (contributionProjections && contributionProjections.length !== prepared.length)
    throw new TypeError('ranking_contribution_projection_alignment_mismatch');
  const projected = prepared.map((candidate, index) => {
    const projection = contributionProjections?.[index];
    return projection &&
      (projection.includedOperationIds.size > 0 ||
        projection.excludedOperationIds.size > 0 ||
        projection.excludedStateTraitContributions.attackerState.size > 0 ||
        projection.excludedStateTraitContributions.targetState.size > 0)
      ? projectPreparedCalculationContribution(candidate, projection)
      : candidate;
  });
  return projected.map((candidate) => {
    if (candidate.status === 'rejected')
      return evaluatePreparedCalculationScenario(candidate, versions);
    const variant = candidate.resolved.noblePhantasmVariant;
    if (!variant) return evaluatePreparedCalculationScenario(candidate, versions);
    const calculation = damageCache.getOrCreate(
      { noblePhantasmVariant: variant.ref, input: candidate.resolved.input },
      () => calculateDamageResolution(candidate.resolved.input, versions),
    );
    return evaluatePreparedCalculationScenario(candidate, versions, calculation);
  });
}

export function selectRankingExecutionIndexes(
  executions: readonly CalculationExecution[],
  attackProfiles: readonly AttackProfile[],
  npLevel: 1 | 2 | 3 | 4 | 5,
  evidence?: {
    candidateKeys: readonly string[];
    baselineInputDeviations: readonly number[];
    expectedTerminalFormIds?: readonly ActorFormId[];
  },
): ReadonlyMap<string, number> {
  if (executions.length !== attackProfiles.length)
    throw new TypeError('ranking_attack_profile_alignment_mismatch');
  return selectRankingCandidateIndexes(
    executions.map((execution, index) => ({
      attackProfile: attackProfiles[index]!,
      index,
      average: selectedAverage(
        execution,
        attackProfiles[index]!,
        evidence?.expectedTerminalFormIds?.[index],
        npLevel,
      ),
      externalFactCount: externalFactCount(execution),
      activationFactCount: activationFactCount(execution),
      transitionCount: transitionCount(execution),
      noblePhantasmVariantKey:
        execution.noblePhantasmVariant?.kind === 'attack'
          ? noblePhantasmVariantKey(execution.noblePhantasmVariant.ref)
          : '',
      baselineInputDeviation: evidence?.baselineInputDeviations[index] ?? 0,
      preparationActionCount: execution.appliedPreparationActions.length,
      candidateKey: evidence?.candidateKeys[index] ?? String(index).padStart(8, '0'),
    })),
  );
}
