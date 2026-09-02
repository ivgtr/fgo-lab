import type {
  BattleOperation,
  ConditionExpression,
  OperationOutcome,
  OperationResult,
} from './contracts';
import type {
  ContributionApplicationPolicy,
  ContributionPolicyDecision,
  EffectiveContribution,
  EffectiveContributionSet,
} from './executionTypes';

function conditionalRequirement(condition: ConditionExpression): boolean {
  if (
    condition.kind === 'always' ||
    condition.kind === 'card' ||
    condition.kind === 'noblePhantasmVariant' ||
    condition.kind === 'choice' ||
    condition.kind === 'operationTrigger'
  )
    return false;
  if (condition.kind === 'trait') return condition.scope !== 'attacker';
  if (condition.kind === 'targetPredicate' || condition.kind === 'traitCount') return true;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.some(conditionalRequirement);
  if (condition.kind === 'not') return conditionalRequirement(condition.expression);
  return true;
}

const included = (): ContributionPolicyDecision => ({ kind: 'included' });
const excluded = (
  reason: Extract<ContributionPolicyDecision, { kind: 'excluded' }>['reason'],
): ContributionPolicyDecision => ({ kind: 'excluded', reason });

function decisions(
  operation: BattleOperation,
  condition: ConditionExpression,
  policy: ContributionApplicationPolicy,
) {
  if (policy.kind === 'calculator')
    return {
      selfDecision: included(),
      conditionDecision: included(),
      areaViewDecision: included(),
    };
  const voluntarySelfSkill =
    operation.source.origin === 'attacker' && operation.gameActivation === 'skillUse';
  return {
    selfDecision:
      policy.selfBuffs === 'excluded' && voluntarySelfSkill
        ? excluded('selfBuffPolicy')
        : included(),
    conditionDecision:
      policy.conditionalEffects === 'baseline' && conditionalRequirement(condition)
        ? excluded('conditionalEffectPolicy')
        : included(),
    areaViewDecision:
      policy.areaView === 'excluded' && operation.contributionScope === 'partyWide'
        ? excluded('areaView')
        : included(),
  };
}

export function contributionIsIncluded(
  operation: BattleOperation,
  condition: ConditionExpression,
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): boolean {
  if (
    operation.kind !== 'addModifier' &&
    operation.kind !== 'changeModifierRate' &&
    operation.kind !== 'ignoreDefense' &&
    operation.kind !== 'ignoreDamageCut' &&
    operation.kind !== 'executeNpDamage'
  )
    return true;
  return Object.values(decisions(operation, condition, policy)).every(
    (decision) => decision.kind === 'included',
  );
}

function presentationGroupId(operation: BattleOperation): string {
  const source = operation.source;
  return [source.origin, source.sourceInstanceId, source.skillId, source.effectOccurrenceId].join(
    ':',
  );
}

function contribution(
  operation: BattleOperation,
  component: EffectiveContribution['component'],
  modifier: EffectiveContribution['modifier'],
  resolvedValue: number | null,
  condition: ConditionExpression,
  outcome: OperationOutcome,
  policy: ContributionApplicationPolicy,
): EffectiveContribution {
  const policyDecisions = decisions(operation, condition, policy);
  const policyIncluded = Object.values(policyDecisions).every(
    (decision) => decision.kind === 'included',
  );
  const groupId = presentationGroupId(operation);
  return {
    contributionId: `${operation.operationId}:${component}`,
    presentationGroupId: groupId,
    operationId: operation.operationId,
    component,
    modifier,
    resolvedValue,
    outputAddress: `damage.${component}`,
    source: operation.source,
    executionOutcome: outcome,
    ...policyDecisions,
    effective: outcome === 'applied' && policyIncluded,
    presentationCounted: component !== 'npBase',
  };
}

export function effectiveContributionsForOperation(
  result: Pick<OperationResult, 'operation' | 'outcome' | 'projection'>,
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): EffectiveContribution[] {
  const { operation, outcome, projection } = result;
  if (operation.kind === 'addModifier')
    return [
      contribution(
        operation,
        'modifier',
        operation.modifier,
        projection.valuePermille,
        operation.condition,
        outcome,
        policy,
      ),
    ];
  if (operation.kind === 'changeModifierRate')
    return [
      contribution(
        operation,
        'modifierRate',
        operation.modifier,
        operation.ratePermille,
        operation.condition,
        outcome,
        policy,
      ),
    ];
  if (operation.kind === 'ignoreDefense' || operation.kind === 'ignoreDamageCut')
    return [
      contribution(operation, 'ignore', operation.kind, 1, operation.condition, outcome, policy),
    ];
  if (operation.kind !== 'executeNpDamage') return [];
  return [
    contribution(operation, 'npBase', null, null, operation.condition, outcome, policy),
    ...(operation.specialAttackCondition.kind === 'always'
      ? []
      : [
          contribution(
            operation,
            'npSpecial',
            'npSpecial',
            projection.valuePermille,
            operation.specialAttackCondition,
            projection.outcome,
            policy,
          ),
        ]),
  ];
}

export function createEffectiveContributionSet(
  operations: readonly Pick<OperationResult, 'operation' | 'outcome' | 'projection'>[],
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): EffectiveContributionSet {
  const contributions = operations.flatMap((result) =>
    effectiveContributionsForOperation(result, policy),
  );
  return {
    contributions,
    effectivePresentationGroupIds: new Set(
      contributions.flatMap((item) =>
        item.effective && item.presentationCounted ? [item.presentationGroupId] : [],
      ),
    ),
  };
}
