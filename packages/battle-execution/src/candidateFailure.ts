import type { ExecutionIssue } from './contracts';
import { targetResolutionIssues } from './executionIssues';
import type { InvalidActivationCandidateExecution } from './candidatePreparation';
import { attachActivationSources } from './candidateProjection';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
} from './executionTypes';
import { createRejectedBattleState } from './state';
import { createOperationProjection } from './projection';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';

export function assembleInvalidActivationResult({
  prepared,
  resolvedInputs,
  candidate,
}: {
  prepared: PreparedOrderedScenario;
  resolvedInputs: ResolvedCanonicalInputSet;
  candidate: InvalidActivationCandidateExecution;
}): OrderedScenarioExecution {
  const state = createRejectedBattleState(
    candidate.candidateInput,
    prepared.baseNoblePhantasmVariant,
    prepared.attackerTraits,
    resolvedInputs.values,
    candidate.targetFacts,
    prepared.attackerPredicates.map((predicate) => ({
      sourceKey: 'attacker-master',
      predicate,
      present: true,
    })),
  );
  const conflict = candidate.issues.some((issue) => issue.kind === 'constraintConflict');
  const projections = attachActivationSources(prepared, [
    ...candidate.resolvedCompileProjections.map((projection) =>
      conflict && projection.outcome === 'applied'
        ? {
            ...projection,
            outcome: 'notApplied' as const,
            explanation: { ...projection.explanation, code: 'unresolved' as const },
          }
        : projection,
    ),
    ...(conflict
      ? prepared.operations.map((operation) =>
          createOperationProjection(
            operation,
            'notApplied',
            'unresolved',
            null,
            operation.decisionKey ? candidate.decisions.get(operation.decisionKey) : undefined,
            null,
            false,
            { kind: 'relative', relation: defaultTargetClassRelation(prepared.attackerClass) },
            { kind: 'relative', relation: 'neutral' },
          ),
        )
      : []),
  ]);
  const issues = [
    ...targetResolutionIssues(prepared.targetResolution),
    ...resolvedInputs.invalidInputKeys.map<ExecutionIssue>((inputKey) => ({
      kind: 'invalidCanonicalInput',
      inputKey,
      detail: 'unknownInputKey',
    })),
    ...candidate.issues,
    ...candidate.stochasticOutcomeIssues,
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
    retainedProjections: prepared.retainedProjections,
    precision: 'unsupported',
    issues,
    requiredInputs: [],
    inputDefinitions: [...prepared.inputDefinitions],
    effectiveContributions: {
      contributions: [],
      effectivePresentationGroupIds: new Set(),
    },
  };
}
