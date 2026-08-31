import { noblePhantasmVariantKey } from '@fgo-lab/master-data';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import type { CalculationExecution } from './scenario';

export interface LegacyRankingSelectionCandidate {
  index: number;
  attackProfile: AttackProfile;
  average: number | null;
  externalFactCount: number;
  activationFactCount: number;
  transitionCount: number;
  noblePhantasmVariantKey: string;
}

export function selectLegacyRankingCandidateIndexes(
  candidates: readonly LegacyRankingSelectionCandidate[],
): ReadonlyMap<string, number> {
  const selected = new Map<string, number>();
  const profileKeys = new Set(
    candidates.map(({ attackProfile }) => attackProfileKey(attackProfile)),
  );
  for (const profileKey of profileKeys) {
    const winner = candidates
      .filter(
        (candidate): candidate is LegacyRankingSelectionCandidate & { average: number } =>
          attackProfileKey(candidate.attackProfile) === profileKey && candidate.average !== null,
      )
      .sort(
        (left, right) =>
          right.average - left.average ||
          left.externalFactCount - right.externalFactCount ||
          left.activationFactCount - right.activationFactCount ||
          left.transitionCount - right.transitionCount ||
          left.noblePhantasmVariantKey.localeCompare(right.noblePhantasmVariantKey),
      )[0];
    if (winner) selected.set(profileKey, winner.index);
  }
  if (selected.size === 0) throw new TypeError('ranking_candidate_execution_missing');
  return selected;
}

export function selectLegacyRankingExecutionIndexes(
  executions: readonly CalculationExecution[],
  attackProfiles: readonly AttackProfile[],
  npLevel: 1 | 2 | 3 | 4 | 5,
): ReadonlyMap<string, number> {
  if (executions.length !== attackProfiles.length)
    throw new TypeError('ranking_attack_profile_alignment_mismatch');
  return selectLegacyRankingCandidateIndexes(
    executions.map((execution, index) => ({
      attackProfile: attackProfiles[index]!,
      index,
      average:
        execution.result.status === 'calculated' && execution.scenario.mode === 'resolved'
          ? (execution.result.rows[npLevel - 1]?.average ?? null)
          : null,
      externalFactCount:
        execution.scenario.mode === 'resolved'
          ? execution.scenario.worldFactAssertions.filter(
              ({ decisionKey, fact }) =>
                decisionKey.startsWith('ranking:') && fact.kind === 'trait' && fact.present,
            ).length
          : 0,
      activationFactCount: execution.appliedPreparationActions.reduce(
        (count, action) => count + action.activationFacts.length,
        0,
      ),
      transitionCount: execution.appliedPreparationActions.filter(
        ({ transition }) => transition !== null,
      ).length,
      noblePhantasmVariantKey:
        execution.noblePhantasmVariant?.kind === 'attack'
          ? noblePhantasmVariantKey(execution.noblePhantasmVariant.ref)
          : '',
    })),
  );
}
