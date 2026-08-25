import type { TraitCondition } from '@fgo-lab/master-data';
import type {
  BattleState,
  ConditionExpression,
  EffectDecision,
  ExecutionIssue,
  TraitScope,
} from './index';
import { canonicalExclusiveGroup } from './conditionSemantics';

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
  const hasTrait = (scope: TraitScope, trait: string) =>
    state.traits[scope].has(trait) ||
    (scope === 'attacker' && state.traits.attackerState.has(trait)) ||
    (scope === 'target' && state.traits.targetState.has(trait));
  switch (condition.kind) {
    case 'always':
      return true;
    case 'trait':
      return hasTrait(condition.scope, condition.trait) === condition.present;
    case 'partialTrait':
      return null;
    case 'traitCount': {
      const count = condition.traits.filter((trait) => hasTrait(condition.scope, trait)).length;
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

type ConstraintLiteral =
  | { kind: 'trait'; scope: TraitScope; trait: string; present: boolean }
  | { kind: 'quantity'; quantity: keyof BattleState['quantities']; value: number };
type Alternatives = ConstraintLiteral[][];

function cartesian(left: Alternatives, right: Alternatives): Alternatives {
  return left.flatMap((a) => right.map((b) => [...a, ...b]));
}

function alternatives(condition: ConditionExpression, negated = false): Alternatives | null {
  switch (condition.kind) {
    case 'always':
    case 'card':
      return [[]];
    case 'partialTrait':
    case 'traitCount':
      return null;
    case 'trait':
      return [[{ ...condition, present: negated ? !condition.present : condition.present }]];
    case 'quantity':
      return condition.comparison === 'equal' && !negated
        ? [[{ kind: 'quantity', quantity: condition.quantity, value: condition.value }]]
        : null;
    case 'not':
      return alternatives(condition.expression, !negated);
    case 'all':
    case 'any': {
      const conjunction = (condition.kind === 'all') !== negated;
      const children = condition.expressions.map((child) => alternatives(child, negated));
      if (children.some((child) => child === null)) return null;
      return conjunction
        ? (children as Alternatives[]).reduce<Alternatives>(cartesian, [[]])
        : (children as Alternatives[]).flat();
    }
  }
}

function literalsCompatible(literals: readonly ConstraintLiteral[]): boolean {
  const traits = new Map<string, boolean>();
  const groups = new Map<string, string>();
  const quantities = new Map<string, number>();
  for (const literal of literals) {
    if (literal.kind === 'quantity') {
      const prior = quantities.get(literal.quantity);
      if (prior !== undefined && prior !== literal.value) return false;
      quantities.set(literal.quantity, literal.value);
      continue;
    }
    const traitKey = `${literal.scope}:${literal.trait}`;
    const prior = traits.get(traitKey);
    if (prior !== undefined && prior !== literal.present) return false;
    traits.set(traitKey, literal.present);
    if (!literal.present) continue;
    const group = canonicalExclusiveGroup(literal.scope, literal.trait);
    if (!group) continue;
    const groupKey = `${literal.scope}:${group}`;
    const priorTrait = groups.get(groupKey);
    if (priorTrait && priorTrait !== literal.trait) return false;
    groups.set(groupKey, literal.trait);
  }
  return true;
}

export function validateConditionDecisions(
  decisions: readonly EffectDecision[],
  conditions: ReadonlyMap<string, ConditionExpression>,
): ExecutionIssue[] {
  const active = decisions.filter(
    (decision) => decision.operationEnabled && decision.conditionSatisfaction === 'assumeSatisfied',
  );
  let combined: Alternatives = [[]];
  const decisionKeys: string[] = [];
  for (const decision of active) {
    const condition = conditions.get(decision.decisionKey);
    if (!condition) continue;
    const next = alternatives(condition);
    if (next === null) continue;
    combined = cartesian(combined, next).filter(literalsCompatible);
    decisionKeys.push(decision.decisionKey);
    if (combined.length === 0)
      return [{ kind: 'conditionDecisionConflict', decisionKeys, detail: 'unsatisfiable' }];
  }
  return [];
}
