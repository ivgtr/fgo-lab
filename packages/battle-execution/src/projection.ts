import type { NpDamageSpec } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  ConditionExpression,
  EffectDecision,
  EffectProjection,
  ExecutableBattleState,
  OperationResult,
  OperationSource,
  TraitScope,
} from './contracts';
import {
  activationChoiceGroupKey,
  type TargetAttributeContext,
  type TargetClassContext,
  type TargetPredicate,
} from '@fgo-lab/schema';
import {
  canonicalExclusiveGroup,
  traitConditionConstraintScope,
  traitConstraintActorScope,
} from './conditionSemantics';
import { conditionRequiresQuantity, evaluateCondition } from './condition';

export function resolveOperationProjectionEvaluation(
  operation: BattleOperation,
  outcome: OperationResult['outcome'],
  code: EffectProjection['explanation']['code'],
  condition: boolean | null,
  choice: EffectDecision | undefined,
  state: ExecutableBattleState,
  decisions: ReadonlyMap<string, EffectDecision>,
) {
  if (operation.kind !== 'executeNpDamage') return { outcome, code, condition, choice };
  const specialCondition = evaluateCondition(operation.specialAttackCondition, state);
  const specialChoice = operation.specialAttackDecisionKey
    ? decisions.get(operation.specialAttackDecisionKey)
    : undefined;
  const assumed =
    specialCondition === null && specialChoice?.conditionSatisfaction === 'assumeSatisfied';
  if (specialChoice?.operationEnabled === false)
    return {
      outcome: 'notApplied' as const,
      code: 'disabled' as const,
      condition: specialCondition,
      choice: specialChoice,
    };
  if (specialCondition === true || assumed)
    return {
      outcome: 'applied' as const,
      code: 'applied' as const,
      condition: specialCondition,
      choice: specialChoice,
    };
  return {
    outcome: 'notApplied' as const,
    code: specialCondition === false ? ('conditionNotMet' as const) : ('unresolved' as const),
    condition: specialCondition,
    choice: specialChoice,
  };
}

export function selectionGroupsForCondition(
  condition: EffectProjection['explanation']['condition'],
): EffectProjection['selectionGroups'] {
  if (!condition) return [];
  if (condition.kind === 'choice')
    return [
      {
        groupKey: `choice:${activationChoiceGroupKey(condition.source, condition.family)}`,
        candidateKey: condition.candidate,
      },
    ];
  if (condition.kind === 'trait' && condition.present) {
    const group = canonicalExclusiveGroup(condition.scope, condition.trait);
    if (!group) return [];
    const actor = traitConstraintActorScope(traitConditionConstraintScope(condition.scope));
    return [{ groupKey: `trait:${actor}:${group}`, candidateKey: condition.trait }];
  }
  if (condition.kind === 'all') return condition.expressions.flatMap(selectionGroupsForCondition);
  if (condition.kind === 'any' && condition.expressions.length === 1)
    return selectionGroupsForCondition(condition.expressions[0]!);
  return [];
}

export function resolveModifierValue(
  operation: Extract<BattleOperation, { kind: 'addModifier' }>,
  state: ExecutableBattleState,
): number | null {
  const expression = operation.valueExpression;
  if (!expression) return operation.valuePermille;
  if (expression.kind === 'inputLinear') {
    const units = state.resolvedInputValues[expression.inputKey];
    if (units === undefined) return null;
    const value =
      expression.basePermille +
      Math.min(expression.maximumUnits, Math.max(0, units)) * expression.perUnitPermille;
    return expression.maximumValuePermille === null
      ? value
      : expression.perUnitPermille >= 0
        ? Math.min(value, expression.maximumValuePermille)
        : Math.max(value, expression.maximumValuePermille);
  }
  const hp =
    expression.quantitySource.kind === 'attackerHpPermille'
      ? state.quantities.attackerHpPermille
      : (state.resolvedInputValues[expression.quantitySource.inputKey] ?? null);
  if (hp === null) return null;
  if (expression.kind === 'inverseHpLinear')
    return (
      expression.basePermille +
      Math.trunc((expression.bonusAtZeroHpPermille * (1_000 - hp)) / 1_000)
    );
  const clampedHp = Math.min(
    expression.maximumHpPermille,
    Math.max(expression.minimumHpPermille, hp),
  );
  return (
    expression.basePermille +
    expression.valueAtMinimumHpPermille +
    Math.trunc(
      ((expression.valueAtMaximumHpPermille - expression.valueAtMinimumHpPermille) *
        (clampedHp - expression.minimumHpPermille)) /
        (expression.maximumHpPermille - expression.minimumHpPermille),
    )
  );
}

