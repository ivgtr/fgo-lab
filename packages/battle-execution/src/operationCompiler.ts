import type {
  EffectExecutionOperation,
  MasterEffect,
  ModifierValueExpression,
} from '@fgo-lab/master-data';
import type {
  BattleOperation,
  ConditionExpression,
  EffectProjection,
  OperationSource,
  TraitScope,
} from './contracts';
import {
  combineConditions,
  containsUnsupportedCondition,
  isConditional,
  normalizeTraitCondition,
} from './condition';
import {
  canNormalizeDamageEffect,
  operationRecipient,
  resolveTargetPolicy,
  type Origin,
} from './effectRouting';
import type { SourceEffect } from './sourceCollection';

type ValuedOperation = Extract<
  EffectExecutionOperation,
  { kind: 'damageModifier' | 'modifierRateChange' }
>;

function effectCondition(
  effect: MasterEffect,
  origin: Origin,
  sourceId: string,
  sourceInstanceId: string,
  skillId: string,
): ConditionExpression {
  const recipient = resolveTargetPolicy(origin, effect.conditionTargetPolicy) ?? 'attacker';
  const holder: TraitScope = recipient;
  const opponent: TraitScope = recipient === 'target' ? 'attacker' : 'target';
  return combineConditions([
    ...effect.conditions.recipient.map((condition) => normalizeTraitCondition(condition, holder)),
    normalizeTraitCondition(effect.conditions.holder, holder),
    normalizeTraitCondition(effect.conditions.opponent, opponent),
    normalizeTraitCondition(effect.conditions.field, 'field'),
    ...effect.quantityConditions.map<ConditionExpression>((condition) => {
      const currentAttackerSource = ['attacker', 'passive', 'np', 'craftEssence'].includes(origin);
      const subjectId =
        currentAttackerSource &&
        (condition.subjectId === undefined || condition.subjectId === sourceId)
          ? undefined
          : (condition.subjectId ?? sourceId);
      return {
        kind: 'quantity',
        quantity: condition.quantity,
        ...(subjectId === undefined ? {} : { subjectId }),
        comparison: condition.comparison,
        value: condition.value,
      };
    }),
    ...effect.sourceQuantityConditions.map<ConditionExpression>((condition) => ({
      kind: 'sourceQuantity',
      ...condition,
    })),
    ...(effect.choice
      ? [
          {
            kind: 'choice' as const,
            group: `${sourceInstanceId}:${skillId}:${effect.choice.family}`,
            candidate: String(effect.choice.candidate),
          },
        ]
      : []),
    ...(effect.operationTrigger
      ? [
          {
            kind: 'operationTrigger' as const,
            source: `${sourceInstanceId}:${skillId}`,
            position: effect.operationTrigger.position,
          },
        ]
      : []),
  ]);
}

function decisionPlan(source: SourceEffect, condition: ConditionExpression) {
  return {
    activation: ['attacker', 'support', 'mysticCode'].includes(source.origin)
      ? ('user' as const)
      : ('automatic' as const),
    condition: containsUnsupportedCondition(condition)
      ? ('unsupported' as const)
      : isConditional(condition)
        ? ('userMayAssume' as const)
        : ('evaluate' as const),
  };
}

function signedModifierValueExpression(
  expression: ModifierValueExpression,
  sign: 1 | -1,
): ModifierValueExpression {
  return expression.kind === 'inverseHpLinear'
    ? {
        ...expression,
        basePermille: expression.basePermille * sign,
        bonusAtZeroHpPermille: expression.bonusAtZeroHpPermille * sign,
      }
    : {
        ...expression,
        basePermille: expression.basePermille * sign,
        valueAtMinimumHpPermille: expression.valueAtMinimumHpPermille * sign,
        valueAtMaximumHpPermille: expression.valueAtMaximumHpPermille * sign,
      };
}

function selectedValue(source: SourceEffect, operation: ValuedOperation): number | undefined {
  const sets =
    source.limitBreak && operation.limitBreakValues ? operation.limitBreakValues : operation.values;
  return sets[source.valueSetIndex]?.[source.valueIndex] ?? undefined;
}

