import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { OrderedScenarioExecution } from './executionTypes';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function damageFingerprint(input: DamageResolutionInput): string {
  return stableStringify({
    ...input,
    target: {
      ...input.target,
      classId: null,
      attribute: 'unknown',
    },
  });
}

export function presentationFingerprint(execution: OrderedScenarioExecution): string {
  return stableStringify({
    precision: execution.precision,
    projections: execution.projections
      .filter((projection) => projection.visibility === 'visible')
      .map((projection) => ({
        key: projection.projectionKey,
        outcome: projection.outcome,
        explanation: projection.explanation.code,
        decision: projection.decision,
      })),
    issues: execution.issues,
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
