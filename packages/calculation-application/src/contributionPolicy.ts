import type {
  BattleOperation,
  ContributionApplicationPolicy,
  EffectProjection,
} from '@fgo-lab/battle-execution';
import type { RankingPolicyConditions } from './rankingContracts';

type ContributionItem = BattleOperation | EffectProjection;

export function isAttackerDamageContribution(operation: ContributionItem): boolean {
  const damageContribution =
    'kind' in operation ? operation.kind !== 'preserveSemanticEffect' : operation.modifier !== null;
  return (
    damageContribution &&
    ['attacker', 'passive', 'np'].includes(operation.source.origin) &&
    ['personal', 'partyWide', 'enemyApplied'].includes(operation.contributionScope)
  );
}

export function isAreaDamageContribution(operation: ContributionItem): boolean {
  return isAttackerDamageContribution(operation) && operation.contributionScope === 'partyWide';
}

export function compileRankingContributionPolicy(
  conditions: Pick<RankingPolicyConditions, 'selfBuffs' | 'conditionalEffects'>,
  areaView: 'included' | 'excluded' = 'included',
): ContributionApplicationPolicy {
  return {
    kind: 'ranking',
    selfBuffs: conditions.selfBuffs,
    conditionalEffects: conditions.conditionalEffects,
    areaView,
  };
}
