import { PreparationExecutionSession } from '@fgo-lab/battle-execution';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { attackProfileKey } from './attackProfile';
import { compareRankingCandidates } from './rankingCandidateSelection';
import { rankingExecutionSelection } from './rankingExecution';
import { RankingProfileAccumulator } from './rankingProfileOutcome';
import type { RankingExecutionPlan, RankingCandidateDescriptor } from './rankingPolicyScenario';
import type { DamageResolutionValue } from './damageResolution';
import { PreparedDamageMatrixCache } from './preparedDamageInputCache';
import {
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  type CalculationExecution,
  type PreparedCalculationScenario,
} from './scenario';

export interface EvaluatedRankingCandidate {
  descriptor: RankingCandidateDescriptor;
  prepared: PreparedCalculationScenario;
  execution: CalculationExecution;
  selection: NonNullable<ReturnType<typeof rankingExecutionSelection>>;
}

export interface RankingCandidateEvent {
  index: number;
  descriptor: RankingCandidateDescriptor;
  prepared: PreparedCalculationScenario;
  execution: CalculationExecution;
}
export type RankingCandidateObserver = (event: RankingCandidateEvent) => void;

/** Every candidate executes and contributes its failure. Only the collector's retention differs. */
export function evaluateRankingCandidateBatch(
  plan: RankingExecutionPlan,
  master: MasterDataSnapshot,
  versions: VersionContext,
  damageCache = new PreparedDamageMatrixCache<DamageResolutionValue>(),
  captureExecutionObservation = false,
  observeCandidate?: RankingCandidateObserver,
) {
  const session = new PreparationExecutionSession(master);
  const accumulators = new Map(
    plan.candidateSpaces.map((space) => [
      attackProfileKey(space.attackProfile),
      new RankingProfileAccumulator(space.attackProfile, space),
    ]),
  );
  const selected = new Map<string, EvaluatedRankingCandidate>();
  let index = 0;
  const candidateKeys = new Set<string>();
  for (const descriptor of plan.candidateDescriptors) {
    const prepared = prepareCalculationScenarioWithPolicy(
      descriptor.scenario,
      master,
      descriptor.contributionPolicy,
      { initialNpGauge: descriptor.evidence.startNpGauge },
      captureExecutionObservation,
      damageCache,
      session,
    );
    const execution = evaluatePreparedCalculationScenario(prepared, versions);
    const profileKey = attackProfileKey(descriptor.attackProfile);
    const accumulator = accumulators.get(profileKey);
    if (!accumulator) throw new TypeError('ranking_candidate_profile_missing');
    accumulator.observe(descriptor.key, execution.result);
    candidateKeys.add(`${profileKey}:${descriptor.key}`);
    observeCandidate?.({ index, descriptor, prepared, execution });
    index++;
    const selection = rankingExecutionSelection(
      execution,
      descriptor.attackProfile,
      descriptor.expectedTerminalFormId,
      plan.basis.npLevel,
      descriptor.key,
      descriptor.baselineInputDeviation,
    );
    if (!selection) continue;
    const previous = selected.get(profileKey);
    if (!previous || compareRankingCandidates(selection, previous.selection) < 0)
      selected.set(profileKey, { descriptor, prepared, execution, selection });
  }
  return {
    selected,
    accumulators,
    candidateInventory: { generated: index, deduplicated: candidateKeys.size },
    preparationInventory: { ...session.inventory },
  };
}
