import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import type {
  BattleOperation,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  ExecutableBattleState,
  OperationResult,
} from './contracts';
import { createOperationProjection, resolveOperationProjectionEvaluation } from './projection';
import { cloneBattleState } from './state';

function conditionResult(value: boolean | null): OperationResult['condition'] {
  if (value === null) return 'unresolved';
  return value ? 'satisfied' : 'unsatisfied';
}

export function createOperationResult({
  operation,
  outcome,
  code,
  condition,
  choice,
  state,
  decisions,
  resolvedModifierValue,
  activeDecisionSource,
  attackerClass,
  issue,
}: {
  operation: BattleOperation;
  outcome: OperationResult['outcome'];
  code: EffectProjection['explanation']['code'];
  condition: boolean | null;
  choice: EffectDecision | undefined;
  state: ExecutableBattleState;
  decisions: ReadonlyMap<string, EffectDecision>;
  resolvedModifierValue: number | null;
  activeDecisionSource: boolean;
  attackerClass: string;
  issue: ExecutionIssue | null;
}): OperationResult {
  const projected = resolveOperationProjectionEvaluation(
    operation,
    outcome,
    code,
    condition,
    choice,
    state,
    decisions,
  );
  return {
    operation,
    outcome,
    condition: conditionResult(condition),
    state: cloneBattleState(state),
    projection: createOperationProjection(
      operation,
      projected.outcome,
      projected.code,
      projected.condition,
      projected.choice,
      resolvedModifierValue,
      activeDecisionSource,
      {
        kind: 'relative',
        relation: defaultTargetClassRelation(attackerClass),
      },
      { kind: 'relative', relation: 'neutral' },
    ),
    issue,
  };
}
