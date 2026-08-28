import { compareCandidateResults } from './candidateComparison';
import {
  executeOrderedScenarioCandidate,
  executeOrderedScenarioCandidates,
} from './candidateExecution';
import type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  DamageContributionProjection,
} from './executionTypes';
import { assembleAmbiguousTargetResult, assembleEquivalentTargetResult } from './scenarioResult';

export type {
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  DamageContributionProjection,
} from './executionTypes';
export { compileExecutionPlan as prepareOrderedScenario } from './executionPlan';
export { executeOrderedScenarioCandidates } from './candidateExecution';

export function executeOrderedScenario(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionProjection?: DamageContributionProjection,
): OrderedScenarioExecution {
  const executions = executeOrderedScenarioCandidates(
    prepared,
    resolvedInputs,
    contributionProjection,
  );
  if (executions.length === 0)
    return executeOrderedScenarioCandidate(prepared, resolvedInputs, null, contributionProjection);
  const comparison = compareCandidateResults(executions);
  return comparison.kind === 'equivalent'
    ? assembleEquivalentTargetResult(prepared, comparison.execution)
    : assembleAmbiguousTargetResult(prepared, comparison.executions);
}
