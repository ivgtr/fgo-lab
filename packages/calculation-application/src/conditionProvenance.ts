import {
  traitConditionScopeSemantics,
  type ConditionExpression,
  type TraitScope,
} from '@fgo-lab/battle-execution';

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
  if (condition.kind === 'trait' || condition.kind === 'traitCount')
    return traitFactKind(condition.scope);
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

function traitFactKind(scope: TraitScope): ConditionFactKind {
  const semantics = traitConditionScopeSemantics(scope);
  if (semantics.actor === 'target') return 'target';
  if (semantics.actor === 'field') return 'derivedOrExternalField';
  if (semantics.layer === 'state') return 'derivedOrExternalField';
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
        leaf.kind === 'trait' && leaf.scope === 'field'
          ? [leaf.trait]
          : leaf.kind === 'traitCount' && leaf.scope === 'field'
            ? leaf.traits
            : [],
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
