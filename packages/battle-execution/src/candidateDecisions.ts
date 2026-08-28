import type {
  BattleOperation,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
} from './contracts';

export function decisionsWithProcSelections(
  scenarioDecisions: ReadonlyMap<string, EffectDecision>,
  operations: readonly BattleOperation[],
  inputValues: Readonly<Record<string, number>>,
): { decisions: Map<string, EffectDecision>; issues: ExecutionIssue[] } {
  const decisions = new Map(scenarioDecisions);
  const issues: ExecutionIssue[] = [];
  const invalidKeys = new Set<string>();
  for (const operation of operations) {
    if (operation.procSelection.kind !== 'successCount' || operation.decisionKey === null) continue;
    const selection = operation.procSelection;
    const definition = operation.inputDefinitions.find(
      (candidate) => candidate.kind === 'procSuccessCount' && candidate.key === selection.inputKey,
    );
    if (!definition) {
      issues.push({
        kind: 'invalidProcSelection',
        operationId: operation.operationId,
        detail: 'missingSuccessCountDefinition',
      });
      decisions.set(operation.decisionKey, {
        decisionKey: operation.decisionKey,
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      });
      continue;
    }
    if (scenarioDecisions.has(operation.decisionKey)) {
      if (!invalidKeys.has(operation.decisionKey))
        issues.push({
          kind: 'invalidProcSelection',
          operationId: operation.operationId,
          detail: 'duplicateEffectDecision',
        });
      invalidKeys.add(operation.decisionKey);
      decisions.set(operation.decisionKey, {
        decisionKey: operation.decisionKey,
        operationEnabled: false,
        conditionSatisfaction: 'evaluate',
      });
      continue;
    }
    decisions.set(operation.decisionKey, {
      decisionKey: operation.decisionKey,
      operationEnabled:
        (inputValues[selection.inputKey] ?? definition.minimum) > definition.minimum,
      conditionSatisfaction: 'evaluate',
    });
  }
  return { decisions, issues };
}

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
