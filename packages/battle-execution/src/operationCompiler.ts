import type { MasterEffect, ModifierValueExpression } from '@fgo-lab/master-data';
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
  changesAttackerNpCard,
  damageEffectRoute,
  targetRecipient,
  type Origin,
} from './effectRouting';
import type { SourceEffect } from './sourceCollection';

function effectCondition(
  effect: MasterEffect,
  origin: Origin,
  sourceId: string,
  sourceInstanceId: string,
  skillId: string,
): ConditionExpression {
  const recipient = targetRecipient(origin, effect.target) ?? 'attacker';
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
  for (const trait of source.effect.contextChanges.addedFieldTraits)
    operations.push({
      ...baseOperation(source, order++, `add-field:${trait}`),
      decisionKey: null,
      decisionPlan: { activation: 'automatic', condition: 'evaluate' },
      kind: 'addTrait',
      scope: 'field',
      trait,
    });
  for (const trait of source.effect.contextChanges.removedFieldTraits)
    operations.push({
      ...baseOperation(source, order++, `remove-field:${trait}`),
      decisionKey: null,
      decisionPlan: { activation: 'automatic', condition: 'evaluate' },
      kind: 'removeTrait',
      scope: 'field',
      trait,
    });
  const recipient = targetRecipient(source.origin, source.effect.target);
  if (recipient)
    for (const trait of source.effect.contextChanges.addedRecipientTraits)
      operations.push({
        ...baseOperation(source, order++, `add-${recipient}:${trait}`),
        decisionKey: null,
        decisionPlan: { activation: 'automatic', condition: 'evaluate' },
        kind: 'addTrait',
        scope: recipient === 'attacker' ? 'attackerState' : 'targetState',
        trait,
      });
  const routed = damageEffectRoute(source.effect, source.origin);
  const cardTypeChange = changesAttackerNpCard(source.effect, source.origin)
    ? source.effect.npCardTypeChange
    : null;
  const rateChange =
    source.effect.buffTypes?.includes('buffRate') &&
    source.effect.buffRateTargets?.includes('buffNpDamageUp');
  if (containsUnsupportedCondition(condition) && (routed || rateChange || cardTypeChange)) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        routed?.modifier ??
          (rateChange ? 'npDamageBuff' : cardTypeChange ? 'cardTypeChange' : null),
        source.rawValue ?? null,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (!routed && !rateChange && !cardTypeChange) {
    if (operations.length === 0 && canNormalizeDamageEffect(source.effect, source.origin))
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', null, null, condition),
      );
    return { operations, unsupported };
  }
  if (
    source.effect.parameterSemantics.unresolved.length ||
    source.effect.unresolvedSemanticKeys.length
  ) {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        routed?.modifier ?? (cardTypeChange ? 'cardTypeChange' : null),
        source.rawValue ?? null,
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (cardTypeChange) {
    operations.push({
      ...baseOperation(source, order++, `card:${cardTypeChange}`),
      kind: 'changeCardType',
      card: cardTypeChange,
      stateTraits: source.effect.npCardTypeStateTraits,
    });
  } else if (rateChange) {
    if (source.rawValue === undefined)
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', 'npDamageBuff', null, condition),
      );
    else
      operations.push({
        ...baseOperation(source, order++, 'rate'),
        kind: 'changeModifierRate',
        modifier: 'npDamageBuff',
        ratePermille: source.rawValue,
      });
  } else if (routed?.modifier === 'ignoreDefense')
    operations.push({ ...baseOperation(source, order++, 'ignore-defense'), kind: 'ignoreDefense' });
  else if (routed?.modifier === 'ignoreDamageCut')
    operations.push({
      ...baseOperation(source, order++, 'ignore-damage-cut'),
      kind: 'ignoreDamageCut',
    });
  else if (routed) {
    if (source.rawValue === undefined)
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', routed.modifier, null, condition),
      );
    else
      operations.push({
        ...baseOperation(source, order++, `modifier:${routed.modifier}`),
        kind: 'addModifier',
        modifier: routed.modifier,
        valuePermille: source.rawValue * routed.sign,
        valueExpression: source.valueExpression
          ? {
              ...signedModifierValueExpression(source.valueExpression, routed.sign),
              ...(['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
                ? {}
                : { subjectId: source.sourceId }),
            }
          : null,
        card:
          routed.modifier === 'cardBuff' || routed.modifier === 'cardResistance'
            ? (source.effect.cardTypes[0] ?? null)
            : null,
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
  rawValue: number | null,
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
    valuePermille: modifier === 'flatDamage' ? null : rawValue,
    value: rawValue === null ? null : modifier === 'flatDamage' ? rawValue : rawValue / 1000,
    requiredQuantity: source.valueExpression ? 'attackerHpPermille' : null,
    requiredQuantityOwner: source.valueExpression
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
