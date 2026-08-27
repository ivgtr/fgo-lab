import type { DamageResolutionInput } from '@fgo-lab/schema';
import { conditionRequiresTrait } from './activation';
import type { BattleState, ExecutionIssue, OperationResult, OperationSource } from './contracts';
import { targetResolutionIssues } from './executionIssues';
import type { PreparedCandidateExecution } from './candidatePreparation';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
} from './executionTypes';
import { projectAtDamageEvaluation } from './projection';
import { foldDamageInput } from './state';

function sourcesShareActor(left: OperationSource, right: OperationSource): boolean {
  const actorOwnedOrigins = new Set<OperationSource['origin']>(['attacker', 'np', 'passive']);
  return (
    left.sourceId === right.sourceId &&
    ((actorOwnedOrigins.has(left.origin) && actorOwnedOrigins.has(right.origin)) ||
      (left.origin === right.origin && left.sourceInstanceId === right.sourceInstanceId))
  );
}

function activationSourcesByDecision(
  prepared: PreparedOrderedScenario,
): ReadonlyMap<string, readonly OperationSource[]> {
  const { operations } = prepared;
  const sourcesByDecision = new Map<string, OperationSource[]>();
  const addSource = (decisionKey: string, source: OperationSource) => {
    const sources = sourcesByDecision.get(decisionKey) ?? [];
    if (
      !sources.some(
        (candidate) =>
          candidate.origin === source.origin &&
          candidate.sourceInstanceId === source.sourceInstanceId &&
          candidate.skillId === source.skillId,
      )
    )
      sources.push(source);
    sourcesByDecision.set(decisionKey, sources);
  };
  for (const operation of operations) {
    if (operation.activation.kind !== 'linkedDecisions') continue;
    for (const link of operation.activation.links) addSource(link.decisionKey, operation.source);
  }
  for (const decisionOperation of operations) {
    if (decisionOperation.decisionKey === null) continue;
    for (const mutation of operations) {
      if (
        mutation.gameActivation !== 'skillUse' ||
        (mutation.kind !== 'addTrait' &&
          mutation.kind !== 'removeTrait' &&
          mutation.kind !== 'suppressInitialTrait') ||
        !sourcesShareActor(mutation.source, decisionOperation.source) ||
        !conditionRequiresTrait(
          decisionOperation.condition,
          mutation.scope,
          mutation.trait,
          mutation.kind === 'addTrait',
        )
      )
        continue;
      addSource(decisionOperation.decisionKey, mutation.source);
    }
  }
  return sourcesByDecision;
}

function executionIssues(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  candidate: PreparedCandidateExecution,
  state: BattleState,
): ExecutionIssue[] {
  return [
    ...targetResolutionIssues(prepared.targetResolution),
    ...resolvedInputs.invalidInputKeys.map<ExecutionIssue>((inputKey) => ({
      kind: 'invalidCanonicalInput',
      inputKey,
      detail: 'unknownInputKey',
    })),
    ...candidate.constraintIssues,
    ...candidate.procSelectionIssues,
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
}: {
  prepared: PreparedOrderedScenario;
  resolvedInputs: ResolvedCanonicalInputSet;
  candidate: PreparedCandidateExecution;
  state: BattleState;
  input: DamageResolutionInput;
  results: readonly OperationResult[];
}): OrderedScenarioExecution {
  const { operations, inputDefinitions } = prepared;
  const issues = executionIssues(prepared, resolvedInputs, candidate, state);
  const activationSources = activationSourcesByDecision(prepared);
  const projections = [
    ...candidate.resolvedCompileProjections,
    ...results.map((result) => projectAtDamageEvaluation(result, state)),
  ].map((projection) => ({
    ...projection,
    activationSources:
      projection.decision.state === 'none'
        ? []
        : (activationSources.get(projection.decision.decisionKey) ?? []),
  }));
  const relevantInputOperationIds = new Set(
    projections.flatMap((projection) =>
      projection.visibility === 'visible' &&
      operations.some(
        (operation) =>
          operation.operationId === projection.operationId &&
          candidate.activations.get(operation.operationId)?.enabled,
      )
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
  };
}