export function createOperationProjection(
  operation: BattleOperation,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  condition: boolean | null,
  choice: EffectDecision | undefined,
  resolvedModifierValue: number | null,
  preserveSiblingChoice: boolean,
  fallbackClass: TargetClassContext,
  fallbackAttribute: TargetAttributeContext,
): EffectProjection {
  const projectionCondition =
    operation.kind === 'executeNpDamage' ? operation.specialAttackCondition : operation.condition;
  const projectionDecisionKey =
    operation.kind === 'executeNpDamage'
      ? operation.specialAttackDecisionKey
      : operation.decisionKey;
  const projectionDecisionPlan =
    operation.kind === 'executeNpDamage'
      ? ({ activation: 'user', condition: 'userMayAssume' } as const)
      : operation.decisionPlan;
  const operationRequiresAttackerHp = conditionRequiresQuantity(
    projectionCondition,
    'attackerHpPermille',
  );
  const hidden =
    operation.kind === 'preserveSemanticEffect' ||
    operation.kind === 'addTrait' ||
    operation.kind === 'removeTrait' ||
    operation.kind === 'suppressInitialTrait' ||
    operation.kind === 'addQuantity';
  const valuePermille =
    operation.kind === 'addModifier'
      ? resolvedModifierValue
      : operation.kind === 'changeModifierRate'
        ? operation.ratePermille
        : operation.kind === 'executeNpDamage' && projectionCondition.kind !== 'always'
          ? (operation.damage.parametersByOvercharge[operation.overcharge - 1]?.[
              operation.selectedNpLevel - 1
            ]?.correctionPermille ?? null)
          : null;
  const modifier =
    operation.kind === 'addModifier' || operation.kind === 'changeModifierRate'
      ? operation.modifier
      : operation.kind === 'selectNoblePhantasmVariant'
        ? 'npVariantSelection'
        : operation.kind === 'executeNpDamage' && projectionCondition.kind !== 'always'
          ? 'npSpecial'
          : operation.kind === 'ignoreDefense'
            ? 'ignoreDefense'
            : operation.kind === 'ignoreDamageCut'
              ? 'ignoreDamageCut'
              : null;
  const decisionSelected = choice?.operationEnabled ?? operation.enabledByDefault;
  const conditionSatisfiedInternally = condition === true;
  // A user-activated effect must remain reachable when another selected operation
  // makes its condition false. Selecting it may intentionally expose a typed
  // constraint conflict, and the user must still be able to switch the choice.
  const knownImpossibleBeforeSelection =
    condition === false &&
    choice === undefined &&
    !(
      projectionDecisionPlan.activation === 'user' ||
      (preserveSiblingChoice && projectionDecisionPlan.condition === 'userMayAssume')
    );
  const userControllable =
    !hidden &&
    !knownImpossibleBeforeSelection &&
    projectionDecisionKey !== null &&
    (projectionDecisionPlan.activation === 'user' ||
      (projectionDecisionPlan.condition === 'userMayAssume' &&
        (!conditionSatisfiedInternally || choice !== undefined)));
  return {
    projectionKey: hidden
      ? operation.operationId
      : (operation.decisionKey ?? operation.operationId),
    operationId: operation.operationId,
    label: operation.presentation.label,
    sourceName: operation.presentation.sourceName,
    skillName: operation.presentation.skillName,
    gameActivation: operation.gameActivation,
    sourceActive: operation.sourceEnabled,
    proc: operation.proc,
    procRatePermille: operation.procRatePermille,
    valuePermille,
    value:
      valuePermille === null
        ? null
        : modifier === 'flatDamage'
          ? valuePermille
          : valuePermille / 1000,
    requiredQuantity:
      operationRequiresAttackerHp ||
      (operation.kind === 'addModifier' &&
        operation.valueExpression &&
        operation.valueExpression.kind !== 'inputLinear' &&
        operation.valueExpression.quantitySource.kind === 'attackerHpPermille')
        ? 'attackerHpPermille'
        : null,
    requiredQuantityOwner:
      operationRequiresAttackerHp ||
      (operation.kind === 'addModifier' &&
        operation.valueExpression &&
        operation.valueExpression.kind !== 'inputLinear' &&
        operation.valueExpression.quantitySource.kind === 'attackerHpPermille')
        ? 'attacker'
        : null,
    requiredInputs: operation.inputDefinitions,
    modifier,
    source: operation.source,
    contributionScope: operation.contributionScope,
    contributionControl: 'operation',
    activationSources: [],
    executionSupport: 'supported',
    outcome,
    visibility:
      hidden ||
      (knownImpossibleBeforeSelection &&
        !(operationRequiresAttackerHp && operation.decisionPlan.activation === 'automatic')) ||
      code === 'cardMismatch' ||
      (operation.kind === 'executeNpDamage' && projectionCondition.kind === 'always')
        ? 'hidden'
        : 'visible',
    controllability: userControllable ? 'user' : 'automatic',
    selectionGroups: userControllable ? selectionGroupsForCondition(projectionCondition) : [],
    decision: operationDecision(
      projectionCondition,
      projectionDecisionKey,
      projectionDecisionPlan,
      userControllable,
      decisionSelected,
      fallbackClass,
      fallbackAttribute,
    ),
    conditionDecision:
      projectionDecisionPlan.condition === 'userMayAssume'
        ? (choice?.conditionSatisfaction ?? 'evaluate')
        : 'none',
    explanation: {
      code,
      condition: projectionCondition.kind === 'always' ? null : projectionCondition,
    },
  };
}

