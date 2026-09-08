import { attackProfileKey, type AttackProfile } from './attackProfile';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';
import type { RankingProfileResult } from './rankingContracts';
import type { RankingBlockerClass, RankingBlockerDiagnostics } from './rankingContracts';

const MAX_BLOCKER_REPRESENTATIVES_PER_CLASS = 3;

function stableString(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableString(item)}`)
    .join(',')}}`;
}

function stableDigest(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of stableString(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

type BlockerRecord = { candidateKey: string; reason: string };

function diagnosticsFor(
  records: Record<RankingBlockerClass, BlockerRecord[]>,
): RankingBlockerDiagnostics {
  const diagnostic = (kind: RankingBlockerClass) => {
    const sorted = [...records[kind]].sort((left, right) =>
      `${left.candidateKey}:${left.reason}`.localeCompare(`${right.candidateKey}:${right.reason}`),
    );
    return {
      count: sorted.length,
      digest: stableDigest(sorted),
      representatives: sorted.slice(0, MAX_BLOCKER_REPRESENTATIVES_PER_CLASS),
    };
  };
  return {
    classes: {
      invalid: diagnostic('invalid'),
      unsupported: diagnostic('unsupported'),
      inputRequired: diagnostic('inputRequired'),
      unavailableUnderPolicy: diagnostic('unavailableUnderPolicy'),
    },
  };
}

function emptyRecords(): Record<RankingBlockerClass, BlockerRecord[]> {
  return {
    unavailableUnderPolicy: [],
    inputRequired: [],
    invalid: [],
    unsupported: [],
  };
}

export function unresolvedProfileResult(
  candidateSet: RankingCandidateCalculation,
  attackProfile: AttackProfile,
): RankingProfileResult {
  const profileKey = attackProfileKey(attackProfile);
  const space = candidateSet.plan.candidateSpaces.find(
    (candidate) => attackProfileKey(candidate.attackProfile) === profileKey,
  );
  const records = emptyRecords();
  if (space?.status === 'invalid') {
    records.invalid.push({
      candidateKey: `space:${profileKey}`,
      reason: stableString(space.issue),
    });
    return {
      status: 'invalid',
      attackProfile,
      issues: [],
      reason: space.issue.kind,
      candidateSpaceIssue: space.issue,
      diagnostics: diagnosticsFor(records),
    };
  }
  if (space?.status === 'unsupported') {
    records.unsupported.push({
      candidateKey: `space:${profileKey}`,
      reason: stableString(space.issue),
    });
    return {
      status: 'unsupported',
      attackProfile,
      issues: [],
      reason: space.issue.kind,
      detail:
        space.issue.kind === 'unsupportedFiniteDomain'
          ? `${space.issue.upperBound}>${space.issue.supportedMaximum}`
          : space.issue.kind === 'unsupportedActionAdmission'
            ? space.issue.attackProfileKey
            : space.issue.projectionKeys.join(','),
      diagnostics: diagnosticsFor(records),
    };
  }
  if (!space || space.programs.length === 0) {
    records.unavailableUnderPolicy.push({
      candidateKey: `space:${profileKey}`,
      reason: 'attackProfileNotReachable',
    });
    return {
      status: 'unavailableUnderPolicy',
      attackProfile,
      reason: 'attackProfileNotReachable',
      diagnostics: diagnosticsFor(records),
    };
  }
  const matchingIndexes = candidateSet.plan.attackProfiles.flatMap((candidate, index) =>
    attackProfileKey(candidate) === profileKey ? [index] : [],
  );
  const matchingExecutions = matchingIndexes.map((index) => ({
    index,
    execution: candidateSet.executions[index]!,
  }));
  for (const { index, execution } of matchingExecutions) {
    const candidateKey = candidateSet.plan.candidateKeys[index] ?? `candidate:${String(index)}`;
    const rejection =
      candidateSet.plan.preparedRankingScenarios[index]?.resolved.preparationRejection?.code;
    if (rejection === 'insufficientNpGauge' || rejection === 'resourceRequirementExceedsCapacity') {
      records.unavailableUnderPolicy.push({
        candidateKey,
        reason:
          rejection === 'resourceRequirementExceedsCapacity'
            ? 'npCapacityExceeded'
            : 'insufficientNpGauge',
      });
    } else if (execution.result.status === 'invalid') {
      records.invalid.push({
        candidateKey,
        reason: `${execution.result.issue.kind}:${execution.result.issue.servantId}:${String(execution.result.issue.level)}`,
      });
    } else if (execution.result.status === 'inputRequired') {
      records.inputRequired.push({
        candidateKey,
        reason: execution.result.requiredInputs
          .map(({ key }) => key)
          .sort()
          .join(','),
      });
    } else if (execution.result.status === 'unsupported') {
      records.unsupported.push({
        candidateKey,
        reason: [...execution.result.missingEvidence].sort().join(','),
      });
    }
  }
  const diagnostics = diagnosticsFor(records);
  if (records.invalid.length > 0) {
    const invalid = matchingExecutions.find(
      ({ execution }) => execution.result.status === 'invalid',
    )?.execution.result;
    return {
      status: 'invalid',
      attackProfile,
      issues: invalid?.issues ?? [],
      reason: invalid?.issues[0]?.code ?? 'invalidCalculation',
      diagnostics,
    };
  }
  if (records.unsupported.length > 0) {
    const unsupported = matchingExecutions.find(
      ({ index, execution }) =>
        execution.result.status === 'unsupported' &&
        !['insufficientNpGauge', 'resourceRequirementExceedsCapacity'].includes(
          candidateSet.plan.preparedRankingScenarios[index]?.resolved.preparationRejection?.code ??
            '',
        ),
    )?.execution;
    return {
      status: 'unsupported',
      attackProfile,
      issues: unsupported?.result.issues ?? [],
      reason: 'candidateExecutionUnsupported',
      ...(unsupported?.result.status === 'unsupported'
        ? { detail: unsupported.result.missingEvidence.join(',') }
        : {}),
      diagnostics,
    };
  }
  const inputRequired = matchingExecutions.find(
    ({ execution }) => execution.result.status === 'inputRequired',
  )?.execution;
  if (inputRequired?.result.status === 'inputRequired')
    return {
      status: 'inputRequired',
      attackProfile,
      inputs: inputRequired.result.requiredInputs,
      issues: inputRequired.result.issues,
      diagnostics,
    };
  const detail = candidateSet.details.get(profileKey);
  if (detail) return { status: 'calculated', detail };
  if (records.unavailableUnderPolicy.length > 0)
    return {
      status: 'unavailableUnderPolicy',
      attackProfile,
      reason: records.unavailableUnderPolicy.every(
        (record) => record.reason === 'npCapacityExceeded',
      )
        ? 'npCapacityExceeded'
        : 'insufficientNpGauge',
      diagnostics,
    };
  records.unavailableUnderPolicy.push({
    candidateKey: `profile:${profileKey}`,
    reason: 'noSatisfiableCandidate',
  });
  return {
    status: 'unavailableUnderPolicy',
    attackProfile,
    reason: 'noSatisfiableCandidate',
    diagnostics: diagnosticsFor(records),
  };
}
