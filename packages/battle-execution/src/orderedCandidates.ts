import type {
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  ContributionApplicationPolicy,
  OrderedScenarioExecution,
} from './executionTypes';
import type { TargetCandidate } from './targetContext';
import {
  createMutableCandidateStateAudit,
  type CandidateExecutionWithAudit,
} from './candidateStateAudit';
import { executeOrderedCandidate } from './candidateExecution';

function requireNormalPreparation(prepared: PreparedOrderedScenario): void {
  if (prepared.preparationExecution.kind === 'diagnostic')
    throw new TypeError('diagnostic_preparation_is_not_normal_execution');
}

export function executeOrderedScenarioCandidates(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): readonly OrderedScenarioExecution[] {
  requireNormalPreparation(prepared);
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidate(prepared, resolvedInputs, candidate, contributionPolicy),
      )
    : [];
}

export function executeOrderedScenarioCandidatesWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): readonly CandidateExecutionWithAudit[] {
  requireNormalPreparation(prepared);
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidateWithAudit(
          prepared,
          resolvedInputs,
          candidate,
          contributionPolicy,
        ),
      )
    : [];
}

export function executeOrderedScenarioCandidateWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): CandidateExecutionWithAudit {
  requireNormalPreparation(prepared);
  const mutableAudit = createMutableCandidateStateAudit();
  const execution = executeOrderedCandidate(
    prepared,
    resolvedInputs,
    targetCandidate,
    contributionPolicy,
    mutableAudit,
  );
  return { execution, candidateState: mutableAudit };
}

export function executeOrderedScenarioCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): OrderedScenarioExecution {
  requireNormalPreparation(prepared);
  return executeOrderedCandidate(prepared, resolvedInputs, targetCandidate, contributionPolicy);
}

export function executeDiagnosticScenarioCandidatesWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy,
): readonly CandidateExecutionWithAudit[] {
  if (prepared.preparationExecution.kind !== 'diagnostic')
    throw new TypeError('diagnostic_preparation_required');
  const targets =
    prepared.targetResolution.kind === 'candidates' ? prepared.targetResolution.candidates : [null];
  return targets.map((target) => {
    const candidateState = createMutableCandidateStateAudit();
    const execution = executeOrderedCandidate(
      prepared,
      resolvedInputs,
      target,
      contributionPolicy,
      candidateState,
    );
    return { execution, candidateState };
  });
}
