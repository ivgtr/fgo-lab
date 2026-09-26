import type { CandidateComparison } from './candidateComparison';
import type { CandidateExecutionWithAudit } from './candidateStateAudit';
import type {
  OrderedExecutionAuditEvent,
  OrderedScenarioExecution,
  OrderedScenarioExecutionWithAuditObservation,
  PreparedOrderedScenario,
} from './executionTypes';
import { assembleAmbiguousTargetResult, assembleEquivalentTargetResult } from './scenarioResult';

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

export function assembleUnresolvedAuditObservation(
  prepared: PreparedOrderedScenario,
  { execution, candidateState }: CandidateExecutionWithAudit,
): OrderedScenarioExecutionWithAuditObservation {
  if (prepared.targetResolution.kind === 'candidates')
    throw new TypeError('target_candidate_execution_missing');
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

export function assembleComparedAuditObservation(
  prepared: PreparedOrderedScenario,
  auditedExecutions: readonly CandidateExecutionWithAudit[],
  executions: readonly OrderedScenarioExecution[],
  comparison: CandidateComparison,
): OrderedScenarioExecutionWithAuditObservation {
  if (prepared.targetResolution.kind !== 'candidates')
    throw new TypeError('target_candidate_resolution_missing');
  const targetCandidates = prepared.targetResolution.candidates;
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
