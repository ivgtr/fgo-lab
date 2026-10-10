import type { BattleExecutionState } from './contracts';
import type { OrderedScenarioExecution, PreparedOrderedScenario } from './executionTypes';
import { summarizeExcludedExternalTargetContributions } from './excludedTargetContributions';

function redactRelativeTargetWitnesses<T extends BattleExecutionState>(
  prepared: PreparedOrderedScenario,
  state: T,
): T {
  const { targetContext } = prepared.scenario;
  if (targetContext.class.kind === 'concrete' && targetContext.attribute.kind === 'concrete')
    return state;
  return {
    ...state,
    actorPredicates: {
      ...state.actorPredicates,
      target: new Map(
        [...state.actorPredicates.target].filter(([, value]) => {
          if (value.predicate.kind === 'classIdentity')
            return targetContext.class.kind === 'concrete';
          if (value.predicate.kind === 'attributeIdentity')
            return targetContext.attribute.kind === 'concrete';
          return true;
        }),
      ),
    },
  };
}

export function assembleAmbiguousTargetResult(
  prepared: PreparedOrderedScenario,
  executions: readonly OrderedScenarioExecution[],
): OrderedScenarioExecution {
  const first = executions[0]!;
  return {
    ...first,
    precision: 'inputRequired',
    issues: [
      ...first.issues,
      {
        kind: 'invalidTargetContext',
        detail: 'ambiguousTargetResult',
        sourceKeys:
          prepared.targetResolution.kind === 'candidates'
            ? prepared.scenario.effectDecisions.map(({ decisionKey }) => decisionKey)
            : [],
      },
    ],
  };
}

export function assembleEquivalentTargetResult(
  prepared: PreparedOrderedScenario,
  execution: OrderedScenarioExecution,
): OrderedScenarioExecution {
  const { targetContext } = prepared.scenario;
  const summarized =
    targetContext.class.kind === 'concrete' && targetContext.attribute.kind === 'concrete'
      ? execution
      : summarizeExcludedExternalTargetContributions(execution);
  return {
    ...summarized,
    input: {
      ...summarized.input,
      target: {
        ...summarized.input.target,
        classId: targetContext.class.kind === 'concrete' ? targetContext.class.classId : null,
        attribute:
          targetContext.attribute.kind === 'concrete'
            ? targetContext.attribute.attribute
            : 'unknown',
      },
    },
    state: redactRelativeTargetWitnesses(prepared, summarized.state),
    operations: summarized.operations.map((result) => ({
      ...result,
      state: redactRelativeTargetWitnesses(prepared, result.state),
    })),
  };
}
