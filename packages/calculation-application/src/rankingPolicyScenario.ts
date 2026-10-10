import { compileRankingSelection, resolveRankingBasis } from './rankingBasis';
import type { MasterDataSnapshot, ServantMaster } from '@fgo-lab/master-data';
import type { ResolvedRankingBasis } from '@fgo-lab/schema';
import { createStaticAttackProfiles } from './attackProfile';
import {
  compileRankingCandidateSpaces,
  iterateRankingCandidateSpace,
  type RankingCandidateSpace,
  type RankingCandidate,
} from './rankingCandidateSpace';
import type { RankingPolicyConditions, RankingProfileInput } from './rankingContracts';

export interface RankingCandidateDescriptor extends RankingCandidate {
  baselineInputDeviation: number;
}
export interface RankingExecutionPlan {
  basis: ResolvedRankingBasis;
  candidateDescriptors: Iterable<RankingCandidateDescriptor>;
  candidateSpaces: readonly RankingCandidateSpace[];
  worldCandidateCount: number;
  candidateUpperBound: number;
}

/** Candidate generation owns descriptors; execution owns all preparation and receipts. */
export function compileRankingExecutionPlan(
  servant: ServantMaster,
  master: MasterDataSnapshot,
  profile: RankingProfileInput,
  conditions: RankingPolicyConditions,
): RankingExecutionPlan {
  const candidateConditions = structuredClone(conditions);
  const selection = compileRankingSelection(candidateConditions);
  if (selection.status === 'invalid') throw new TypeError(selection.reason);
  const basis = resolveRankingBasis(servant, profile, selection.selection);
  const candidateSpaces = compileRankingCandidateSpaces(
    servant,
    master,
    basis,
    candidateConditions,
    createStaticAttackProfiles(servant),
  );
  const baselineGauge = master.npResourceSemantics.noblePhantasmUse.requirement;
  const candidateDescriptors = {
    *[Symbol.iterator](): Generator<RankingCandidateDescriptor> {
      for (const space of candidateSpaces) {
        if (space.status !== 'ready') continue;
        for (const candidate of iterateRankingCandidateSpace({
          conditions: candidateConditions,
          space,
        }))
          yield {
            ...candidate,
            baselineInputDeviation:
              candidate.evidence.canonicalInputBaselineDeviation +
              Math.abs(candidate.evidence.startNpGauge - baselineGauge) +
              candidate.scenario.worldFactAssertions.filter(
                ({ decisionKey, fact }) =>
                  decisionKey.startsWith('ranking:') && fact.kind === 'trait' && fact.present,
              ).length,
          };
      }
    },
  };
  return {
    basis,
    candidateDescriptors,
    candidateSpaces,
    worldCandidateCount: candidateSpaces.reduce(
      (count, space) => count + (space.status === 'ready' ? space.upperBound : 0),
      0,
    ),
    candidateUpperBound: candidateSpaces.reduce(
      (count, space) => count + (space.status === 'ready' ? space.upperBound : 0),
      0,
    ),
  };
}
