import {
  assembleUnresolvedAuditObservation,
  assembleComparedAuditObservation,
} from './executionAuditObservation';
import { compareCandidateResults } from './candidateComparison';
import type { CandidateExecutionWithAudit } from './candidateStateAudit';
import {
  executeOrderedScenarioCandidate,
  executeOrderedScenarioCandidates,
  executeOrderedScenarioCandidateWithAudit,
  executeOrderedScenarioCandidatesWithAudit,
  executeDiagnosticScenarioCandidatesWithAudit,
} from './candidateExecution';
import type {
  OrderedScenarioExecution,
  OrderedScenarioExecutionWithAuditObservation,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  ContributionApplicationPolicy,
} from './executionTypes';
import { assembleAmbiguousTargetResult, assembleEquivalentTargetResult } from './scenarioResult';

export type {
  OrderedScenarioExecution,
  OrderedExecutionAuditEvent,
  OrderedCandidateStateAudit,
  OrderedExecutionGroupAuditEvent,
  OrderedInputQuantityReadAuditEvent,
  OrderedMutationAuditEvent,
  OrderedExecutionAuditObservation,
  OrderedScenarioExecutionWithAuditObservation,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  ContributionApplicationPolicy,
  ContributionPolicyDecision,
  EffectiveContribution,
  EffectiveContributionSet,
} from './executionTypes';
export { compileExecutionPlan as prepareOrderedScenario } from './executionPlan';
export { compileDiagnosticExecutionPlan as prepareDiagnosticOrderedScenario } from './executionPlan';
export { executeOrderedScenarioCandidates } from './candidateExecution';

export function executeOrderedScenario(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): OrderedScenarioExecution {
  const executions = executeOrderedScenarioCandidates(prepared, resolvedInputs, contributionPolicy);
  if (executions.length === 0)
    return executeOrderedScenarioCandidate(prepared, resolvedInputs, null, contributionPolicy);
  const comparison = compareCandidateResults(executions);
  return comparison.kind === 'equivalent'
    ? assembleEquivalentTargetResult(prepared, comparison.execution)
    : assembleAmbiguousTargetResult(prepared, comparison.executions);
}

export function executeOrderedScenarioWithAuditObservation(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): OrderedScenarioExecutionWithAuditObservation {
  const auditedExecutions = executeOrderedScenarioCandidatesWithAudit(
    prepared,
    resolvedInputs,
    contributionPolicy,
  );
  return assembleAuditedScenario(prepared, resolvedInputs, contributionPolicy, auditedExecutions);
}

export function executeDiagnosticOrderedScenarioWithAuditObservation(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): OrderedScenarioExecutionWithAuditObservation {
  const executions = executeDiagnosticScenarioCandidatesWithAudit(
    prepared,
    resolvedInputs,
    contributionPolicy,
  );
  return assembleAuditedScenario(prepared, resolvedInputs, contributionPolicy, executions);
}

function assembleAuditedScenario(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy,
  auditedExecutions: readonly CandidateExecutionWithAudit[],
): OrderedScenarioExecutionWithAuditObservation {
  if (auditedExecutions.length === 0) {
    if (prepared.targetResolution.kind === 'candidates')
      throw new TypeError('target_candidate_execution_missing');
    return assembleUnresolvedAuditObservation(
      prepared,
      executeOrderedScenarioCandidateWithAudit(prepared, resolvedInputs, null, contributionPolicy),
    );
  }
  const executions = auditedExecutions.map(({ execution }) => execution);
  return assembleComparedAuditObservation(
    prepared,
    auditedExecutions,
    executions,
    compareCandidateResults(executions),
  );
}
