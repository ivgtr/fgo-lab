import { activationFactKey, type ActivationFact, type ActivationSourceRef } from '@fgo-lab/schema';
import { conditionHasActivationFact } from './activation';
import type {
  ActivationContext,
  BattleOperation,
  ConditionExpression,
  EffectDecision,
  ExecutionIssue,
} from './contracts';

export type ActivationContextResult =
  | { status: 'valid'; context: ActivationContext }
  | { status: 'invalid'; issues: readonly ExecutionIssue[] };

export interface ActivationRequirementOwner {
  operationId: string;
  decisionKey: string | null;
  enabledByDefault: boolean;
  sourceEnabled: boolean;
  decisionPlan: BattleOperation['decisionPlan'];
  activation: BattleOperation['activation'];
  condition: ConditionExpression;
  facts: readonly ActivationFact[];
}

export function activationSourceRefForOperation(operation: BattleOperation): ActivationSourceRef {
  return {
    origin: operation.source.origin,
    sourceInstanceId: operation.source.sourceInstanceId,
    skillId: operation.source.skillId || null,
  };
}

export function activationChoiceGroupKey(source: ActivationSourceRef, family: string): string {
  return JSON.stringify([source.origin, source.sourceInstanceId, source.skillId, family]);
}

export function activationOperationTriggerKey(
  source: ActivationSourceRef,
  position: number,
): string {
  return JSON.stringify([source.origin, source.sourceInstanceId, source.skillId, position]);
}

export function activationSourceQuantityKey(
  source: ActivationSourceRef,
  quantity: 'battlePointRate',
  subjectId: string,
): string {
  return JSON.stringify([
    source.origin,
    source.sourceInstanceId,
    source.skillId,
    quantity,
    subjectId,
  ]);
}

function activationAtoms(expression: ConditionExpression): ActivationFact[] {
  if (
    expression.kind === 'choice' ||
    expression.kind === 'operationTrigger' ||
    expression.kind === 'sourceQuantity'
  )
    return [expression];
  if (expression.kind === 'all' || expression.kind === 'any')
    return expression.expressions.flatMap(activationAtoms);
  return expression.kind === 'not' ? activationAtoms(expression.expression) : [];
}

export function collectActivationRequirementOwners(
  operations: readonly BattleOperation[],
): ActivationRequirementOwner[] {
  return operations.flatMap((operation) => {
    const facts = activationAtoms(operation.condition);
    return facts.length === 0
      ? []
      : [
          {
            operationId: operation.operationId,
            decisionKey: operation.decisionKey,
            enabledByDefault: operation.enabledByDefault,
            sourceEnabled: operation.sourceEnabled,
            decisionPlan: operation.decisionPlan,
            activation: operation.activation,
            condition: operation.condition,
            facts,
          },
        ];
  });
}

export function activationRequirementOwnerSelected(
  owner: ActivationRequirementOwner,
  decisions: ReadonlyMap<string, EffectDecision>,
): boolean {
  if (!owner.sourceEnabled) return false;
  if (owner.activation.kind === 'linkedDecisions')
    return owner.activation.links.some(
      (link) => decisions.get(link.decisionKey)?.operationEnabled === true,
    );
  if (owner.decisionKey === null) return owner.enabledByDefault;
  const decision = decisions.get(owner.decisionKey);
  if (decision) return decision.operationEnabled;
  return owner.decisionPlan.condition === 'userMayAssume' ? false : owner.enabledByDefault;
}

function hasNegatedActivationRequirement(
  expression: ConditionExpression,
  negated = false,
): boolean {
  if (
    expression.kind === 'choice' ||
    expression.kind === 'operationTrigger' ||
    expression.kind === 'sourceQuantity'
  )
    return negated;
  if (expression.kind === 'not')
    return hasNegatedActivationRequirement(expression.expression, !negated);
  if (expression.kind === 'all' || expression.kind === 'any')
    return expression.expressions.some((child) => hasNegatedActivationRequirement(child, negated));
  return false;
}

export function evaluateActivationRequirement(
  expression: ConditionExpression,
  context: ActivationContext,
): boolean | null {
  if (expression.kind === 'choice') {
    const selected = context.choices.get(
      activationChoiceGroupKey(expression.source, expression.family),
    );
    return selected === undefined ? null : selected === expression.candidate;
  }
  if (expression.kind === 'operationTrigger')
    return context.operationTriggers.has(
      activationOperationTriggerKey(expression.source, expression.position),
    )
      ? true
      : null;
  if (expression.kind === 'sourceQuantity') {
    const range = context.sourceQuantityRanges.get(
      activationSourceQuantityKey(expression.source, expression.quantity, expression.subjectId),
    );
    if (!range) return null;
    const required =
      expression.comparison === 'atLeast'
        ? { min: expression.value, max: Number.MAX_SAFE_INTEGER }
        : { min: Number.MIN_SAFE_INTEGER, max: expression.value };
    if (range.max < required.min || range.min > required.max) return false;
    return range.min >= required.min && range.max <= required.max ? true : null;
  }
  if (expression.kind === 'all') {
    const values = expression.expressions.map((child) =>
      evaluateActivationRequirement(child, context),
    );
    return values.includes(false) ? false : values.every((value) => value === true) ? true : null;
  }
  if (expression.kind === 'any') {
    const values = expression.expressions.map((child) =>
      evaluateActivationRequirement(child, context),
    );
    return values.includes(true) ? true : values.every((value) => value === false) ? false : null;
  }
  if (expression.kind === 'not') {
    const value = evaluateActivationRequirement(expression.expression, context);
    return value === null ? null : !value;
  }
  return null;
}