function selectedValueExpression(
  source: SourceEffect,
  operation: ValuedOperation,
): ModifierValueExpression | null {
  const sets =
    source.limitBreak && operation.limitBreakValueExpressions
      ? operation.limitBreakValueExpressions
      : operation.valueExpressions;
  return sets[source.valueSetIndex]?.[source.valueIndex] ?? null;
}

function decisionKey(source: SourceEffect): string {
  return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:${source.effect.occurrenceId}`;
}

function sourceIdentity(source: SourceEffect): OperationSource {
  return {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    sourceId: source.sourceId,
    skillId: source.skillId,
    effectId: source.effect.id,
    effectOccurrenceId: source.effect.occurrenceId,
  };
}

function baseOperation(source: SourceEffect, order: number, suffix: string) {
  const key = decisionKey(source);
  const condition = effectCondition(
    source.effect,
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  );
  const plan = decisionPlan(source, condition);
  return {
    operationId: `${key}:${suffix}`,
    order,
    phase:
      source.origin === 'passive' && condition.kind !== 'always'
        ? ('damageEvaluation' as const)
        : source.phase,
    source: sourceIdentity(source),
    condition,
    decisionKey: plan.activation === 'user' || plan.condition === 'userMayAssume' ? key : null,
    decisionPlan: plan,
    enabledByDefault: source.enabledByDefault,
    activation: { kind: 'sourceDefault' as const },
    evidence: { rawPath: key, functionId: source.effect.id, parameterKeys: [] },
    presentation: {
      label: source.effect.label,
      sourceName: source.sourceName,
      skillName: source.skillName,
    },
  };
}

export interface CompiledOperations {
  operations: BattleOperation[];
  unsupported: EffectProjection[];
}

export function compileEffect(source: SourceEffect, startOrder: number): CompiledOperations {
  const operations: BattleOperation[] = [];
  const unsupported: EffectProjection[] = [];
  if (source.effect.triggerScope !== null) return { operations, unsupported };
  const condition = effectCondition(
    source.effect,
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  );
  const key = decisionKey(source);
  let order = startOrder;
  const applicable: EffectExecutionOperation[] = [];

  for (const semantic of source.effect.execution) {
    if (semantic.kind === 'nonDamage') continue;
    const recipient = operationRecipient(semantic, source.origin);
    if (semantic.kind === 'contextMutation') {
      if (semantic.scope === 'field')
        operations.push({
          ...baseOperation(
            source,
            order++,
            `${semantic.mutation === 'addTrait' ? 'add' : 'remove'}-field:${semantic.trait}`,
          ),
          decisionKey: null,
          decisionPlan: { activation: 'automatic', condition: 'evaluate' },
          kind: semantic.mutation,
          scope: 'field',
          trait: semantic.trait,
        });
      else if (recipient)
        operations.push({
          ...baseOperation(
            source,
            order++,
            `${semantic.mutation === 'addTrait' ? 'add' : 'remove'}-${recipient}:${semantic.trait}`,
          ),
          decisionKey: null,
          decisionPlan: { activation: 'automatic', condition: 'evaluate' },
          kind: semantic.mutation,
          scope: recipient === 'attacker' ? 'attackerState' : 'targetState',
          trait: semantic.trait,
        });
      continue;
    }
    if (semantic.kind === 'cardTypeMutation' || semantic.kind === 'unresolved') {
      if (recipient) applicable.push(semantic);
      continue;
    }
    if (recipient === semantic.expectedRecipient) applicable.push(semantic);
    else if (recipient !== null && semantic.targetMismatch === 'unsupported')
      applicable.push({
        kind: 'unresolved',
        targetPolicy: semantic.targetPolicy,
        reason: 'operationSemantics',
      });
  }

  const primary = applicable.find((semantic) => semantic.kind !== 'unresolved');
  const unresolved = applicable.some(
    (semantic) =>
      semantic.kind === 'unresolved' ||
      ('semanticSupport' in semantic && semantic.semanticSupport === 'unresolved'),
  );
  const valued =
    primary?.kind === 'damageModifier' || primary?.kind === 'modifierRateChange' ? primary : null;
  const value = (valued ? selectedValue(source, valued) : null) ?? null;
  const valueExpression = valued ? selectedValueExpression(source, valued) : null;
  const projectionModifier =
    primary?.kind === 'damageModifier'
      ? primary.modifier
      : primary?.kind === 'modifierRateChange'
        ? primary.modifier
        : primary?.kind === 'cardTypeMutation'
          ? 'cardTypeChange'
          : null;

  if (containsUnsupportedCondition(condition) && primary) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        projectionModifier,
        value,
        valueExpression,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (unresolved) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        projectionModifier,
        value,
        valueExpression,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (!primary) {
    if (operations.length === 0 && canNormalizeDamageEffect(source.effect, source.origin))
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', null, null, null, condition),
      );
    return { operations, unsupported };
  }

  if (primary.kind === 'cardTypeMutation')
    operations.push({
      ...baseOperation(source, order++, `card:${primary.card}`),
      kind: 'changeCardType',
      card: primary.card,
      stateTraits: primary.stateTraits,
    });
  else if (primary.kind === 'modifierRateChange') {
    if (value === null)
      unsupported.push(
        makeProjection(
          source,
          key,
          'unsupported',
          'unresolved',
          'npDamageBuff',
          null,
          valueExpression,
          condition,
        ),
      );
    else
      operations.push({
        ...baseOperation(source, order++, 'rate'),
        kind: 'changeModifierRate',
        modifier: primary.modifier,
        ratePermille: value,
      });
  } else if (primary.kind === 'ignoreDefense')
    operations.push({ ...baseOperation(source, order++, 'ignore-defense'), kind: 'ignoreDefense' });
  else if (primary.kind === 'ignoreDamageCut')
    operations.push({
      ...baseOperation(source, order++, 'ignore-damage-cut'),
      kind: 'ignoreDamageCut',
    });
  else if (primary.kind === 'damageModifier') {
    if (value === null)
      unsupported.push(
        makeProjection(
          source,
          key,
          'unsupported',
          'unresolved',
          primary.modifier,
          null,
          valueExpression,
          condition,
        ),
      );
    else
      operations.push({
        ...baseOperation(source, order++, `modifier:${primary.modifier}`),
        kind: 'addModifier',
        modifier: primary.modifier,
        valuePermille: value * primary.sign,
        valueExpression: valueExpression
          ? {
              ...signedModifierValueExpression(valueExpression, primary.sign),
              ...(['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
                ? {}
                : { subjectId: source.sourceId }),
            }
          : null,
        card: primary.card,
      });
  }
  return { operations, unsupported };
}

function makeProjection(
  source: SourceEffect,
  key: string,
  outcome: EffectProjection['outcome'],
  code: EffectProjection['explanation']['code'],
  modifier: EffectProjection['modifier'],
  valuePermille: number | null,
  valueExpression: ModifierValueExpression | null,
  condition: ConditionExpression,
): EffectProjection {
  const plan = decisionPlan(source, condition);
  const userControllable = plan.activation === 'user' || plan.condition === 'userMayAssume';
  return {
    projectionKey: key,
    operationId: key,
    label: source.effect.label,
    sourceName: source.sourceName,
    skillName: source.skillName,
    valuePermille: modifier === 'flatDamage' ? null : valuePermille,
    value:
      valuePermille === null
        ? null
        : modifier === 'flatDamage'
          ? valuePermille
          : valuePermille / 1000,
    requiredQuantity: valueExpression ? 'attackerHpPermille' : null,
    requiredQuantityOwner: valueExpression
      ? ['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
        ? 'attacker'
        : 'source'
      : null,
    modifier,
    source: sourceIdentity(source),
    executionSupport: 'unsupported',
    outcome: userControllable ? 'notApplied' : outcome,
    visibility: 'visible',
    controllability: userControllable ? 'user' : 'automatic',
    decision: userControllable
      ? {
          state: 'disabled',
          decisionKey: key,
          kind: 'effect',
          plan,
        }
      : { state: 'none' },
    explanation: { code: userControllable ? 'disabled' : code, condition },
  };
}
