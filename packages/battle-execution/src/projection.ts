import type { NpDamageSpec } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  BattleState,
  EffectDecision,
  EffectProjection,
  OperationResult,
  OperationSource,
} from './contracts';
import {
  canonicalExclusiveGroup,
  traitConditionConstraintScope,
  traitConstraintActorScope,
} from './conditionSemantics';
import { conditionRequiresQuantity } from './condition';

export function selectionGroupsForCondition(
  condition: EffectProjection['explanation']['condition'],
): EffectProjection['selectionGroups'] {
  if (!condition) return [];
  if (condition.kind === 'choice')
    return [{ groupKey: `choice:${condition.group}`, candidateKey: condition.candidate }];
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
  state: BattleState,
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
  enabled: boolean,
  condition: boolean | null,
  choice: EffectDecision | undefined,
  resolvedModifierValue: number | null,
  preserveSiblingChoice: boolean,
): EffectProjection {
  const operationRequiresAttackerHp = conditionRequiresQuantity(
    operation.condition,
    'attackerHpPermille',
  );
  const hidden =
    operation.kind === 'addTrait' ||
    operation.kind === 'removeTrait' ||
    operation.kind === 'suppressInitialTrait' ||
    operation.kind === 'addQuantity';
  const valuePermille =
    operation.kind === 'addModifier'
      ? resolvedModifierValue
      : operation.kind === 'changeModifierRate'
        ? operation.ratePermille
        : operation.kind === 'executeNpDamage' && operation.condition.kind !== 'always'
          ? (operation.damage.parametersByOvercharge[operation.overcharge - 1]?.[
              operation.selectedNpLevel - 1
            ]?.correctionPermille ?? null)
          : null;
  const modifier =
    operation.kind === 'addModifier' || operation.kind === 'changeModifierRate'
      ? operation.modifier
      : operation.kind === 'changeCardType'
        ? 'cardTypeChange'
        : operation.kind === 'executeNpDamage' && operation.condition.kind !== 'always'
          ? 'npSpecial'
          : operation.kind === 'ignoreDefense'
            ? 'ignoreDefense'
            : operation.kind === 'ignoreDamageCut'
              ? 'ignoreDamageCut'
              : null;
  const decisionSelected =
    operation.decisionPlan.activation === 'user'
      ? enabled
      : choice?.conditionSatisfaction === 'assumeSatisfied';
  const conditionSatisfiedInternally = condition === true;
  // A user-activated effect must remain reachable when another selected operation
  // makes its condition false. Selecting it may intentionally expose a typed
  // constraint conflict, and the user must still be able to switch the choice.
  const knownImpossibleBeforeSelection =
    condition === false &&
    choice === undefined &&
    !(
      (preserveSiblingChoice &&
        (operation.decisionPlan.activation === 'user' ||
          operation.decisionPlan.condition === 'userMayAssume')) ||
      (operation.inputDefinitions.length > 0 && operation.decisionPlan.activation === 'user')
    );
  const userControllable =
    !knownImpossibleBeforeSelection &&
    operation.decisionKey !== null &&
    (operation.decisionPlan.activation === 'user' ||
      (operation.decisionPlan.condition === 'userMayAssume' &&
        (!conditionSatisfiedInternally || choice !== undefined)));
  return {
    projectionKey: operation.decisionKey ?? operation.operationId,
    operationId: operation.operationId,
    label: operation.presentation.label,
    sourceName: operation.presentation.sourceName,
    skillName: operation.presentation.skillName,
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
    executionSupport: 'supported',
    outcome,
    visibility:
      hidden ||
      (knownImpossibleBeforeSelection &&
        !(operationRequiresAttackerHp && operation.decisionPlan.activation === 'automatic')) ||
      code === 'cardMismatch' ||
      (operation.kind === 'executeNpDamage' && operation.condition.kind === 'always')
        ? 'hidden'
        : 'visible',
    controllability: userControllable ? 'user' : 'automatic',
    selectionGroups: userControllable ? selectionGroupsForCondition(operation.condition) : [],
    decision:
      userControllable && operation.decisionKey
        ? {
            state: decisionSelected ? ('enabled' as const) : ('disabled' as const),
            decisionKey: operation.decisionKey,
            kind: 'effect' as const,
            plan: operation.decisionPlan,
          }
        : { state: 'none' },
    explanation: {
      code,
      condition: operation.condition.kind === 'always' ? null : operation.condition,
    },
  };
}

export function projectAtDamageEvaluation(
  result: OperationResult,
  finalState: BattleState,
): EffectProjection {
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
    explanation: { ...result.projection.explanation, code: 'cardMismatch' },
  };
}

export function traitCountProjections(
  attackerId: string,
  damage: NpDamageSpec,
  overcharge: number,
  selectedNpLevel: number,
  source: OperationSource,
  sourceName: string,
  skillName: string,
): EffectProjection[] {
  const item = damage.parametersByOvercharge[overcharge - 1]?.[selectedNpLevel - 1];
  if (damage.kind !== 'traitCount' || item?.targetId !== 1) return [];
  const valuePermille = (item.secondaryValuePermille ?? 1_000) + (item.correctionPermille ?? 0);
  return (item.targetTraits ?? []).map((trait) => {
    const projectionKey = `np:${attackerId}:${damage.functionId}:trait:${trait.id}`;
    return {
      projectionKey,
      operationId: `np:${attackerId}:${damage.functionId}:damage`,
      label: '特攻宝具',
      sourceName,
      skillName,
      valuePermille,
      value: valuePermille / 1_000,
      requiredQuantity: null,
      requiredQuantityOwner: null,
      requiredInputs: [],
      modifier: 'npSpecial',
      source,
      executionSupport: 'supported',
      outcome: 'applied',
      visibility: 'visible',
      controllability: 'user',
      selectionGroups: selectionGroupsForCondition({
        kind: 'trait',
        scope: 'target',
        trait: trait.name,
        present: true,
      }),
      decision: {
        state: 'disabled',
        decisionKey: projectionKey,
        kind: 'worldFact',
        fact: { kind: 'trait', scope: 'target', trait: trait.name, present: true },
      },
      explanation: {
        code: 'applied',
        condition: { kind: 'trait', scope: 'target', trait: trait.name, present: true },
      },
    };
  });
}
