import type { EffectDecision, EffectProjection } from './contracts';

export function resolveCompileProjections(
  projections: readonly EffectProjection[],
  decisions: ReadonlyMap<string, EffectDecision>,
  invalidDecisionKeys: ReadonlySet<string>,
): EffectProjection[] {
  return projections.map((projection) => {
    const choice = decisions.get(projection.projectionKey);
    const enabled =
      choice?.operationEnabled ??
      (projection.decision.state === 'none' || projection.decision.state === 'enabled');
    if (invalidDecisionKeys.has(projection.projectionKey))
      return {
        ...projection,
        outcome: 'notApplied' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : {
                ...projection.decision,
                state: enabled ? ('enabled' as const) : ('disabled' as const),
              },
        explanation: { ...projection.explanation, code: 'conditionNotMet' as const },
      };
    if (projection.executionSupport === 'unsupported' && enabled)
      return {
        ...projection,
        outcome: 'unsupported' as const,
        decision:
          projection.decision.state === 'none'
            ? projection.decision
            : { ...projection.decision, state: 'enabled' as const },
        explanation: { ...projection.explanation, code: 'unresolved' as const },
      };
    return enabled
      ? projection
      : {
          ...projection,
          outcome: 'notApplied' as const,
          decision:
            projection.decision.state === 'none'
              ? projection.decision
              : { ...projection.decision, state: 'disabled' as const },
          explanation: { ...projection.explanation, code: 'disabled' as const },
        };
  });
}
