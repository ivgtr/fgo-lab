import type { BattleOperation, EffectDecision, ExecutionIssue } from './contracts';

export function resolveDecisionsWithStochasticOutcomes(
  scenarioDecisions: ReadonlyMap<string, EffectDecision>,
  operations: readonly BattleOperation[],
  inputValues: Readonly<Record<string, number>>,
): { decisions: Map<string, EffectDecision>; issues: ExecutionIssue[] } {
  const decisions = new Map(scenarioDecisions);
  const issues: ExecutionIssue[] = [];
  const invalidKeys = new Set<string>();
  const reject = (operation: BattleOperation) => {
    if (operation.decisionKey === null) return;
    decisions.set(operation.decisionKey, {
      decisionKey: operation.decisionKey,
      operationEnabled: false,
      conditionSatisfaction: 'evaluate',
    });
  };
  for (const operation of operations) {
    if (operation.proc.kind === 'guaranteed') {
      if (operation.stochasticOutcome) {
        issues.push({
          kind: 'invalidStochasticOutcome',
          operationId: operation.operationId,
          detail: 'contradictoryStochasticOutcome',
        });
        reject(operation);
      }
      continue;
    }
    if (!operation.stochasticOutcome) {
      issues.push({
        kind: 'invalidStochasticOutcome',
        operationId: operation.operationId,
        detail: 'missingStochasticOutcome',
      });
      reject(operation);
      continue;
    }
    if (
      (operation.proc.kind === 'chainedRolls') !==
      (operation.stochasticOutcome.kind === 'successCount')
    ) {
      issues.push({
        kind: 'invalidStochasticOutcome',
        operationId: operation.operationId,
        detail: 'partialStochasticOutcome',
      });
      reject(operation);
      continue;
    }
    if (operation.stochasticOutcome.kind !== 'successCount' || operation.decisionKey === null)
      continue;
    const outcome = operation.stochasticOutcome;
    const definition = operation.inputDefinitions.find(
      (candidate) => candidate.kind === 'procSuccessCount' && candidate.key === outcome.key,
    );
    if (!definition) {
      issues.push({
        kind: 'invalidStochasticOutcome',
        operationId: operation.operationId,
        detail: 'missingSuccessCountDefinition',
      });
      reject(operation);
      continue;
    }
    if (scenarioDecisions.has(operation.decisionKey)) {
      if (!invalidKeys.has(operation.decisionKey))
        issues.push({
          kind: 'invalidStochasticOutcome',
          operationId: operation.operationId,
          detail: 'duplicateEffectDecision',
        });
      invalidKeys.add(operation.decisionKey);
      reject(operation);
      continue;
    }
    decisions.set(operation.decisionKey, {
      decisionKey: operation.decisionKey,
      operationEnabled: (inputValues[outcome.key] ?? definition.minimum) > definition.minimum,
      conditionSatisfaction: 'evaluate',
    });
  }
  return { decisions, issues };
}
