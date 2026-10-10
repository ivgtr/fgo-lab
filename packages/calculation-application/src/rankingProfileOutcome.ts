import { RankingBasisFailure } from './rankingBasis';
import { stableValueKey } from '@fgo-lab/schema';
import type { PolicyUnavailabilityReason } from './rankingContracts';
import { attackProfileKey, type AttackProfile } from './attackProfile';
import type { RankingCandidateCalculation } from './rankingPolicyCandidates';
import type { RankingCandidateSpace } from './rankingCandidateSpace';
import type { CalculationExecution } from './scenario';
import type { RankingPolicyDetail } from './rankingContracts';
import type { RankingProfileResult } from './rankingContracts';
import type { RankingBlockerClass, RankingBlockerDiagnostics } from './rankingContracts';

const MAX_BLOCKER_REPRESENTATIVES_PER_CLASS = 3;

function stableDigest(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of stableValueKey(value)) {
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

type BlockerRecords = Record<
  Exclude<RankingBlockerClass, 'unavailableUnderPolicy'>,
  BlockerRecord[]
> & {
  unavailableUnderPolicy: { candidateKey: string; reason: PolicyUnavailabilityReason }[];
};

export class RankingProfileAccumulator {
  private readonly records: BlockerRecords = {
    unavailableUnderPolicy: [],
    inputRequired: [],
    invalid: [],
    unsupported: [],
  };
  private firstInvalid: Extract<CalculationExecution['result'], { status: 'invalid' }> | undefined;
  private firstUnsupported:
    Extract<CalculationExecution['result'], { status: 'unsupported' }> | undefined;
  private firstInputRequired:
    Extract<CalculationExecution['result'], { status: 'inputRequired' }> | undefined;
  constructor(
    readonly attackProfile: AttackProfile,
    readonly space: RankingCandidateSpace | undefined,
  ) {}
  get blocking(): boolean {
    return (
      this.records.invalid.length > 0 ||
      this.records.unsupported.length > 0 ||
      this.records.inputRequired.length > 0
    );
  }
  observe(candidateKey: string, result: CalculationExecution['result']): void {
    const records = this.records;
    if (result.status === 'invalid') this.firstInvalid ??= result;
    if (result.status === 'unsupported') this.firstUnsupported ??= result;
    if (result.status === 'inputRequired') this.firstInputRequired ??= result;
    if (result.status === 'unavailable') {
      records.unavailableUnderPolicy.push({ candidateKey, reason: result.reason });
    } else if (
      result.status === 'unsupported' &&
      result.missingEvidence.length === 1 &&
      result.missingEvidence[0] === 'preparation:attackNoblePhantasmUnavailable'
    ) {
      records.unavailableUnderPolicy.push({ candidateKey, reason: 'attackProfileNotReachable' });
    } else if (result.status === 'invalid') {
      records.invalid.push({
        candidateKey,
        reason: `${result.issue.kind}:${result.issue.servantId}:${String(result.issue.level)}`,
      });
    } else if (result.status === 'inputRequired') {
      records.inputRequired.push({
        candidateKey,
        reason: result.requiredInputs
          .map(({ key }) => key)
          .sort()
          .join(','),
      });
    } else if (result.status === 'unsupported') {
      records.unsupported.push({
        candidateKey,
        reason: [...result.missingEvidence].sort().join(','),
      });
    }
  }

  result(detail?: RankingPolicyDetail): RankingProfileResult {
    const records = this.records;
    const { space, attackProfile } = this;
    const profileKey = attackProfileKey(attackProfile);
    if (space?.status === 'invalid') {
      records.invalid.push({
        candidateKey: `space:${profileKey}`,
        reason: stableValueKey(space.issue),
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
        reason: stableValueKey(space.issue),
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
    const diagnostics = diagnosticsFor(records);
    if (records.invalid.length > 0) {
      const invalid = this.firstInvalid;
      return {
        status: 'invalid',
        attackProfile,
        issues: invalid?.issues ?? [],
        reason: invalid?.issues[0]?.code ?? 'invalidCalculation',
        diagnostics,
      };
    }
    if (records.unsupported.length > 0) {
      const unsupported = this.firstUnsupported;
      return {
        status: 'unsupported',
        attackProfile,
        issues: unsupported?.issues ?? [],
        reason: 'candidateExecutionUnsupported',
        ...(unsupported?.status === 'unsupported'
          ? { detail: unsupported.missingEvidence.join(',') }
          : {}),
        diagnostics,
      };
    }
    const inputRequired = this.firstInputRequired;
    if (inputRequired?.status === 'inputRequired')
      return {
        status: 'inputRequired',
        attackProfile,
        inputs: inputRequired.requiredInputs,
        issues: inputRequired.issues,
        diagnostics,
      };
    if (detail) return { status: 'calculated', detail };
    if (records.unavailableUnderPolicy.length > 0)
      return {
        status: 'unavailableUnderPolicy',
        attackProfile,
        reason: records.unavailableUnderPolicy.every(
          (record) => record.reason === records.unavailableUnderPolicy[0]!.reason,
        )
          ? records.unavailableUnderPolicy[0]!.reason
          : 'noSatisfiableCandidate',
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
}

export function unresolvedProfileResult(
  candidateSet: RankingCandidateCalculation,
  attackProfile: AttackProfile,
): RankingProfileResult {
  const result = candidateSet.profileResults.get(attackProfileKey(attackProfile));
  if (!result) throw new TypeError('ranking_profile_outcome_missing');
  return result;
}

/** Application exceptions keep their typed basis failure and exact diagnostic payload. */
export function rankingFailureResult(
  error: unknown,
  attackProfile: AttackProfile | null,
): Extract<RankingProfileResult, { status: 'invalid' }> {
  const basisFailure = error instanceof RankingBasisFailure;
  return {
    status: 'invalid',
    attackProfile,
    issues: [],
    reason: basisFailure ? error.reason : 'unexpectedRankingFailure',
    detail: basisFailure ? error.detail : error instanceof Error ? error.message : String(error),
  };
}
