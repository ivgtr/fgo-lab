import { compareCandidateResults } from './candidateComparison';
import {
  executeOrderedScenarioCandidate,
  executeOrderedScenarioCandidates,
  executeOrderedScenarioCandidateWithAudit,
  executeOrderedScenarioCandidatesWithAudit,
} from './candidateExecution';
import type {
  OrderedExecutionAuditEvent,
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
export { executeOrderedScenarioCandidates } from './candidateExecution';

function auditOperationEvents(
  execution: OrderedScenarioExecution,
): readonly OrderedExecutionAuditEvent[] {
  return execution.operations.map(({ operation, outcome, condition, projection }, sequence) => ({
    sequence,
    operationId: operation.operationId,
    projectionKey: projection.projectionKey,
    contributionId: projection.contributionId,
    operationKind: operation.kind,
    operationOutcome: outcome,
    projectionOutcome: projection.outcome,
    condition,
    projectionValuePermille: projection.valuePermille,
  }));
}

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
  const executions = auditedExecutions.map(({ execution }) => execution);
  if (auditedExecutions.length === 0) {
    if (prepared.targetResolution.kind === 'candidates')
      throw new TypeError('target_candidate_execution_missing');
    const { execution, candidateState } = executeOrderedScenarioCandidateWithAudit(
      prepared,
      resolvedInputs,
      null,
      contributionPolicy,
    );
    return {
      execution,
      observation: {
        selection: 'unresolved',
        targetResolution: prepared.targetResolution,
        operationEvents: auditOperationEvents(execution),
        candidateState,
      },
    };
  }
  if (prepared.targetResolution.kind !== 'candidates')
    throw new TypeError('target_candidate_resolution_missing');
  const targetCandidates = prepared.targetResolution.candidates;
  const comparison = compareCandidateResults(executions);
  if (comparison.kind === 'equivalent') {
    const candidateIndex = executions.indexOf(comparison.execution);
    const targetCandidate = targetCandidates[candidateIndex];
    if (candidateIndex < 0 || !targetCandidate)
      throw new TypeError('selected_target_candidate_identity_missing');
    return {
      execution: assembleEquivalentTargetResult(prepared, comparison.execution),
      observation: {
        selection: 'selected',
        candidateIndex,
        targetCandidate,
        operationEvents: auditOperationEvents(comparison.execution),
        candidateState: auditedExecutions[candidateIndex]!.candidateState,
      },
    };
  }
  const candidates = comparison.executions.map((candidateExecution) => {
    const candidateIndex = executions.indexOf(candidateExecution);
    const targetCandidate = targetCandidates[candidateIndex];
    if (candidateIndex < 0 || !targetCandidate)
      throw new TypeError('ambiguous_target_candidate_identity_missing');
    return {
      candidateIndex,
      targetCandidate,
      operationEvents: auditOperationEvents(candidateExecution),
      candidateState: auditedExecutions[candidateIndex]!.candidateState,
    };
  });
  return {
    execution: assembleAmbiguousTargetResult(prepared, comparison.executions),
    observation: { selection: 'ambiguous', candidates },
  };
}