function singleTargetPredicate(condition: ConditionExpression): TargetPredicate | null {
  if (condition.kind === 'targetPredicate' && condition.scope === 'target')
    return condition.present ? condition.predicate : null;
  if ((condition.kind === 'all' || condition.kind === 'any') && condition.expressions.length === 1)
    return singleTargetPredicate(condition.expressions[0]!);
  return null;
}

function requiredTargetPredicates(condition: ConditionExpression): TargetPredicate[] {
  if (condition.kind === 'targetPredicate' && condition.scope === 'target')
    return condition.present ? [condition.predicate] : [];
  if (condition.kind === 'all') return condition.expressions.flatMap(requiredTargetPredicates);
  if (condition.kind === 'any' && condition.expressions.length === 1)
    return requiredTargetPredicates(condition.expressions[0]!);
  return [];
}

function operationDecision(
  condition: ConditionExpression,
  decisionKey: string | null,
  decisionPlan: BattleOperation['decisionPlan'],
  userControllable: boolean,
  selected: boolean,
  fallbackClass: TargetClassContext,
  fallbackAttribute: TargetAttributeContext,
): EffectProjection['decision'] {
  if (!userControllable || decisionKey === null) return { state: 'none' };
  const predicate = singleTargetPredicate(condition);
  if (!predicate)
    return {
      state: selected ? 'enabled' : 'disabled',
      decisionKey,
      kind: 'effect',
      plan: decisionPlan,
      ...effectTargetContext(condition, fallbackClass, fallbackAttribute),
    };
  return {
    state: selected ? 'enabled' : 'disabled',
    decisionKey,
    kind: 'targetPredicate',
    target: predicate,
    fallbackClass: predicate.kind === 'classIdentity' ? fallbackClass : null,
    fallbackAttribute: predicate.kind === 'attributeIdentity' ? fallbackAttribute : null,
  };
}

function effectTargetContext(
  condition: ConditionExpression,
  fallbackClass: TargetClassContext,
  fallbackAttribute: TargetAttributeContext,
): Pick<Extract<EffectProjection['decision'], { kind: 'effect' }>, 'targetContext'> {
  const predicates = requiredTargetPredicates(condition);
  if (
    predicates.length === 0 ||
    fallbackClass.kind !== 'relative' ||
    fallbackAttribute.kind !== 'relative'
  )
    return {};
  return { targetContext: { predicates, fallbackClass, fallbackAttribute } };
}

