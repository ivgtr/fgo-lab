import { observeHpQuantity } from './hpExecutionObservation';
import { liveInputQuantity } from './stackQuantities';
import { markerTraitRead } from './buffInstances';
import type { ConditionExpression, ExecutableBattleState, TraitScope } from './contracts';
import {
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
  compareTraitCount,
  decisiveConditionGroup,
  resolveCombinedTraitValue,
  traitConditionEvaluationSource,
  traitConditionScopeSemantics,
} from './conditionSemantics';
import { targetPredicateKey } from './targetPredicate';
import { evaluateActivationRequirement } from './activationCondition';
import { noblePhantasmVariantKey } from '@fgo-lab/master-data';
import type { BattlePointDomain } from '@fgo-lab/master-data';
import {
  battlePointPhase,
  battlePointRate,
  readBattlePoint,
  type BattlePointState,
} from './battlePointResource';

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
  | 'hp'
  | 'buffInstances'
  | 'traits'
  | 'initialTraitSuppressions'
  | 'actorPredicates'
  | 'traitCounts'
  | 'stackQuantitySources'
  | 'resolvedInputValues'
  | 'quantities'
  | 'noblePhantasmVariant'
  | 'activationContext'
> & {
  card: ExecutableBattleState['card'] | null;
  battlePoints?: BattlePointState;
  battlePointDomains?: readonly BattlePointDomain[];
  resourceActor?: string;
};

export type ConditionReadAudit =
  | { kind: 'inputQuantity'; inputKey: string; value: number | undefined }
  | {
      kind: 'battlePointPhase';
      subjectId: string;
      actor: string;
      point: number | null;
      phase: number | null;
      comparison: Extract<ConditionExpression, { kind: 'quantity' }>['comparison'];
      expectedValue: number;
      evaluated: boolean | null;
    };

export function evaluateCondition(
  condition: ConditionExpression,
  state: ConditionEvaluationState,
  onConditionRead?: (read: ConditionReadAudit) => void,
): boolean | null {
  const traitValue = (scope: TraitScope, trait: string): boolean | undefined => {
    const scopeSemantics = traitConditionScopeSemantics(scope);
    if (scopeSemantics.actor !== 'field') {
      const marker = markerTraitRead(state.buffInstances ?? [], scopeSemantics.actor, trait);
      if (marker) {
        if (marker.count > 0) return true;
        if (!marker.known) return undefined;
        if (scopeSemantics.layer === 'state') return false;
      }
    }
    const readScopes = scopeSemantics.readScopes;
    const combinedScope = scopeSemantics.layer === 'combined';
    const combinedActor = scopeSemantics.actor === 'field' ? undefined : scopeSemantics.actor;
    const stateScope =
      combinedActor === undefined
        ? undefined
        : combinedActor === 'attacker'
          ? 'attackerState'
          : 'targetState';
    const stateValue =
      combinedScope && stateScope !== undefined ? state.traits[stateScope].get(trait) : undefined;
    const initialValue =
      combinedScope && combinedActor !== undefined
        ? state.traits[combinedActor].get(trait)
        : undefined;
    if (combinedScope && stateValue === true) return true;
    if (
      combinedScope &&
      combinedActor !== undefined &&
      state.initialTraitSuppressions[combinedActor].has(trait)
    )
      return false;
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
    if (combinedActor === undefined) return undefined;
    const readableScope = scope as Exclude<TraitScope, 'field'>;
    return resolveCombinedTraitValue({
      scope: readableScope,
      initial: initialValue,
      state: stateValue,
      suppressed: combinedScope ? state.initialTraitSuppressions[combinedActor].has(trait) : false,
    });
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
      return compareTraitCount(condition.comparison, count, condition.count);
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
    case 'sourceQuantity': {
      if (state.battlePoints && state.battlePointDomains) {
        const actor = ['attacker', 'passive', 'np', 'craftEssence'].includes(
          condition.source.origin,
        )
          ? 'attacker'
          : condition.source.sourceInstanceId;
        const actual = battlePointRate(
          readBattlePoint(state.battlePoints, actor, condition.subjectId),
        );
        if (actual === null) return null;
        return condition.comparison === 'atLeast'
          ? actual >= condition.value
          : actual <= condition.value;
      }
      return evaluateActivationRequirement(condition, state.activationContext);
    }
    case 'quantity': {
      const actual =
        condition.quantity === 'battlePointPhase' &&
        condition.subjectId !== undefined &&
        state.battlePoints
          ? (() => {
              const domain = state.battlePointDomains?.find(
                (candidate) => candidate.id === condition.subjectId,
              );
              return domain
                ? battlePointPhase(
                    domain,
                    readBattlePoint(
                      state.battlePoints,
                      state.resourceActor ?? 'attacker',
                      condition.subjectId,
                    ),
                  )
                : null;
            })()
          : condition.subjectId !== undefined
            ? null
            : state.quantities[condition.quantity];
      const evaluated =
        actual === null
          ? null
          : condition.comparison === 'lessThan'
            ? actual < condition.value
            : condition.comparison === 'atMost'
              ? actual <= condition.value
              : condition.comparison === 'equal'
                ? actual === condition.value
                : condition.comparison === 'atLeast'
                  ? actual >= condition.value
                  : actual > condition.value;
      if (condition.quantity === 'attackerHpPermille')
        observeHpQuantity(
          state,
          state.resourceActor ?? 'attacker',
          actual,
          condition.comparison,
          condition.value,
          evaluated,
        );
      if (condition.quantity === 'battlePointPhase' && condition.subjectId !== undefined) {
        const value = readBattlePoint(
          state.battlePoints,
          state.resourceActor ?? 'attacker',
          condition.subjectId,
        );
        onConditionRead?.({
          kind: 'battlePointPhase',
          subjectId: condition.subjectId,
          actor: state.resourceActor ?? 'attacker',
          point: value?.kind === 'present' ? value.point : null,
          phase: actual,
          comparison: condition.comparison,
          expectedValue: condition.value,
          evaluated,
        });
      }
      return evaluated;
    }
    case 'inputQuantity': {
      const actual = liveInputQuantity(state, condition.inputKey);
      onConditionRead?.({ kind: 'inputQuantity', inputKey: condition.inputKey, value: actual });
      if (actual === undefined) return null;
      if (condition.comparison === 'lessThan') return actual < condition.value;
      if (condition.comparison === 'atMost') return actual <= condition.value;
      if (condition.comparison === 'equal') return actual === condition.value;
      if (condition.comparison === 'atLeast') return actual >= condition.value;
      return actual > condition.value;
    }
    case 'all': {
      const values = condition.expressions.map((value) =>
        evaluateCondition(value, state, onConditionRead),
      );
      const decisive = decisiveConditionGroup('all', values);
      return decisive ?? (values.includes(null) ? null : true);
    }
    case 'any': {
      const values = condition.expressions.map((value) =>
        evaluateCondition(value, state, onConditionRead),
      );
      const decisive = decisiveConditionGroup('any', values);
      return decisive ?? (values.includes(null) ? null : false);
    }
    case 'not': {
      const value = evaluateCondition(condition.expression, state, onConditionRead);
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