function hasMissingMandatoryActivationFact(
  expression: ConditionExpression,
  context: ActivationContext,
): boolean {
  if (
    expression.kind === 'choice' ||
    expression.kind === 'operationTrigger' ||
    expression.kind === 'sourceQuantity'
  )
    return evaluateActivationRequirement(expression, context) === null;
  if (expression.kind === 'all')
    return expression.expressions.some((child) =>
      hasMissingMandatoryActivationFact(child, context),
    );
  if (expression.kind === 'any')
    return (
      expression.expressions.length > 0 &&
      expression.expressions.every((child) => hasMissingMandatoryActivationFact(child, context))
    );
  return expression.kind === 'not'
    ? hasMissingMandatoryActivationFact(expression.expression, context)
    : false;
}

function operationSelected(
  operation: BattleOperation,
  decisions: ReadonlyMap<string, EffectDecision>,
): boolean {
  return activationRequirementOwnerSelected(
    {
      operationId: operation.operationId,
      decisionKey: operation.decisionKey,
      enabledByDefault: operation.enabledByDefault,
      sourceEnabled: operation.sourceEnabled,
      decisionPlan: operation.decisionPlan,
      activation: operation.activation,
      condition: operation.condition,
      facts: [],
    },
    decisions,
  );
}

export function buildActivationContext(
  facts: readonly ActivationFact[],
  operations: readonly BattleOperation[],
  decisions: ReadonlyMap<string, EffectDecision>,
): ActivationContextResult {
  const issues: ExecutionIssue[] = [];
  const factKeys = new Set<string>();
  const choices = new Map<string, string>();
  const operationTriggers = new Set<string>();
  const sourceQuantityRanges = new Map<string, { min: number; max: number }>();
  const operationSources = new Set(
    operations.map((operation) => JSON.stringify(activationSourceRefForOperation(operation))),
  );
  const requirements = operations.flatMap((operation) => activationAtoms(operation.condition));
  let previousKey: string | undefined;
  for (const fact of facts) {
    const key = activationFactKey(fact);
    if (previousKey !== undefined && previousKey.localeCompare(key) > 0)
      issues.push({ kind: 'invalidActivationContext', detail: 'nonCanonicalOrder', factKey: key });
    previousKey = key;
    if (factKeys.has(key))
      issues.push({ kind: 'invalidActivationContext', detail: 'duplicateFact', factKey: key });
    factKeys.add(key);
    if (!operationSources.has(JSON.stringify(fact.source)))
      issues.push({ kind: 'invalidActivationContext', detail: 'unknownFact', factKey: key });
    else if (!requirements.some((requirement) => activationFactKey(requirement) === key))
      issues.push({ kind: 'invalidActivationContext', detail: 'orphanFact', factKey: key });
    if (fact.kind === 'choice') {
      const group = activationChoiceGroupKey(fact.source, fact.family);
      const selected = choices.get(group);
      if (selected !== undefined && selected !== fact.candidate)
        issues.push({
          kind: 'invalidActivationContext',
          detail: 'conflictingChoiceSelection',
          factKey: key,
        });
      else choices.set(group, fact.candidate);
    } else if (fact.kind === 'operationTrigger')
      operationTriggers.add(activationOperationTriggerKey(fact.source, fact.position));
    else {
      const rangeKey = activationSourceQuantityKey(fact.source, fact.quantity, fact.subjectId);
      const previous = sourceQuantityRanges.get(rangeKey) ?? {
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
      };
      const range =
        fact.comparison === 'atLeast'
          ? { min: Math.max(previous.min, fact.value), max: previous.max }
          : { min: previous.min, max: Math.min(previous.max, fact.value) };
      sourceQuantityRanges.set(rangeKey, range);
      if (range.min > range.max)
        issues.push({
          kind: 'invalidActivationContext',
          detail: 'conflictingSourceQuantityRange',
          factKey: key,
        });
    }
  }
  const context: ActivationContext = {
    facts: [...facts],
    factKeys,
    choices,
    operationTriggers,
    sourceQuantityRanges,
  };
  for (const operation of operations) {
    if (hasNegatedActivationRequirement(operation.condition))
      issues.push({
        kind: 'invalidActivationContext',
        detail: 'negatedActivationRequirement',
        operationId: operation.operationId,
      });
    if (
      operationSelected(operation, decisions) &&
      conditionHasActivationFact(operation.condition) &&
      evaluateActivationRequirement(operation.condition, context) !== false &&
      hasMissingMandatoryActivationFact(operation.condition, context)
    )
      issues.push({
        kind: 'invalidActivationContext',
        detail: 'missingRequiredFact',
        operationId: operation.operationId,
      });
  }
  return issues.length > 0 ? { status: 'invalid', issues } : { status: 'valid', context };
}

export function emptyActivationContext(): ActivationContext {
  return {
    facts: [],
    factKeys: new Set(),
    choices: new Map(),
    operationTriggers: new Set(),
    sourceQuantityRanges: new Map(),
  };
}
