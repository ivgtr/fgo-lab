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
import { classifyContributionCondition } from './conditionSemantics';
import { contributionId } from './contributionIdentity';
import type { ConditionEvaluationState } from './condition';

const included = (): ContributionPolicyDecision => ({ kind: 'included' });
const excluded = (
  reason: Extract<ContributionPolicyDecision, { kind: 'excluded' }>['reason'],
): ContributionPolicyDecision => ({ kind: 'excluded', reason });

export function contributionPolicyDecisions(
  operation: Pick<BattleOperation, 'source' | 'gameActivation' | 'contributionScope'>,
  condition: ConditionExpression,
  policy: ContributionApplicationPolicy,
  state?: ConditionEvaluationState,
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
      policy.conditionalEffects === 'baseline' &&
      ['conditional', 'unsupported'].includes(
        classifyContributionCondition(
          condition,
          state
            ? {
                card: state.card,
                noblePhantasmVariant: state.noblePhantasmVariant.ref,
                attackerTraits: state.traits.attacker,
                activationFacts: state.activationContext,
              }
            : undefined,
        ),
      )
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
  state?: OperationResult['state'],
): boolean {
  if (
    operation.kind !== 'addModifier' &&
    operation.kind !== 'changeModifierRate' &&
    operation.kind !== 'ignoreDefense' &&
    operation.kind !== 'ignoreDamageCut' &&
    operation.kind !== 'executeNpDamage'
  )
    return true;
  return Object.values(contributionPolicyDecisions(operation, condition, policy, state)).every(
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
  state: OperationResult['state'],
): EffectiveContribution {
  const policyDecisions = contributionPolicyDecisions(operation, condition, policy, state);
  const policyIncluded = Object.values(policyDecisions).every(
    (decision) => decision.kind === 'included',
  );
  const groupId = presentationGroupId(operation);
  return {
    contributionId: contributionId(operation.operationId, component),
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
  result: Pick<OperationResult, 'operation' | 'outcome' | 'projection' | 'state'>,
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): EffectiveContribution[] {
  const { operation, outcome, projection, state } = result;
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
        state,
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
        state,
      ),
    ];
  if (operation.kind === 'ignoreDefense' || operation.kind === 'ignoreDamageCut')
    return [
      contribution(
        operation,
        'ignore',
        operation.kind,
        1,
        operation.condition,
        outcome,
        policy,
        state,
      ),
    ];
  if (operation.kind !== 'executeNpDamage') return [];
  return [
    contribution(operation, 'npBase', null, null, operation.condition, outcome, policy, state),
    ...(operation.specialAttackDependency.kind === 'always'
      ? []
      : [
          contribution(
            operation,
            'npSpecial',
            'npSpecial',
            projection.valuePermille,
            operation.specialAttackDependency,
            projection.outcome,
            policy,
            state,
          ),
        ]),
  ];
}

export function createEffectiveContributionSet(
  operations: readonly Pick<OperationResult, 'operation' | 'outcome' | 'projection' | 'state'>[],
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
