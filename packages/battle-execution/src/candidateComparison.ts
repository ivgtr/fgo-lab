import { stableValueKey, type DamageResolutionInput } from '@fgo-lab/schema';
import type { OrderedScenarioExecution } from './executionTypes';

import { summarizeExcludedExternalTargetContributions } from './excludedTargetContributions';

export function damageFingerprint(input: DamageResolutionInput): string {
  return stableValueKey({
    ...input,
    target: {
      ...input.target,
      classId: null,
      attribute: 'unknown',
    },
  });
}

export function presentationFingerprint(execution: OrderedScenarioExecution): string {
  const summary = summarizeExcludedExternalTargetContributions(execution);
  return stableValueKey({
    precision: summary.precision,
    projections: summary.projections
      .filter((projection) => projection.visibility === 'visible')
      .map((projection) => ({
        key: projection.projectionKey,
        outcome: projection.outcome,
        explanation: projection.explanation.code,
        decision: projection.decision,
      })),
    issues: summary.issues,
  });
}

export type CandidateComparison =
  | { kind: 'equivalent'; execution: OrderedScenarioExecution }
  | { kind: 'ambiguous'; executions: readonly OrderedScenarioExecution[] };

export function compareCandidateResults(
  executions: readonly OrderedScenarioExecution[],
): CandidateComparison {
  if (executions.length === 0) throw new TypeError('candidate_execution_missing');
  const first = executions[0]!;
  const damage = damageFingerprint(first.input);
  const presentation = presentationFingerprint(first);
  return executions.every(
    (execution) =>
      damageFingerprint(execution.input) === damage &&
      presentationFingerprint(execution) === presentation,
  )
    ? { kind: 'equivalent', execution: first }
    : { kind: 'ambiguous', executions };
}
