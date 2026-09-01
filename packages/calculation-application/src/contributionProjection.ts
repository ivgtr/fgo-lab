import type { BattleOperation, DamageContributionProjection } from '@fgo-lab/battle-execution';

export interface DamageContributionPolicy {
  selfSkill: 'included' | 'excluded';
  area: 'included' | 'excluded';
}

type ContributionItem = Pick<BattleOperation, 'source' | 'contributionScope'>;

export function isAttackerDamageContribution(operation: ContributionItem): boolean {
  return (
    ['attacker', 'passive', 'np'].includes(operation.source.origin) &&
    ['personal', 'partyWide', 'enemyApplied'].includes(operation.contributionScope)
  );
}

function isVoluntarySelfSkill(operation: BattleOperation): boolean {
  return operation.source.origin === 'attacker' && operation.gameActivation === 'skillUse';
}

export function isAreaDamageContribution(operation: ContributionItem): boolean {
  return operation.contributionScope === 'partyWide';
}

export function compileDamageContributionProjection(
  operations: readonly BattleOperation[],
  policy: DamageContributionPolicy,
): DamageContributionProjection {
  const eligible = operations.filter(isAttackerDamageContribution);
  const included = eligible.filter(
    (operation) =>
      (policy.selfSkill === 'included' || !isVoluntarySelfSkill(operation)) &&
      (policy.area === 'included' || !isAreaDamageContribution(operation)),
  );
  const includedIds = new Set(included.map(({ operationId }) => operationId));
  return {
    includedOperationIds: includedIds,
    excludedOperationIds: new Set(
      eligible
        .filter(({ operationId }) => !includedIds.has(operationId))
        .map(({ operationId }) => operationId),
    ),
    excludedStateTraitContributions: {
      attackerState: new Set(),
      targetState: new Set(),
    },
  };
}
