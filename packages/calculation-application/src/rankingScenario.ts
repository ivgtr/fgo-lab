import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import type { DamageContributionProjection } from '@fgo-lab/battle-execution';
import type { RankingConditions, RankingProfileInput } from './rankingContracts';
import { type ResolvedScenario } from './rankingPolicy';
import { compileRankingScenarioWorlds } from './rankingScenarioWorlds';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import {
  prepareCalculationScenarioWithContributionProjection,
  projectPreparedCalculationContribution,
  type PreparedCalculationProjection,
  type PreparedCalculationScenario,
} from './scenario';
import { executeRankingScenarios, selectRankingExecutionIndexes } from './rankingExecution';
import { compileRankingPreparationProgram } from './rankingPreparationProgram';

export { selectedKeysForScope } from './rankingScenarioWorlds';
export { executeRankingScenarios, selectRankingExecutionIndexes } from './rankingExecution';

export interface RankingExecutionPlan {
  baseScenario: ResolvedScenario;
  baseline: PreparedCalculationProjection;
  rankingScenarios: readonly ResolvedScenario[];
  preparedRankingScenarios: readonly PreparedCalculationScenario[];
  attackProfiles: readonly AttackProfile[];
  contributionProjections: readonly DamageContributionProjection[];
  withoutAreaScenarios: readonly (ResolvedScenario | null)[];
  preparedWithoutAreaScenarios: readonly (PreparedCalculationScenario | null)[];
  withoutAreaContributionProjections: readonly (DamageContributionProjection | null)[];
  worldCandidateCount: number;
}

function prepareOptionalRankingScenario(
  scenario: ResolvedScenario | null,
  canonical: ResolvedScenario,
  canonicalPrepared: PreparedCalculationScenario,
  master: MasterDataSnapshot,
  projection: DamageContributionProjection | null,
): PreparedCalculationScenario | null {
  if (scenario === null || projection === null) return null;
  return prepareRankingScenario(scenario, canonical, canonicalPrepared, master, projection);
}

function prepareRankingScenario(
  scenario: ResolvedScenario,
  canonical: ResolvedScenario,
  canonicalPrepared: PreparedCalculationScenario,
  master: MasterDataSnapshot,
  projection: DamageContributionProjection,
): PreparedCalculationScenario {
  if (scenario !== canonical)
    return prepareCalculationScenarioWithContributionProjection(scenario, master, projection);
  return projection.excludedOperationIds.size === 0 &&
    projection.excludedStateTraitContributions.attackerState.size === 0 &&
    projection.excludedStateTraitContributions.targetState.size === 0
    ? canonicalPrepared
    : projectPreparedCalculationContribution(canonicalPrepared, projection);
}

export function compileRankingExecutionPlan(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
): RankingExecutionPlan {
  const plans = compileRankingPreparationProgram(servant, master, profile, conditions).map(
    ({ canonical, baseline, canonicalPrepared, attackProfile }) => {
      const worlds = compileRankingScenarioWorlds({
        servant,
        master,
        conditions,
        versions,
        canonical,
        baseline,
        plannedTargetStateTraits: new Set(canonicalPrepared.resolved.targetStateTraitsAtDamage),
        intrinsicTargetStateTraits: new Set(
          canonicalPrepared.resolved.intrinsicTargetStateTraitsAtDamage,
        ),
      });
      return {
        baseScenario: canonical,
        baseline,
        attackProfile,
        preparedRankingScenarios: worlds.rankingScenarios.map((scenario, index) =>
          prepareRankingScenario(
            scenario,
            canonical,
            canonicalPrepared,
            master,
            worlds.contributionProjections[index]!,
          ),
        ),
        preparedWithoutAreaScenarios: worlds.withoutAreaScenarios.map((scenario, index) =>
          prepareOptionalRankingScenario(
            scenario,
            canonical,
            canonicalPrepared,
            master,
            worlds.withoutAreaContributionProjections[index] ?? null,
          ),
        ),
        ...worlds,
      };
    },
  );
  const first = plans[0];
  if (!first) throw new TypeError(`ranking_initial_actor_form_missing:${servant.id}`);
  return {
    baseScenario: first.baseScenario,
    baseline: first.baseline,
    rankingScenarios: plans.flatMap(({ rankingScenarios }) => rankingScenarios),
    preparedRankingScenarios: plans.flatMap(
      ({ preparedRankingScenarios }) => preparedRankingScenarios,
    ),
    attackProfiles: plans.flatMap(({ rankingScenarios, attackProfile }) =>
      rankingScenarios.map(() => attackProfile),
    ),
    contributionProjections: plans.flatMap(
      ({ contributionProjections }) => contributionProjections,
    ),
    withoutAreaScenarios: plans.flatMap(({ withoutAreaScenarios }) => withoutAreaScenarios),
    preparedWithoutAreaScenarios: plans.flatMap(
      ({ preparedWithoutAreaScenarios }) => preparedWithoutAreaScenarios,
    ),
    withoutAreaContributionProjections: plans.flatMap(
      ({ withoutAreaContributionProjections }) => withoutAreaContributionProjections,
    ),
    worldCandidateCount: plans.reduce((sum, plan) => sum + plan.worldCandidateCount, 0),
  };
}

export function createRankingScenarioFromPolicy(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingConditions,
  versions: VersionContext,
  requestedAttackProfile?: AttackProfile,
): ResolvedScenario {
  const plan = compileRankingExecutionPlan(servant, master, profile, conditions, versions);
  const executions = executeRankingScenarios(
    plan.preparedRankingScenarios,
    master,
    versions,
    plan.contributionProjections,
  );
  const selected = selectRankingExecutionIndexes(
    executions,
    plan.attackProfiles,
    conditions.npLevel,
  );
  const requestedKey = requestedAttackProfile ? attackProfileKey(requestedAttackProfile) : null;
  const selectedEntry = [...selected].find(
    ([profileKey]) => requestedKey === null || profileKey === requestedKey,
  );
  const index = selectedEntry?.[1];
  if (index === undefined)
    throw new TypeError(`ranking_attack_profile_candidate_missing:${requestedKey ?? 'default'}`);
  return executions[index]!.scenario as ResolvedScenario;
}
