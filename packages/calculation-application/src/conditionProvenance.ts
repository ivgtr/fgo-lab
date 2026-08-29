import type { ConditionExpression } from '@fgo-lab/battle-execution';

export type ConditionFactKind =
  'intrinsic' | 'derivedOrExternalField' | 'externalScenarioFact' | 'target' | 'procOrQuantity';

export interface ConditionFactRequirement {
  kind: ConditionFactKind;
  condition: Exclude<ConditionExpression, { kind: 'all' | 'any' | 'not' }>;
  negated: boolean;
}

function leafKind(
  condition: Exclude<ConditionExpression, { kind: 'all' | 'any' | 'not' }>,
): ConditionFactKind {
  if (condition.kind === 'targetPredicate') return 'target';
  if (condition.kind === 'trait') {
    if (condition.scope === 'field') return 'derivedOrExternalField';
    if (condition.scope === 'target' || condition.scope === 'targetState') return 'target';
    return condition.scope === 'attacker' ? 'intrinsic' : 'derivedOrExternalField';
  }
  if (condition.kind === 'traitCount')
    return condition.scope === 'target' || condition.scope === 'targetState'
      ? 'target'
      : condition.scope === 'field' || condition.scope === 'attackerState'
        ? 'derivedOrExternalField'
        : 'intrinsic';
  if (
    condition.kind === 'quantity' ||
    condition.kind === 'inputQuantity' ||
    condition.kind === 'sourceQuantity' ||
    condition.kind === 'operationTrigger'
  )
    return 'procOrQuantity';
  if (condition.kind === 'choice') return 'externalScenarioFact';
  return 'intrinsic';
}

export function conditionFactRequirements(
  condition: ConditionExpression | null,
  negated = false,
): ConditionFactRequirement[] {
  if (condition === null) return [];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap((expression) =>
      conditionFactRequirements(expression, negated),
    );
  if (condition.kind === 'not') return conditionFactRequirements(condition.expression, !negated);
  return [{ kind: leafKind(condition), condition, negated }];
}

export function fieldTraitsRequiredByCondition(
  condition: ConditionExpression | null,
): readonly string[] {
  return [
    ...new Set(
      conditionFactRequirements(condition).flatMap(({ condition: leaf }) =>
        leaf.kind === 'trait' && leaf.scope === 'field' ? [leaf.trait] : [],
      ),
    ),
  ].sort();
}

export function stateTraitsRequiredByCondition(
  condition: ConditionExpression | null,
  scope: 'attackerState' | 'targetState',
): readonly string[] {
  return [
    ...new Set(
      conditionFactRequirements(condition).flatMap(({ condition: leaf }) => {
        if (leaf.kind === 'trait' && leaf.scope === scope) return [leaf.trait];
        if (leaf.kind === 'traitCount' && leaf.scope === scope) return leaf.traits;
        return [];
      }),
    ),
  ].sort();
}
