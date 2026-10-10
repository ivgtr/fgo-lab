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
