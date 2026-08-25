import type { TraitCondition } from '@fgo-lab/master-data';
import type { BattleState, ConditionExpression, TraitScope } from './index';

export function normalizeTraitCondition(
  condition: TraitCondition,
  scope: TraitScope,
): ConditionExpression {
  if (condition.traits.length === 0) return { kind: 'always' };
  const traits = condition.traits.map((trait) => ({
    trait: trait.name,
    present: !trait.negative,
  }));
  if (condition.operator === 'partial') return { kind: 'partialTrait', scope, traits };
  const expressions = traits.map<ConditionExpression>((trait) => ({
    kind: 'trait',
    scope,
    ...trait,
  }));
  return condition.operator === 'all' ? { kind: 'all', expressions } : { kind: 'any', expressions };
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
  if (condition.kind === 'partialTrait') return true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(containsUnsupportedCondition);
  return condition.kind === 'not' && containsUnsupportedCondition(condition.expression);
}

export function isConditional(condition: ConditionExpression): boolean {
  return condition.kind !== 'always' && condition.kind !== 'card';
}

export function evaluateCondition(
  condition: ConditionExpression,
  state: BattleState,
): boolean | null {
  const traitValue = (scope: TraitScope, trait: string): boolean | undefined => {
    const direct = state.traits[scope].get(trait);
    if (scope !== 'attacker' && scope !== 'target') return direct;
    const stateValue =
      state.traits[scope === 'attacker' ? 'attackerState' : 'targetState'].get(trait);
    if (direct === true || stateValue === true) return true;
    if (direct === false && stateValue === false) return false;
    return direct ?? stateValue;
  };
  switch (condition.kind) {
    case 'always':
      return true;
    case 'trait': {
      const actual = traitValue(condition.scope, condition.trait);
      return actual === undefined ? null : actual === condition.present;
    }
    case 'partialTrait':
      return null;
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
      return state.card === condition.card;
    case 'quantity': {
      const actual = state.quantities[condition.quantity];
      if (actual === null) return null;
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