export function projectAtDamageEvaluation(
  result: OperationResult,
  finalState: ExecutableBattleState,
): EffectProjection {
  const selectedVariant = finalState.noblePhantasmVariant.ref;
  const variantRefs = collectNoblePhantasmVariantConditions(result.operation.condition);
  if (
    variantRefs.length > 0 &&
    !variantRefs.some(
      (variant) =>
        variant.actorFormId === selectedVariant.actorFormId &&
        variant.noblePhantasmId === selectedVariant.noblePhantasmId,
    )
  )
    return {
      ...result.projection,
      outcome: 'impossible',
      visibility: 'hidden',
      controllability: 'automatic',
      decision: { state: 'none' },
      conditionDecision: 'none',
      explanation: { ...result.projection.explanation, code: 'conditionNotMet' },
    };
  if (
    result.operation.kind !== 'addModifier' ||
    result.operation.card === null ||
    result.operation.card === finalState.card
  )
    return result.projection;
  return {
    ...result.projection,
    outcome: 'impossible',
    visibility: 'hidden',
    controllability: 'automatic',
    decision: { state: 'none' },
    conditionDecision: 'none',
    explanation: { ...result.projection.explanation, code: 'cardMismatch' },
  };
}

function collectNoblePhantasmVariantConditions(
  condition: ConditionExpression,
): Extract<ConditionExpression, { kind: 'noblePhantasmVariant' }>['variant'][] {
  if (condition.kind === 'noblePhantasmVariant') return [condition.variant];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(collectNoblePhantasmVariantConditions);
  if (condition.kind === 'not') return collectNoblePhantasmVariantConditions(condition.expression);
  return [];
}

function traitScopeForActor(actorScope: 'attacker' | 'target', stateOnly: boolean): TraitScope {
  if (!stateOnly) return actorScope;
  return actorScope === 'target' ? 'targetState' : 'attackerState';
}

export function traitCountProjections(
  noblePhantasmVariantKey: string,
  damage: NpDamageSpec,
  overcharge: number,
  selectedNpLevel: number,
  source: OperationSource,
  sourceName: string,
  skillName: string,
): EffectProjection[] {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[selectedNpLevel - 1];
  if (damage.kind !== 'traitCount' || (item?.targetId !== 0 && item?.targetId !== 1)) return [];
  const actorScope = item.targetId === 1 ? 'target' : 'attacker';
  const valuePermille = (item.secondaryValuePermille ?? 1_000) + (item.correctionPermille ?? 0);
  return (item.targetTraits ?? []).map((trait) => {
    const predicateKey =
      trait.kind === 'targetPredicate'
        ? trait.predicate.kind === 'classIdentity'
          ? `class:${trait.predicate.classId}`
          : trait.predicate.kind === 'attributeIdentity'
            ? `attribute:${trait.predicate.attribute}`
            : `family:${trait.predicate.familyId}`
        : `trait:${trait.name}`;
    const projectionKey = `np:${noblePhantasmVariantKey}:${damage.functionId}:${predicateKey}`;
    const traitScope =
      trait.kind === 'trait'
        ? traitScopeForActor(actorScope, damage.stateTraitNames.includes(trait.name))
        : actorScope;
    const condition: ConditionExpression =
      trait.kind === 'targetPredicate'
        ? {
            kind: 'targetPredicate',
            scope: actorScope,
            predicate: trait.predicate,
            present: true,
          }
        : {
            kind: 'trait',
            scope: traitScope,
            trait: trait.name,
            present: true,
          };
    return {
      projectionKey,
      operationId: `np:${noblePhantasmVariantKey}:${damage.functionId}:damage`,
      label: '特攻宝具',
      sourceName,
      skillName,
      gameActivation: 'npBeforeDamage',
      sourceActive: true,
      proc: { kind: 'guaranteed' },
      procRatePermille: 1_000,
      valuePermille,
      value: valuePermille / 1_000,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'npSpecial',
      source,
      contributionScope: 'personal',
      contributionControl: 'worldAssumption',
      activationSources: [],
      executionSupport: 'supported',
      outcome: 'applied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: selectionGroupsForCondition(condition),
      decision:
        trait.kind === 'targetPredicate'
          ? {
              state: 'disabled' as const,
              decisionKey: projectionKey,
              kind: 'targetPredicate' as const,
              target: trait.predicate,
              fallbackClass: null,
              fallbackAttribute: null,
            }
          : {
              state: 'disabled' as const,
              decisionKey: projectionKey,
              kind: 'worldFact' as const,
              fact: {
                kind: 'trait' as const,
                scope: traitScope,
                trait: trait.name,
                present: true,
              },
            },
      conditionDecision: 'none',
      explanation: {
        code: 'applied',
        condition,
      },
    };
  });
}
