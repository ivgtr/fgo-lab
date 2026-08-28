import type { ExecutionIssue } from './contracts';
import { targetResolutionIssues } from './executionIssues';
import type { InvalidActivationCandidateExecution } from './candidatePreparation';
import { attachActivationSources } from './candidateProjection';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
} from './executionTypes';
import { createInitialBattleState } from './state';

export function assembleInvalidActivationResult({
  prepared,
  resolvedInputs,
  candidate,
}: {
  prepared: PreparedOrderedScenario;
  resolvedInputs: ResolvedCanonicalInputSet;
  candidate: InvalidActivationCandidateExecution;
}): OrderedScenarioExecution {
  const state = createInitialBattleState(
    candidate.candidateInput,
    prepared.attackerTraits,
    resolvedInputs.values,
    candidate.targetFacts,
    prepared.attackerPredicates.map((predicate) => ({
      sourceKey: 'attacker-master',
      predicate,
      present: true,
    })),
    null,
  );
  const projections = attachActivationSources(prepared, candidate.resolvedCompileProjections);
  const issues = [
    ...targetResolutionIssues(prepared.targetResolution),
    ...resolvedInputs.invalidInputKeys.map<ExecutionIssue>((inputKey) => ({
      kind: 'invalidCanonicalInput',
      inputKey,
      detail: 'unknownInputKey',
    })),
    ...candidate.issues,
    ...candidate.procSelectionIssues,
    ...prepared.sourceIssues,
    ...projections
      .filter((projection) => projection.outcome === 'unsupported')
      .map<ExecutionIssue>((projection) => ({
        kind: 'unsupportedOperation',
        operationId: projection.operationId,
        detail: 'effect_semantics_unresolved',
      })),
  ];
  return {
    input: candidate.candidateInput,
    state,
    operations: [],
    projections,
    precision: 'unsupported',
    issues,
    requiredInputs: [],
    inputDefinitions: [...prepared.inputDefinitions],
  };
}
