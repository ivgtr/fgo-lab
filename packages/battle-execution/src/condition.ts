import { liveInputQuantity } from './stackQuantities';
import type { ConditionExpression, ExecutableBattleState, TraitScope } from './contracts';
import {
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
  traitConditionEvaluationSource,
  traitConditionReadScopes,
} from './conditionSemantics';
import { targetPredicateKey } from './targetPredicate';
import { evaluateActivationRequirement } from './activationCondition';
import { noblePhantasmVariantKey } from '@fgo-lab/master-data';

export function conditionRequiresQuantity(
  condition: ConditionExpression,
  quantity: Extract<ConditionExpression, { kind: 'quantity' }>['quantity'],
): boolean {
  if (condition.kind === 'quantity') return condition.quantity === quantity;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some((expression) =>
      conditionRequiresQuantity(expression, quantity),
    );
  if (condition.kind === 'not') return conditionRequiresQuantity(condition.expression, quantity);
  return false;
}

export function combineConditions(expressions: ConditionExpression[]): ConditionExpression {
  const useful = expressions.filter((expression) => expression.kind !== 'always');
  return useful.length === 0
    ? { kind: 'always' }
    : useful.length === 1
      ? useful[0]!
      : { kind: 'all', expressions: useful };
}

export function containsUnsupportedCondition(condition: ConditionExpression): boolean {
  if (condition.kind === 'unsupported') return true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(containsUnsupportedCondition);
  return condition.kind === 'not' && containsUnsupportedCondition(condition.expression);
}

export function isConditional(condition: ConditionExpression): boolean {
  return !['always', 'card', 'noblePhantasmVariant'].includes(condition.kind);
}

export function requiresUserAssumption(condition: ConditionExpression): boolean {
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(requiresUserAssumption);
  if (condition.kind === 'not') return requiresUserAssumption(condition.expression);
  return !['always', 'unsupported', 'card', 'noblePhantasmVariant', 'inputQuantity'].includes(
    condition.kind,
  );
}

export type ConditionEvaluationState = Pick<
  ExecutableBattleState,
  | 'traits'
  | 'initialTraitSuppressions'
  | 'actorPredicates'
  | 'traitCounts'
  | 'stackQuantitySources'
  | 'resolvedInputValues'
  | 'quantities'
  | 'noblePhantasmVariant'
  | 'activationContext'
> & { card: ExecutableBattleState['card'] | null };

export function evaluateCondition(
  condition: ConditionExpression,
  state: ConditionEvaluationState,
): boolean | null {
  const traitValue = (scope: TraitScope, trait: string): boolean | undefined => {
    const readScopes = traitConditionReadScopes(scope);
    if (scope === 'attacker' || scope === 'target') {
      const stateScope = scope === 'attacker' ? 'attackerState' : 'targetState';
      const stateValue = state.traits[stateScope].get(trait);
      if (stateValue === true) return true;
      if (state.initialTraitSuppressions[scope].has(trait)) return false;
    }
    const values = readScopes.flatMap((candidate) => {
      const value = state.traits[candidate].get(trait);
      return value === undefined ? [] : [value];
    });
    if (values.includes(true)) return true;
    const group = canonicalExclusiveGroup(scope, trait);
    if (
      group &&
      canonicalExclusiveTraits(scope, group).some(
        (sibling) =>
          sibling !== trait &&
          readScopes.some((candidate) => state.traits[candidate].get(sibling) === true),
      )
    )
      return false;
    if (values.length === readScopes.length && values.every((value) => !value)) return false;
    return undefined;
  };
  switch (condition.kind) {
    case 'always':
      return true;
    case 'unsupported':
      return null;
    case 'trait': {
      // Scenario trait facts intentionally do not claim buff provenance. Exceptional Atlas
      // read policies therefore require the effect-local decision instead of being inferred
      // from a combined trait set.
      if (traitConditionEvaluationSource(condition) === 'effectLocalDecision') return null;
      const actual = traitValue(condition.scope, condition.trait);
      return actual === undefined ? null : actual === condition.present;
    }
    case 'targetPredicate': {
      const actual = state.actorPredicates[condition.scope].get(
        targetPredicateKey(condition.predicate),
      )?.present;
      return actual === undefined ? null : actual === condition.present;
    }
    case 'traitCount': {
      const values = condition.traits.map((trait) => traitValue(condition.scope, trait));
      if (values.includes(undefined)) return null;
      const count = values.filter(Boolean).length;
      return condition.comparison === 'atLeast'
        ? count >= condition.count
        : condition.comparison === 'atMost'
          ? count <= condition.count
          : count === condition.count;
    }
    case 'card':
      return state.card === null ? null : state.card === condition.card;
    case 'noblePhantasmVariant':
      return (
        noblePhantasmVariantKey(state.noblePhantasmVariant.ref) ===
        noblePhantasmVariantKey(condition.variant)
      );
    case 'choice': {
      return evaluateActivationRequirement(condition, state.activationContext);
    }
    case 'operationTrigger':
      return evaluateActivationRequirement(condition, state.activationContext);
    case 'sourceQuantity':
      return evaluateActivationRequirement(condition, state.activationContext);
    case 'quantity': {
      if (condition.subjectId !== undefined) return null;
      const actual = state.quantities[condition.quantity];
      if (actual === null) return null;
      if (condition.comparison === 'lessThan') return actual < condition.value;
      if (condition.comparison === 'atMost') return actual <= condition.value;
      if (condition.comparison === 'equal') return actual === condition.value;
      if (condition.comparison === 'atLeast') return actual >= condition.value;
      return actual > condition.value;
    }
    case 'inputQuantity': {
      const actual = liveInputQuantity(state, condition.inputKey);
      if (actual === undefined) return null;
      if (condition.comparison === 'lessThan') return actual < condition.value;
      if (condition.comparison === 'atMost') return actual <= condition.value;
      if (condition.comparison === 'equal') return actual === condition.value;
      if (condition.comparison === 'atLeast') return actual >= condition.value;
      return actual > condition.value;
    }
    case 'all': {
      const values = condition.expressions.map((value) => evaluateCondition(value, state));
      return values.includes(false) ? false : values.includes(null) ? null : true;
    }
    case 'any': {
      const values = condition.expressions.map((value) => evaluateCondition(value, state));
      return values.includes(true) ? true : values.includes(null) ? null : false;
    }
    case 'not': {
      const value = evaluateCondition(condition.expression, state);
      return value === null ? null : !value;
    }
  }
}

export function activationRequirementsSatisfied(
  condition: ConditionExpression,
  state: ExecutableBattleState,
): boolean {
  if (
    condition.kind === 'choice' ||
    condition.kind === 'operationTrigger' ||
    condition.kind === 'sourceQuantity'
  )
    return evaluateCondition(condition, state) === true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.every((expression) =>
      activationRequirementsSatisfied(expression, state),
    );
  if (condition.kind === 'not') return activationRequirementsSatisfied(condition.expression, state);
  return true;
}
