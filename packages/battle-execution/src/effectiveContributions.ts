import type {
  BattleOperation,
  EffectProjection,
  OperationOutcome,
  OperationResult,
} from './contracts';
import type {
  ContributionApplicationPolicy,
  ContributionPolicyDecision,
  EffectiveContribution,
  EffectiveContributionSet,
} from './executionTypes';
import { contributionId } from './contributionIdentity';
import { procIsGuaranteed, type ConditionRead } from './conditionRead';
import type { DamageResolutionInput } from '@fgo-lab/schema';

const included = (): ContributionPolicyDecision => ({ kind: 'included' });
const excluded = (
  reason: Extract<ContributionPolicyDecision, { kind: 'excluded' }>['reason'],
): ContributionPolicyDecision => ({ kind: 'excluded', reason });

export function contributionPolicyDecisions(
  operation: Pick<BattleOperation, 'source' | 'gameActivation' | 'contributionScope'>,
  read: ConditionRead,
  policy: ContributionApplicationPolicy,
  activationGuaranteed: boolean,
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
      (read.certainty !== 'guaranteed' || !activationGuaranteed)
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
  read: ConditionRead,
  policy: ContributionApplicationPolicy,
): boolean {
  if (
    operation.kind !== 'addModifier' &&
    operation.kind !== 'changeModifierRate' &&
    operation.kind !== 'ignoreDefense' &&
    operation.kind !== 'ignoreDamageCut' &&
    operation.kind !== 'executeNpDamage'
  )
    return true;
  return Object.values(
    contributionPolicyDecisions(
      operation,
      read,
      policy,
      procIsGuaranteed(operation.proc, operation.procRatePermille),
    ),
  ).every((decision) => decision.kind === 'included');
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
  read: ConditionRead,
  outcome: OperationOutcome,
  policy: ContributionApplicationPolicy,
): EffectiveContribution {
  const policyDecisions = contributionPolicyDecisions(
    operation,
    read,
    policy,
    procIsGuaranteed(operation.proc, operation.procRatePermille),
  );
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
  result: Pick<
    OperationResult,
    'operation' | 'outcome' | 'projection' | 'conditionRead' | 'damageDependencyRead'
  >,
  damageInput: DamageResolutionInput,
  finalProjections: readonly EffectProjection[],
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): EffectiveContribution[] {
  const { operation, outcome, projection, conditionRead, damageDependencyRead } = result;
  if (operation.kind === 'addModifier')
    return [
      contribution(
        operation,
        'modifier',
        operation.modifier,
        projection.valuePermille,
        conditionRead,
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
        conditionRead,
        outcome,
        policy,
      ),
    ];
  if (operation.kind === 'ignoreDefense' || operation.kind === 'ignoreDamageCut')
    return [contribution(operation, 'ignore', operation.kind, 1, conditionRead, outcome, policy)];
  if (operation.kind !== 'executeNpDamage') return [];
  if (outcome === 'applied' && damageDependencyRead === null)
    throw new TypeError('missing_applied_np_dependency_read');
  // A trait-count NP can expose several world-assumption projections for one
  // damage operation. Its operation projection reports the base NP execution;
  // the resolved special input reports whether that shared contribution reached damage.
  const worldAssumptionProjections = finalProjections.filter(
    (item) =>
      item.operationId === operation.operationId &&
      item.contributionId === contributionId(operation.operationId, 'npSpecial') &&
      item.contributionControl === 'worldAssumption',
  );
  const specialOutcome =
    operation.damage.kind === 'traitCount' && worldAssumptionProjections.length > 0
      ? worldAssumptionProjections.some((item) => item.outcome === 'unsupported')
        ? 'unsupported'
        : worldAssumptionProjections.some((item) => item.outcome === 'applied') &&
            damageInput.npSpecialMultipliers.some((multiplier) => multiplier !== 1)
          ? 'applied'
          : 'notApplied'
      : projection.outcome;
  return [
    contribution(operation, 'npBase', null, null, conditionRead, outcome, policy),
    ...(operation.specialAttackDependency.kind === 'always'
      ? []
      : [
          contribution(
            operation,
            'npSpecial',
            'npSpecial',
            projection.valuePermille,
            outcome === 'applied' ? damageDependencyRead! : conditionRead,
            specialOutcome,
            policy,
          ),
        ]),
  ];
}

export function createEffectiveContributionSet(
  operations: readonly Pick<
    OperationResult,
    'operation' | 'outcome' | 'projection' | 'state' | 'conditionRead' | 'damageDependencyRead'
  >[],
  damageInput: DamageResolutionInput,
  finalProjections: readonly EffectProjection[],
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
): EffectiveContributionSet {
  const contributions = operations.flatMap((result) =>
    effectiveContributionsForOperation(result, damageInput, finalProjections, policy),
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
