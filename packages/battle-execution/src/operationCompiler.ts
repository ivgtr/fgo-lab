import type {
  ActorCountPredicate,
  CanonicalInputDefinition,
  CanonicalEffectContributionScope,
  EffectExecutionOperation,
  MasterEffect,
  ModifierValueExpression,
} from '@fgo-lab/master-data';
import type {
  BattleOperation,
  ConditionExpression,
  EffectProjection,
  OperationModifierValueExpression,
  OperationSource,
  TraitScope,
} from './contracts';
import {
  combineConditions,
  conditionRequiresQuantity,
  containsUnsupportedCondition,
  normalizeTraitCondition,
  requiresUserAssumption,
} from './condition';
import {
  canNormalizeDamageEffect,
  operationRecipient,
  resolveContributionScope,
  resolveTargetPolicy,
  type Origin,
} from './effectRouting';
import type { SourceEffect } from './sourceCollection';
import { selectionGroupsForCondition } from './projection';

type ValuedOperation = Extract<
  EffectExecutionOperation,
  { kind: 'damageModifier' | 'modifierRateChange' }
>;

function runtimeInputKey(
  origin: Origin,
  sourceInstanceId: string,
  skillId: string,
  occurrenceId: string,
  key: string,
): string {
  if (key.startsWith('activation:'))
    return `source:${origin}:${sourceInstanceId}:${skillId}:${key}`;
  return key.startsWith('effect:')
    ? `source:${origin}:${sourceInstanceId}:${skillId}:${occurrenceId}:${key.slice('effect:'.length)}`
    : key;
}

function sourceHpInputKey(source: SourceEffect): string {
  return `source:${source.origin}:${source.sourceInstanceId}:hpPermille`;
}

function guaranteedPredicateCount(
  predicate: ActorCountPredicate | null,
  traits: ReadonlySet<string> | null,
): number {
  if (!predicate) return 0;
  const atomMatches = (
    atom:
      | { kind: 'trait'; trait: { name: string; negative: boolean } }
      | { kind: 'actorProperty'; property: 'inBattle' },
  ): boolean => {
    if (atom.kind === 'actorProperty') return true;
    if (!traits) return false;
    const present = traits.has(atom.trait.name);
    return atom.trait.negative ? !present : present;
  };
  if (predicate.counting === 'matchingTraits') return predicate.atoms.filter(atomMatches).length;
  return predicate.clauses.filter((clause) => clause.every(atomMatches)).length;
}

function resolveMatchingActorMinimum(
  source: SourceEffect,
  definition: Extract<CanonicalInputDefinition, { kind: 'matchingActorCount' }>,
): { minimum: number; defaultReason: string } {
  const { countSemantics } = definition;
  const sourceCount = ['allActors', 'allies'].includes(countSemantics.population)
    ? guaranteedPredicateCount(countSemantics.sourcePredicate, new Set(source.sourceTraits))
    : 0;
  const targetCount =
    countSemantics.population === 'enemies'
      ? guaranteedPredicateCount(countSemantics.otherPredicate, null)
      : 0;
  return {
    minimum: Math.min(definition.maximum, sourceCount + targetCount),
    defaultReason:
      sourceCount > 0 && targetCount > 0
        ? '攻撃役本人と現在の宝具対象から保証できる最低値'
        : sourceCount > 0
          ? '攻撃役本人を含む保証済み最低値'
          : targetCount > 0
            ? '現在の宝具対象1体を含む保証済み最低値'
            : '外部のactorを追加しない保証済み最低値',
  };
}

