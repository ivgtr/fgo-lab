import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { OrderedScenarioExecution } from './executionTypes';

/** A relative target cannot select a physical truth for NP special excluded by baseline policy. */
export function summarizeExcludedExternalTargetContributions(
  execution: OrderedScenarioExecution,
): OrderedScenarioExecution {
  if (execution.precision !== 'exact') return execution;
  const excluded = new Set(
    execution.effectiveContributions.contributions.flatMap((contribution) =>
      contribution.component === 'npSpecial' &&
      contribution.conditionDecision.kind === 'excluded' &&
      contribution.conditionDecision.reason === 'conditionalEffectPolicy' &&
      contribution.executionOutcome !== 'unsupported' &&
      execution.projections.some(
        (projection) =>
          projection.contributionId === contribution.contributionId &&
          projection.modifier === 'npSpecial',
      )
        ? [contribution.contributionId]
        : [],
    ),
  );
  if (excluded.size === 0) return execution;
  return {
    ...execution,
    projections: execution.projections.map((projection) =>
      projection.modifier === 'npSpecial' &&
      projection.contributionId !== null &&
      excluded.has(projection.contributionId)
        ? {
            ...projection,
            outcome: 'notRelevant' as const,
            decision:
              projection.decision.state === 'none'
                ? projection.decision
                : { ...projection.decision, state: 'disabled' as const },
            explanation: { ...projection.explanation, code: 'disabled' as const },
          }
        : projection,
    ),
    effectiveContributions: {
      ...execution.effectiveContributions,
      contributions: execution.effectiveContributions.contributions.map((contribution) =>
        excluded.has(contribution.contributionId)
          ? { ...contribution, executionOutcome: 'notRelevant' as const }
          : contribution,
      ),
    },
  };
}

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
  const summary = summarizeExcludedExternalTargetContributions(execution);
  return stableStringify({
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
