import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { ExecutableBattleState, ExecutionIssue, OperationResult } from './contracts';
import { targetResolutionIssues } from './executionIssues';
import type { ReadyCandidateExecution } from './candidatePreparation';
import { attachActivationSources } from './candidateProjection';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
} from './executionTypes';
import { projectAtDamageEvaluation } from './projection';
import { foldDamageInput } from './state';
import { createEffectiveContributionSet } from './effectiveContributions';
import { contributionIsIncluded } from './effectiveContributions';
import type { ContributionApplicationPolicy } from './executionTypes';

function executionIssues(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  candidate: ReadyCandidateExecution,
  state: ExecutableBattleState,
): ExecutionIssue[] {
  return [
    ...targetResolutionIssues(prepared.targetResolution),
    ...resolvedInputs.invalidInputKeys.map<ExecutionIssue>((inputKey) => ({
      kind: 'invalidCanonicalInput',
      inputKey,
      detail: 'unknownInputKey',
    })),
    ...candidate.constraintIssues,
    ...candidate.stochasticOutcomeIssues,
    ...prepared.sourceIssues,
    ...candidate.resolvedCompileProjections
      .filter((projection) => projection.outcome === 'unsupported')
      .map<ExecutionIssue>((projection) => ({
        kind: 'unsupportedOperation',
        operationId: projection.operationId,
        detail: 'effect_semantics_unresolved',
      })),
    ...state.unresolved,
  ];
}

export function assembleCandidateResult({
  prepared,
  resolvedInputs,
  candidate,
  state,
  input,
  results,
  contributionPolicy,
}: {
  prepared: PreparedOrderedScenario;
  resolvedInputs: ResolvedCanonicalInputSet;
  candidate: ReadyCandidateExecution;
  state: ExecutableBattleState;
  input: DamageResolutionInput;
  results: readonly OperationResult[];
  contributionPolicy: ContributionApplicationPolicy;
}): OrderedScenarioExecution {
  const { operations, inputDefinitions } = prepared;
  const issues = executionIssues(prepared, resolvedInputs, candidate, state);
  const projections = attachActivationSources(prepared, [
    ...candidate.resolvedCompileProjections,
    ...results.map((result) => projectAtDamageEvaluation(result, state)),
  ]);
  const relevantInputOperationIds = new Set(
    projections.flatMap((projection) =>
      projection.visibility === 'visible' &&
      operations.some((operation) => {
        if (operation.operationId !== projection.operationId) return false;
        if (!contributionIsIncluded(operation, operation.condition, contributionPolicy, state))
          return false;
        const activation = candidate.activations.get(operation.operationId);
        return (
          activation?.enabled === true ||
          (activation?.enabledBeforeStochasticOutcome === true &&
            activation.stochasticOutcome.status === 'inputRequired')
        );
      })
        ? [projection.operationId]
        : [],
    ),
  );
  const relevantMissingDefinitions = resolvedInputs.missingDefinitions.filter((definition) =>
    operations.some(
      (operation) =>
        relevantInputOperationIds.has(operation.operationId) &&
        operation.inputDefinitions.some((item) => item.key === definition.key),
    ),
  );
  let precision: OrderedScenarioExecution['precision'];
  if (relevantMissingDefinitions.length > 0) precision = 'inputRequired';
  else if (issues.length > 0) precision = 'unsupported';
  else precision = 'exact';
  return {
    input: foldDamageInput(input, state),
    state,
    operations: [...results],
    projections,
    retainedProjections: prepared.retainedProjections,
    precision,
    issues,
    requiredInputs: relevantMissingDefinitions.map((definition) => ({
      ...definition,
      effectOccurrenceIds: operations
        .filter(
          (operation) =>
            relevantInputOperationIds.has(operation.operationId) &&
            operation.inputDefinitions.some((item) => item.key === definition.key),
        )
        .map((operation) => operation.source.effectOccurrenceId)
        .filter((value, index, all) => all.indexOf(value) === index),
    })),
    inputDefinitions: [...inputDefinitions],
    effectiveContributions: createEffectiveContributionSet(results, contributionPolicy),
  };
}
