import type { BattleOperation } from './contracts';
import { observeHpQuantity } from './hpExecutionObservation';
import { liveInputQuantity } from './stackQuantities';
import { markerTraitRead } from './buffInstances';
import type { ConditionExpression, ExecutableBattleState, TraitScope } from './contracts';
import {
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
  compareTraitCount,
  resolveCombinedTraitValue,
  traitConditionEvaluationSource,
  traitConditionScopeSemantics,
} from './conditionSemantics';
import { targetPredicateKey } from './targetPredicate';
import {
  ConditionReadIdentityError,
  proofIsGuaranteed,
  type ConditionRead,
  type ConditionFactProof,
  type ConditionReadEvidence,
} from './conditionRead';
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
  | 'conditionFactProofs'
  | 'conditionReadClock'
  | 'traitFactLayers'
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
): ConditionRead {
  const clock = state.conditionReadClock;
  const requiredProof = (
    proof: ConditionFactProof | undefined | null,
    key: string,
  ): ConditionFactProof => {
    if (!proof) throw new ConditionReadIdentityError(key);
    return proof;
  };
  const result = (
    truth: boolean | null,
    evidence: readonly ConditionReadEvidence[],
    support: readonly ConditionFactProof[],
    unknown: 'inputRequired' | 'unsupported' = 'inputRequired',
  ): ConditionRead =>
    truth === null
      ? { kind: unknown, truth, certainty: null, clock, evidence, support }
      : {
          kind: 'known',
          truth,
          certainty: support.every(proofIsGuaranteed) ? 'guaranteed' : 'possible',
          clock,
          evidence,
          support,
        };
  const leaf = (
    value: boolean | number | null,
    truth: boolean | null,
    support: readonly ConditionFactProof[],
    unknown: 'inputRequired' | 'unsupported' = 'inputRequired',
  ) =>
    result(
      truth,
      [{ expression: condition, value, proof: support.length === 1 ? support[0]! : null }],
      support,
      unknown,
    );
  type TraitRead = { value: boolean | undefined; support: readonly ConditionFactProof[] };
  const scopeRead = (scope: TraitScope, trait: string): TraitRead => {
    const value = state.traits[scope].get(trait);
    if (value !== undefined)
      return {
        value,
        support: [
          requiredProof(
            state.conditionFactProofs.traits[scope].get(trait),
            `trait:${scope}:${trait}`,
          ),
        ],
      };
    const complete = state.conditionFactProofs.completeTraits[scope];
    return complete ? { value: false, support: [complete] } : { value: undefined, support: [] };
  };
  const traitValue = (scope: TraitScope, trait: string): TraitRead => {
    const semantics = traitConditionScopeSemantics(scope);
    if (semantics.actor !== 'field') {
      const marker = markerTraitRead(state.buffInstances ?? [], semantics.actor, trait);
      if (marker) {
        const instances = (state.buffInstances ?? []).filter(
          (instance) =>
            instance.actor === semantics.actor &&
            (instance.marker?.actorTrait === trait || instance.traits.includes(trait)),
        );
        const support = instances.map((instance) =>
          requiredProof(
            state.conditionFactProofs.markers.get(instance.identity),
            `marker:${instance.identity}`,
          ),
        );
        if (marker.count > 0) return { value: true, support };
        if (!marker.known) return { value: undefined, support };
        if (semantics.layer === 'state') return { value: false, support };
      }
    }
    const combined = semantics.layer === 'combined';
    const actor = semantics.actor === 'field' ? undefined : semantics.actor;
    const stateScope =
      actor === undefined ? undefined : actor === 'attacker' ? 'attackerState' : 'targetState';
    const stateRead = combined && stateScope ? scopeRead(stateScope, trait) : undefined;
    const initialRead = combined && actor ? scopeRead(actor, trait) : undefined;
    if (stateRead?.value === true) return stateRead;
    if (combined && actor && state.initialTraitSuppressions[actor].has(trait))
      return {
        value: false,
        support: [
          requiredProof(
            state.conditionFactProofs.suppressions[actor].get(trait),
            `suppression:${actor}:${trait}`,
          ),
        ],
      };
    const reads = semantics.readScopes.map((candidate) => scopeRead(candidate, trait));
    const positive = reads.filter((read) => read.value === true);
    if (positive.length)
      return positive.find((read) => read.support.every(proofIsGuaranteed)) ?? positive[0]!;
    const group = canonicalExclusiveGroup(scope, trait);
    if (group) {
      const sibling = canonicalExclusiveTraits(scope, group)
        .flatMap((candidate) =>
          candidate === trait
            ? []
            : semantics.readScopes.map((readScope) => scopeRead(readScope, candidate)),
        )
        .find((read) => read.value === true);
      if (sibling) return { value: false, support: sibling.support };
    }
    if (reads.every((read) => read.value === false))
      return { value: false, support: reads.flatMap((read) => read.support) };
    if (actor === undefined) return { value: undefined, support: [] };
    const value = resolveCombinedTraitValue({
      scope: scope as Exclude<TraitScope, 'field'>,
      initial: initialRead?.value,
      state: stateRead?.value,
      suppressed: false,
    });
    return {
      value,
      support: [initialRead, stateRead].flatMap((read) => read?.support ?? []),
    };
  };
  const constant: ConditionFactProof = { kind: 'canonicalIntrinsic', clock };
  switch (condition.kind) {
    case 'always':
      return leaf(true, true, [constant]);
    case 'unsupported':
      return leaf(null, null, [], 'unsupported');
    case 'trait': {
      if (traitConditionEvaluationSource(condition) === 'effectLocalDecision')
        return leaf(null, null, []);
      const actual = traitValue(condition.scope, condition.trait);
      return leaf(
        actual.value ?? null,
        actual.value === undefined ? null : actual.value === condition.present,
        actual.support,
      );
    }
    case 'targetPredicate': {
      const key = targetPredicateKey(condition.predicate);
      const actual = state.actorPredicates[condition.scope].get(key)?.present;
      return leaf(
        actual ?? null,
        actual === undefined ? null : actual === condition.present,
        actual === undefined
          ? []
          : [
              requiredProof(
                state.conditionFactProofs.predicates[condition.scope].get(key),
                `predicate:${condition.scope}:${key}`,
              ),
            ],
      );
    }
    case 'traitCount': {
      const reads = condition.traits.map((trait) => traitValue(condition.scope, trait));
      if (reads.some((read) => read.value === undefined)) return leaf(null, null, []);
      const count = reads.filter((read) => read.value).length;
      return leaf(
        count,
        compareTraitCount(condition.comparison, count, condition.count),
        reads.flatMap((read) => read.support),
      );
    }
    case 'card':
      return leaf(
        state.card === null ? null : state.card === condition.card,
        state.card === null ? null : state.card === condition.card,
        state.card === null ? [] : [constant],
      );
    case 'noblePhantasmVariant': {
      const actual =
        noblePhantasmVariantKey(state.noblePhantasmVariant.ref) ===
        noblePhantasmVariantKey(condition.variant);
      return leaf(actual, actual, [constant]);
    }
    case 'choice':
    case 'operationTrigger': {
      const actual = evaluateActivationRequirement(condition, state.activationContext);
      return leaf(
        actual,
        actual,
        actual === null
          ? []
          : [{ kind: condition.kind === 'choice' ? 'legalChoice' : 'guaranteedWrite', clock }],
      );
    }
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
        return leaf(
          actual,
          actual === null
            ? null
            : condition.comparison === 'atLeast'
              ? actual >= condition.value
              : actual <= condition.value,
          actual === null
            ? []
            : [
                requiredProof(
                  state.conditionFactProofs.quantities.get(
                    `battlePoint:${actor}:${condition.subjectId}`,
                  ),
                  `battlePoint:${actor}:${condition.subjectId}`,
                ),
              ],
        );
      }
      const actual = evaluateActivationRequirement(condition, state.activationContext);
      return leaf(actual, actual, actual === null ? [] : [{ kind: 'externalAssumption', clock }]);
    }
    case 'quantity': {
      const actor = state.resourceActor ?? 'attacker';
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
                    readBattlePoint(state.battlePoints, actor, condition.subjectId),
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
          condition,
          actor,
          actual,
          condition.comparison,
          condition.value,
          evaluated,
        );
      if (condition.quantity === 'battlePointPhase' && condition.subjectId !== undefined) {
        const value = readBattlePoint(state.battlePoints, actor, condition.subjectId);
        onConditionRead?.({
          kind: 'battlePointPhase',
          subjectId: condition.subjectId,
          actor,
          point: value?.kind === 'present' ? value.point : null,
          phase: actual,
          comparison: condition.comparison,
          expectedValue: condition.value,
          evaluated,
        });
      }
      const key =
        condition.subjectId === undefined
          ? condition.quantity
          : `battlePoint:${actor}:${condition.subjectId}`;
      return leaf(
        actual,
        evaluated,
        actual === null
          ? []
          : [requiredProof(state.conditionFactProofs.quantities.get(key), `quantity:${key}`)],
      );
    }
    case 'inputQuantity': {
      const actual = liveInputQuantity(state, condition.inputKey);
      onConditionRead?.({ kind: 'inputQuantity', inputKey: condition.inputKey, value: actual });
      if (actual === undefined) return leaf(null, null, []);
      const truth =
        condition.comparison === 'lessThan'
          ? actual < condition.value
          : condition.comparison === 'atMost'
            ? actual <= condition.value
            : condition.comparison === 'equal'
              ? actual === condition.value
              : condition.comparison === 'atLeast'
                ? actual >= condition.value
                : actual > condition.value;
      return leaf(actual, truth, [
        requiredProof(
          state.conditionFactProofs.inputs.get(condition.inputKey),
          `input:${condition.inputKey}`,
        ),
      ]);
    }
    case 'all':
    case 'any': {
      const reads = condition.expressions.map((child) =>
        evaluateCondition(child, state, onConditionRead),
      );
      const decisiveTruth = condition.kind === 'all' ? false : true;
      const decisive = reads.filter((read) => read.truth === decisiveTruth);
      const selected = decisive.find((read) => read.certainty === 'guaranteed') ?? decisive[0];
      const evidence = reads.flatMap((read) => read.evidence);
      if (selected) return result(decisiveTruth, evidence, selected.support);
      const unknown = reads.find((read) => read.truth === null);
      return unknown
        ? result(
            null,
            evidence,
            [],
            unknown.kind === 'unsupported' ? 'unsupported' : 'inputRequired',
          )
        : result(
            !decisiveTruth,
            evidence,
            reads.flatMap((read) => read.support),
          );
    }
    case 'not': {
      const read = evaluateCondition(condition.expression, state, onConditionRead);
      return result(
        read.truth === null ? null : !read.truth,
        read.evidence,
        read.support,
        read.kind === 'unsupported' ? 'unsupported' : 'inputRequired',
      );
    }
  }
}

/** Explicit unread sources are evaluated at this operation; a prior source read is immutable. */
export function readOperationCondition(
  operation: Pick<BattleOperation, 'sourceActivation' | 'condition' | 'operationId' | 'source'>,
  state: ConditionEvaluationState,
  onConditionRead?: (read: ConditionReadAudit) => void,
): ConditionRead {
  if (operation.sourceActivation.kind === 'read') return operation.sourceActivation.read;
  const clock = {
    ...state.conditionReadClock,
    phase: 'operation' as const,
    operationId: operation.operationId,
    sourceInstanceId: operation.source.sourceInstanceId,
    occurrenceId: operation.source.effectOccurrenceId,
  };
  if (operation.sourceActivation.kind === 'notApplicable')
    return {
      kind: 'known',
      truth: false,
      certainty: 'guaranteed',
      clock,
      evidence: [],
      support: [],
    };
  return evaluateCondition(
    operation.condition,
    { ...state, conditionReadClock: clock },
    onConditionRead,
  );
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
    return evaluateCondition(condition, state).truth === true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.every((expression) =>
      activationRequirementsSatisfied(expression, state),
    );
  if (condition.kind === 'not') return activationRequirementsSatisfied(condition.expression, state);
  return true;
}
