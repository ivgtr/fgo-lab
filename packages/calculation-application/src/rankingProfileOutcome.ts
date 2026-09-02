import { attackProfileKey, type AttackProfile } from './attackProfile';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';
import type { RankingProfileResult } from './rankingContracts';

export function unresolvedProfileResult(
  candidateSet: RankingCandidateCalculation,
  attackProfile: AttackProfile,
): Exclude<RankingProfileResult, { status: 'calculated' }> {
  const profileKey = attackProfileKey(attackProfile);
  const space = candidateSet.plan.candidateSpaces.find(
    (candidate) => attackProfileKey(candidate.attackProfile) === profileKey,
  );
  if (space?.status === 'invalid')
    return {
      status: 'invalid',
      attackProfile,
      issues: [],
      reason: space.issue.kind,
      candidateSpaceIssue: space.issue,
    };
  if (space?.status === 'unsupported')
    return {
      status: 'unsupported',
      attackProfile,
      issues: [],
      reason: space.issue.kind,
      detail:
        space.issue.kind === 'unsupportedFiniteDomain'
          ? `${space.issue.upperBound}>${space.issue.supportedMaximum}`
          : space.issue.attackProfileKey,
    };
  if (!space || space.programs.length === 0)
    return { status: 'unavailableUnderPolicy', attackProfile, reason: 'attackProfileNotReachable' };
  const matchingIndexes = candidateSet.plan.attackProfiles.flatMap((candidate, index) =>
    attackProfileKey(candidate) === profileKey ? [index] : [],
  );
  const matchingExecutions = matchingIndexes.map((index) => ({
    index,
    execution: candidateSet.executions[index]!,
  }));
  const inputRequired = matchingExecutions.find(
    ({ execution }) => execution.result.status === 'inputRequired',
  )?.execution;
  if (inputRequired?.result.status === 'inputRequired')
    return {
      status: 'inputRequired',
      attackProfile,
      inputs: inputRequired.result.requiredInputs,
      issues: inputRequired.result.issues,
    };
  const unsupported = matchingExecutions.find(
    ({ index, execution }) =>
      execution.result.status === 'unsupported' &&
      candidateSet.plan.preparedRankingScenarios[index]?.resolved.preparationRejection?.code !==
        'insufficientNpGauge',
  )?.execution;
  if (unsupported?.result.status === 'unsupported')
    return {
      status: 'unsupported',
      attackProfile,
      issues: unsupported.result.issues,
      reason: 'candidateExecutionUnsupported',
      detail: unsupported.result.missingEvidence.join(','),
    };
  const insufficientGauge = matchingIndexes.some(
    (index) =>
      candidateSet.plan.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ===
      'insufficientNpGauge',
  );
  if (insufficientGauge)
    return { status: 'unavailableUnderPolicy', attackProfile, reason: 'insufficientNpGauge' };
  return { status: 'unavailableUnderPolicy', attackProfile, reason: 'noSatisfiableCandidate' };
}
