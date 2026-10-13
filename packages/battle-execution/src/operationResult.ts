import type { ConditionRead } from './conditionRead';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import type { CombatRules } from '@fgo-lab/master-data';
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

export function operationConditionResult(value: boolean | null): OperationResult['condition'] {
  if (value === null) return 'unresolved';
  return value ? 'satisfied' : 'unsatisfied';
}

export function createOperationResult({
  conditionRead,
  damageDependencyRead,
  valueDependencyRead,
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
  combatRules,
  issue,
}: {
  conditionRead: ConditionRead;
  damageDependencyRead: ConditionRead | null;
  valueDependencyRead: ConditionRead | null;
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
  combatRules?: CombatRules | undefined;
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
    conditionRead,
    damageDependencyRead,
    valueDependencyRead,
    operation,
    outcome,
    condition: operationConditionResult(condition),
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
        relation: defaultTargetClassRelation(attackerClass, combatRules),
      },
      { kind: 'relative', relation: 'neutral' },
    ),
    issue,
  };
}
