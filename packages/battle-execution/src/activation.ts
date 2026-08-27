import type { BattleOperation, ConditionExpression, EffectDecision, TraitScope } from './contracts';

function choiceKeys(expression: ConditionExpression): string[] {
  if (expression.kind === 'choice') return [`${expression.group}:${expression.candidate}`];
  if (expression.kind === 'all' || expression.kind === 'any')
    return expression.expressions.flatMap(choiceKeys);
  return expression.kind === 'not' ? choiceKeys(expression.expression) : [];
}

function conditionIsActivationLocal(expression: ConditionExpression): boolean {
  if (
    expression.kind === 'always' ||
    expression.kind === 'choice' ||
    expression.kind === 'sourceQuantity' ||
    expression.kind === 'operationTrigger'
  )
    return true;
  if (expression.kind === 'all') return expression.expressions.every(conditionIsActivationLocal);
  return false;
}

export function conditionRequiresTrait(
  expression: ConditionExpression,
  scope: TraitScope,
  trait: string,
  present: boolean,
  negated = false,
): boolean {
  if (expression.kind === 'trait') {
    const effectivePresent = negated ? !expression.present : expression.present;
    if (effectivePresent !== present || expression.trait !== trait) return false;
    if (scope === 'field') return expression.scope === 'field';
    if (scope === 'attackerState')
      return present
        ? expression.scope === 'attacker' || expression.scope === 'attackerState'
        : expression.scope === 'attackerState';
    if (scope === 'targetState')
      return present
        ? expression.scope === 'target' || expression.scope === 'targetState'
        : expression.scope === 'targetState';
    return expression.scope === scope;
  }
  if (expression.kind === 'not')
    return conditionRequiresTrait(expression.expression, scope, trait, present, !negated);
  if (expression.kind !== 'all' && expression.kind !== 'any') return false;
  const conjunction = (expression.kind === 'all') !== negated;
  return conjunction
    ? expression.expressions.some((child) =>
        conditionRequiresTrait(child, scope, trait, present, negated),
      )
    : expression.expressions.length > 0 &&
        expression.expressions.every((child) =>
          conditionRequiresTrait(child, scope, trait, present, negated),
        );
}

export function planOperationActivations(
  operations: readonly BattleOperation[],
): BattleOperation[] {
  const decisionOperations = operations.filter(
    (operation): operation is BattleOperation & { decisionKey: string } =>
      operation.decisionKey !== null,
  );
  return operations.map((operation) => {
    if (
      operation.decisionKey !== null ||
      (operation.kind !== 'addTrait' &&
        operation.kind !== 'removeTrait' &&
        operation.kind !== 'suppressInitialTrait' &&
        operation.kind !== 'addQuantity')
    )
      return operation;
    const operationChoices = choiceKeys(operation.condition);
    if (operationChoices.length === 0 && operation.source.origin !== 'attacker') return operation;
    const present = operation.kind === 'addTrait';
    const links = decisionOperations.flatMap((candidate) => {
      const candidateChoices = choiceKeys(candidate.condition);
      const sameSkill =
        candidate.source.sourceInstanceId === operation.source.sourceInstanceId &&
        candidate.source.skillId === operation.source.skillId &&
        (operationChoices.length === 0 ||
          operationChoices.some((choice) => candidateChoices.includes(choice)));
      const prerequisite =
        operation.kind === 'addQuantity' || operation.kind === 'suppressInitialTrait'
          ? false
          : conditionRequiresTrait(candidate.condition, operation.scope, operation.trait, present);
      if (!sameSkill && !prerequisite) return [];
      return [
        {
          decisionKey: candidate.decisionKey,
          reason: prerequisite ? ('traitPrerequisite' as const) : ('sourceSkill' as const),
          selection:
            operationChoices.length > 0 &&
            conditionIsActivationLocal(operation.condition) &&
            candidate.decisionPlan.condition === 'userMayAssume'
              ? ('conditionSatisfied' as const)
              : candidate.decisionPlan.activation === 'user'
                ? ('operationEnabled' as const)
                : ('conditionSatisfied' as const),
        },
      ];
    });
    if (links.length === 0) return operation;
    return {
      ...operation,
      activation: {
        kind: 'linkedDecisions',
        links: [
          ...new Map(
            links.map((link) => [`${link.decisionKey}:${link.reason}:${link.selection}`, link]),
          ).values(),
        ],
      },
    };
  });
}

export function resolveOperationActivation(
  operation: BattleOperation,
  decisions: ReadonlyMap<string, EffectDecision>,
): {
  enabled: boolean;
  activeDecisionKeys: readonly string[];
  assumesLocalCondition: boolean;
} {
  if (operation.activation.kind === 'sourceDefault') {
    const choice = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
    return {
      enabled:
        operation.sourceEnabled && operation.decisionPlan.activation === 'automatic'
          ? operation.enabledByDefault
          : operation.sourceEnabled && (choice?.operationEnabled ?? operation.enabledByDefault),
      activeDecisionKeys:
        choice?.operationEnabled && operation.decisionKey ? [operation.decisionKey] : [],
      assumesLocalCondition: false,
    };
  }
  const activeLinks = operation.activation.links.filter((link) => {
    const decision = decisions.get(link.decisionKey);
    return link.selection === 'operationEnabled'
      ? decision?.operationEnabled === true
      : decision?.operationEnabled === true && decision.conditionSatisfaction === 'assumeSatisfied';
  });
  return {
    enabled: operation.sourceEnabled && activeLinks.length > 0,
    activeDecisionKeys: [...new Set(activeLinks.map((link) => link.decisionKey))],
    assumesLocalCondition:
      activeLinks.some((link) => link.selection === 'conditionSatisfied') &&
      conditionIsActivationLocal(operation.condition),
  };
}