function runtimeInputDefinitions(source: SourceEffect) {
  const normalized = source.effect.inputDefinitions.map((definition) => {
    const derived =
      definition.kind === 'matchingActorCount'
        ? resolveMatchingActorMinimum(source, definition)
        : { minimum: definition.minimum, defaultReason: definition.defaultReason };
    return {
      ...definition,
      key: runtimeInputKey(
        source.origin,
        source.sourceInstanceId,
        source.skillId,
        source.effect.occurrenceId,
        definition.key,
      ),
      minimum: derived.minimum,
      ...(definition.kind === 'matchingActorCount'
        ? { defaultValue: derived.minimum, defaultReason: derived.defaultReason }
        : {}),
    };
  });
  const requiresSourceHp =
    !['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin) &&
    source.effect.execution.some((operation) => {
      if (operation.kind !== 'damageModifier' && operation.kind !== 'modifierRateChange')
        return false;
      const expression = selectedValueExpression(source, operation);
      return expression?.kind === 'inverseHpLinear' || expression?.kind === 'hpRangeLinear';
    });
  return requiresSourceHp
    ? [
        ...normalized,
        {
          key: sourceHpInputKey(source),
          kind: 'sourceHpPermille' as const,
          owner: 'source' as const,
          label: `${source.sourceName}のHP割合（%）`,
          description: '効果を使用する支援元の現在HP割合',
          minimum: 0,
          maximum: 1_000,
          step: 10,
          defaultValue: 1_000,
          defaultReason: '支援元の初期HPは100%として扱う',
        },
      ]
    : normalized;
}

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
    ...effect.conditions.recipient.map((condition) =>
      normalizeTraitCondition(condition, holder, effect.traitReadPolicy),
    ),
    normalizeTraitCondition(effect.conditions.holder, holder, effect.traitReadPolicy),
    normalizeTraitCondition(effect.conditions.opponent, opponent, effect.traitReadPolicy),
    normalizeTraitCondition(effect.conditions.field, 'field', effect.traitReadPolicy),
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
    ...effect.inputQuantityConditions.map<ConditionExpression>((condition) => ({
      kind: 'inputQuantity',
      ...condition,
      inputKey: runtimeInputKey(
        origin,
        sourceInstanceId,
        skillId,
        effect.occurrenceId,
        condition.inputKey,
      ),
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

function decisionPlan(condition: ConditionExpression) {
  return {
    activation: 'user' as const,
    condition: containsUnsupportedCondition(condition)
      ? ('unsupported' as const)
      : requiresUserAssumption(condition)
        ? ('userMayAssume' as const)
        : ('evaluate' as const),
  };
}

function signedModifierValueExpression(
  expression: OperationModifierValueExpression,
  sign: 1 | -1,
): OperationModifierValueExpression {
  return expression.kind === 'inverseHpLinear'
    ? {
        ...expression,
        basePermille: expression.basePermille * sign,
        bonusAtZeroHpPermille: expression.bonusAtZeroHpPermille * sign,
      }
    : expression.kind === 'hpRangeLinear'
      ? {
          ...expression,
          basePermille: expression.basePermille * sign,
          valueAtMinimumHpPermille: expression.valueAtMinimumHpPermille * sign,
          valueAtMaximumHpPermille: expression.valueAtMaximumHpPermille * sign,
        }
      : {
          ...expression,
          basePermille: expression.basePermille * sign,
          perUnitPermille: expression.perUnitPermille * sign,
          maximumValuePermille:
            expression.maximumValuePermille === null
              ? null
              : expression.maximumValuePermille * sign,
        };
}

function selectedValue(source: SourceEffect, operation: ValuedOperation): number | undefined {
  const sets = source.limitBreak ? operation.limitBreakValues : operation.values;
  if (!sets) return undefined;
  return sets[source.valueSetIndex]?.[source.valueIndex] ?? undefined;
}

function selectedValueExpression(
  source: SourceEffect,
  operation: ValuedOperation,
): OperationModifierValueExpression | null {
  const sets = source.limitBreak
    ? operation.limitBreakValueExpressions
    : operation.valueExpressions;
  if (!sets) return null;
  const expression = sets[source.valueSetIndex]?.[source.valueIndex] ?? null;
  if (!expression) return null;
  if (expression.kind === 'inputLinear')
    return {
      ...expression,
      inputKey: runtimeInputKey(
        source.origin,
        source.sourceInstanceId,
        source.skillId,
        source.effect.occurrenceId,
        expression.inputKey,
      ),
    };
  return {
    ...expression,
    quantitySource: ['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
      ? ({ kind: 'attackerHpPermille' } as const)
      : ({ kind: 'canonicalInput', inputKey: sourceHpInputKey(source) } as const),
  };
}

function decisionKey(source: SourceEffect): string {
  if (source.effect.interaction)
    return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:interaction:${source.effect.interaction.key}`;
  return `${source.origin}:${source.sourceInstanceId}:${source.skillId}:${source.effect.occurrenceId}`;
}

function operationKey(source: SourceEffect): string {
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
    ...(source.effect.stateIdentity === null
      ? {}
      : { transactionGroupId: `${source.skillId}:${source.effect.stateIdentity.key}` }),
  };
}

function baseOperation(
  source: SourceEffect,
  contributionScope: CanonicalEffectContributionScope,
  order: number,
  suffix: string,
) {
  const key = decisionKey(source);
  const identity = operationKey(source);
  const condition = effectCondition(
    source.effect,
    source.origin,
    source.sourceId,
    source.sourceInstanceId,
    source.skillId,
  );
  const plan = decisionPlan(condition);
  return {
    operationId: `${identity}:${suffix}`,
    order,
    phase:
      source.origin === 'passive' && condition.kind !== 'always'
        ? ('damageEvaluation' as const)
        : source.phase,
    source: sourceIdentity(source),
    contributionScope: resolveContributionScope(source.origin, contributionScope),
    activationSources: [],
    condition,
    decisionKey: key,
    decisionPlan: plan,
    sourceEnabled: source.sourceEnabled,
    enabledByDefault: source.enabledByDefault,
    gameActivation: source.effect.gameActivation,
    proc: source.effect.proc,
    procSelection:
      source.effect.procSelection.kind === 'successCount'
        ? {
            ...source.effect.procSelection,
            inputKey: runtimeInputKey(
              source.origin,
              source.sourceInstanceId,
              source.skillId,
              source.effect.occurrenceId,
              source.effect.procSelection.inputKey,
            ),
          }
        : source.effect.procSelection,
    procRatePermille:
      source.effect.proc.kind === 'guaranteed'
        ? 1_000
        : (source.effect.proc.ratePermille[source.valueSetIndex]?.[source.valueIndex] ?? null),
    activation: { kind: 'sourceDefault' as const },
    evidence: {
      rawPath: identity,
      functionId: source.effect.id,
    },
    presentation: {
      label: source.effect.label,
      sourceName: source.sourceName,
      skillName: source.skillName,
    },
    inputDefinitions: runtimeInputDefinitions(source),
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
      if (semantic.mutation === 'addQuantity' || semantic.scope === 'field' || recipient)
        applicable.push(semantic);
      continue;
    }
    if (semantic.kind === 'cardTypeMutation') {
      if (recipient) applicable.push(semantic);
      continue;
    }
    if (semantic.kind === 'unresolved') {
      if (semantic.damageRelevant && recipient) applicable.push(semantic);
      continue;
    }
    if (recipient === semantic.expectedRecipient) applicable.push(semantic);
    else if (recipient !== null && semantic.targetMismatch === 'unsupported')
      applicable.push({
        kind: 'unresolved',
        targetPolicy: semantic.targetPolicy,
        reason: 'operationSemantics',
        damageRelevant: true,
      });
  }

  const projectable = applicable.filter((semantic) => semantic.kind !== 'contextMutation');
  const primary = projectable.find((semantic) => semantic.kind !== 'unresolved');
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
  const missingValue = applicable.find(
    (semantic) =>
      (semantic.kind === 'damageModifier' || semantic.kind === 'modifierRateChange') &&
      selectedValue(source, semantic) === undefined,
  );
  if (missingValue?.kind === 'damageModifier' || missingValue?.kind === 'modifierRateChange') {
    unsupported.push(
      makeProjection(
        source,
        key,
        'unsupported',
        'unresolved',
        missingValue.modifier,
        null,
        selectedValueExpression(source, missingValue),
        condition,
      ),
    );
    return { operations, unsupported };
  }
  if (applicable.length === 0) {
    if (canNormalizeDamageEffect(source.effect, source.origin))
      unsupported.push(
        makeProjection(source, key, 'unsupported', 'unresolved', null, null, null, condition),
      );
    return { operations, unsupported };
  }

  const suffixCounts = new Map<string, number>();
  const uniqueSuffix = (suffix: string) => {
    const count = suffixCounts.get(suffix) ?? 0;
    suffixCounts.set(suffix, count + 1);
    return count === 0 ? suffix : `${suffix}:${String(count)}`;
  };
  for (const semantic of applicable) {
    const recipient = operationRecipient(semantic, source.origin);
    if (semantic.kind === 'contextMutation') {
      if (semantic.mutation === 'addQuantity') {
        operations.push({
          ...baseOperation(
            source,
            'personal',
            order++,
            uniqueSuffix(`quantity:${semantic.quantity}`),
          ),
          decisionKey: null,
          decisionPlan: { activation: 'automatic', condition: 'evaluate' },
          kind: 'addQuantity',
          quantity: semantic.quantity,
          subjectId: semantic.subjectId,
          amount: semantic.amount,
          applicationTiming: semantic.applicationTiming,
        });
        continue;
      }
      const scope =
        semantic.scope === 'field'
          ? 'field'
          : recipient === 'attacker'
            ? 'attackerState'
            : 'targetState';
      const suffixScope = semantic.scope === 'field' ? 'field' : recipient;
      const base = {
        ...baseOperation(
          source,
          semantic.contributionScope,
          order++,
          uniqueSuffix(`${semantic.mutation}-${String(suffixScope)}:${semantic.trait}`),
        ),
        decisionKey: null,
        decisionPlan: { activation: 'automatic' as const, condition: 'evaluate' as const },
        trait: semantic.trait,
      };
      if (semantic.mutation === 'suppressInitialTrait')
        operations.push({
          ...base,
          kind: 'suppressInitialTrait',
          scope: recipient === 'attacker' ? 'attacker' : 'target',
        });
      else operations.push({ ...base, kind: semantic.mutation, scope });
    } else if (semantic.kind === 'cardTypeMutation')
      operations.push({
        ...baseOperation(
          source,
          semantic.contributionScope,
          order++,
          uniqueSuffix(`card:${semantic.card}`),
        ),
        kind: 'changeCardType',
        card: semantic.card,
        stateTraits: semantic.stateTraits,
      });
    else if (semantic.kind === 'modifierRateChange')
      operations.push({
        ...baseOperation(source, semantic.contributionScope, order++, uniqueSuffix('rate')),
        kind: 'changeModifierRate',
        modifier: semantic.modifier,
        ratePermille: selectedValue(source, semantic)!,
      });
    else if (semantic.kind === 'ignoreDefense')
      operations.push({
        ...baseOperation(
          source,
          semantic.contributionScope,
          order++,
          uniqueSuffix('ignore-defense'),
        ),
        kind: 'ignoreDefense',
      });
    else if (semantic.kind === 'ignoreDamageCut')
      operations.push({
        ...baseOperation(
          source,
          semantic.contributionScope,
          order++,
          uniqueSuffix('ignore-damage-cut'),
        ),
        kind: 'ignoreDamageCut',
      });
    else if (semantic.kind === 'damageModifier') {
      const operationValue = selectedValue(source, semantic)!;
      const operationExpression = selectedValueExpression(source, semantic);
      operations.push({
        ...baseOperation(
          source,
          semantic.contributionScope,
          order++,
          uniqueSuffix(`modifier:${semantic.modifier}`),
        ),
        kind: 'addModifier',
        modifier: semantic.modifier,
        valuePermille: operationValue * semantic.sign,
        valueExpression: operationExpression
          ? signedModifierValueExpression(operationExpression, semantic.sign)
          : null,
        card: semantic.card,
      });
    }
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
  const plan = decisionPlan(condition);
  const requiresAttackerHp = conditionRequiresQuantity(condition, 'attackerHpPermille');
  return {
    projectionKey: key,
    operationId: operationKey(source),
    label: source.effect.label,
    sourceName: source.sourceName,
    skillName: source.skillName,
    gameActivation: source.effect.gameActivation,
    sourceActive: source.sourceEnabled,
    proc: source.effect.proc,
    procRatePermille:
      source.effect.proc.kind === 'guaranteed'
        ? 1_000
        : (source.effect.proc.ratePermille[source.valueSetIndex]?.[source.valueIndex] ?? null),
    valuePermille: modifier === 'flatDamage' ? null : valuePermille,
    value:
      valuePermille === null
        ? null
        : modifier === 'flatDamage'
          ? valuePermille
          : valuePermille / 1000,
    requiredQuantity: valueExpression || requiresAttackerHp ? 'attackerHpPermille' : null,
    requiredQuantityOwner: valueExpression
      ? ['attacker', 'passive', 'np', 'craftEssence'].includes(source.origin)
        ? 'attacker'
        : 'source'
      : requiresAttackerHp
        ? 'attacker'
        : null,
    requiredInputs: runtimeInputDefinitions(source),
    modifier,
    source: sourceIdentity(source),
    contributionScope: resolveContributionScope(
      source.origin,
      source.effect.execution.find(
        (
          operation,
        ): operation is Exclude<
          EffectExecutionOperation,
          | { kind: 'nonDamage' | 'unresolved' }
          | { kind: 'contextMutation'; mutation: 'addQuantity' }
        > => 'contributionScope' in operation,
      )?.contributionScope ?? 'personal',
    ),
    activationSources: [],
    executionSupport: 'unsupported',
    outcome: 'notApplied',
    visibility: 'visible',
    controllability: 'user',
    selectionGroups: selectionGroupsForCondition(condition),
    decision: {
      state: 'disabled',
      decisionKey: key,
      kind: 'effect',
      plan,
    },
    conditionDecision: plan.condition === 'userMayAssume' ? 'evaluate' : 'none',
    explanation: { code: 'disabled', condition },
  };
}
