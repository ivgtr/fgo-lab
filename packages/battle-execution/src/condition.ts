import type { TraitCondition, TraitReadPolicy } from '@fgo-lab/master-data';
import type { BattleState, ConditionExpression, TraitScope } from './contracts';
import { traitConditionReadScopes } from './conditionSemantics';
import { targetPredicateKey } from './targetPredicate';
import { evaluateActivationRequirement } from './activationContext';

const DEFAULT_TRAIT_READ_POLICY: TraitReadPolicy = {
  stateSources: 'activeOnly',
  ignoredStateTraits: 'exclude',
  unremovableStateTraits: 'include',
};

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

function requiresProvenanceDecision(readPolicy: TraitReadPolicy | undefined): boolean {
  return (
    readPolicy !== undefined &&
    (readPolicy.stateSources !== DEFAULT_TRAIT_READ_POLICY.stateSources ||
      readPolicy.ignoredStateTraits !== DEFAULT_TRAIT_READ_POLICY.ignoredStateTraits ||
      readPolicy.unremovableStateTraits !== DEFAULT_TRAIT_READ_POLICY.unremovableStateTraits)
  );
}

export function normalizeTraitCondition(
  condition: TraitCondition,
  scope: TraitScope,
  readPolicy: TraitReadPolicy = DEFAULT_TRAIT_READ_POLICY,
): ConditionExpression {
  if (condition.traits.length === 0) return { kind: 'always' };
  const targetPredicates = condition.traits.filter(
    (trait): trait is Extract<(typeof condition.traits)[number], { predicate: unknown }> =>
      'predicate' in trait,
  );
  if (targetPredicates.length > 0 && scope !== 'target' && scope !== 'attacker')
    throw new TypeError(`target_predicate_scope:${scope}`);
  const actorScope = scope === 'target' ? 'target' : 'attacker';
  const traits = condition.traits.flatMap((trait) =>
    'predicate' in trait ? [] : [{ trait: trait.name, present: !trait.negative }],
  );
  const onlyTrait = traits.length === 1 ? traits[0] : undefined;
  if (
    onlyTrait &&
    (scope === 'attacker' || scope === 'attackerState') &&
    ['cardNP', 'faceCard', 'cardExtra'].includes(onlyTrait.trait)
  ) {
    const actual = onlyTrait.trait === 'cardNP';
    return actual === onlyTrait.present
      ? { kind: 'always' }
      : { kind: 'not', expression: { kind: 'always' } };
  }
  const expressions = [
    ...targetPredicates.map<ConditionExpression>((item) => ({
      kind: 'targetPredicate',
      scope: actorScope,
      predicate: item.predicate,
      present: !item.negative,
    })),
    ...traits.map<ConditionExpression>((trait) => {
      const fixedCardScope =
        scope === 'attacker' || scope === 'attackerState'
          ? ({ cardNP: true, faceCard: false, cardExtra: false } as const)[
              trait.trait as 'cardNP' | 'faceCard' | 'cardExtra'
            ]
          : undefined;
      if (fixedCardScope !== undefined) {
        const matches = fixedCardScope === trait.present;
        return matches ? { kind: 'always' } : { kind: 'not', expression: { kind: 'always' } };
      }
      const card =
        scope === 'attacker' || scope === 'attackerState'
          ? ({ cardArts: 'arts', cardBuster: 'buster', cardQuick: 'quick' } as const)[
              trait.trait as 'cardArts' | 'cardBuster' | 'cardQuick'
            ]
          : undefined;
      if (card)
        return trait.present
          ? { kind: 'card', card }
          : { kind: 'not', expression: { kind: 'card', card } };
      return { kind: 'trait', scope, ...trait, readPolicy };
    }),
  ];
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
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(containsUnsupportedCondition);
  return condition.kind === 'not' && containsUnsupportedCondition(condition.expression);
}

export function isConditional(condition: ConditionExpression): boolean {
  return condition.kind !== 'always' && condition.kind !== 'card';
}

export function requiresUserAssumption(condition: ConditionExpression): boolean {
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(requiresUserAssumption);
  if (condition.kind === 'not') return requiresUserAssumption(condition.expression);
  return !['always', 'card', 'inputQuantity'].includes(condition.kind);
}

export function evaluateCondition(
  condition: ConditionExpression,
  state: BattleState,
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
    if (values.length === readScopes.length && values.every((value) => !value)) return false;
    return undefined;
  };
  switch (condition.kind) {
    case 'always':
      return true;
    case 'trait': {
      // Scenario trait facts intentionally do not claim buff provenance. Exceptional Atlas
      // read policies therefore require the effect-local decision instead of being inferred
      // from a combined trait set.
      if (requiresProvenanceDecision(condition.readPolicy)) return null;
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
      return state.card === condition.card;
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
      const actual = state.resolvedInputValues[condition.inputKey];
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
  state: BattleState,
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
