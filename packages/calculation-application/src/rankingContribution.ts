import type { DamageContributionProjection, EffectProjection } from '@fgo-lab/battle-execution';
import { stateTraitsRequiredByCondition } from './conditionProvenance';

export type EffectiveRankingContributionState =
  'contributing' | 'excludedByRankingPolicy' | 'conditionNotMet' | 'unsupported';

export function resolveRankingEffectContribution(
  effect: EffectProjection,
  projection: DamageContributionProjection,
): EffectiveRankingContributionState {
  if (effect.executionSupport === 'unsupported' || effect.outcome === 'unsupported')
    return 'unsupported';
  if (effect.outcome !== 'applied') return 'conditionNotMet';
  if (projection.excludedOperationIds.has(effect.operationId)) return 'excludedByRankingPolicy';
  for (const scope of ['attackerState', 'targetState'] as const) {
    const excludedTraits = projection.excludedStateTraitContributions[scope];
    if (
      stateTraitsRequiredByCondition(effect.explanation.condition, scope).some((trait) =>
        excludedTraits.has(trait),
      )
    )
      return 'excludedByRankingPolicy';
  }
  return 'contributing';
}

function isAttackerEffect(projection: EffectProjection): boolean {
  return ['attacker', 'passive', 'np'].includes(projection.source.origin);
}

export function contributesToAttackerDamage(projection: EffectProjection): boolean {
  return (
    isAttackerEffect(projection) &&
    (projection.contributionScope === 'personal' ||
      projection.contributionScope === 'partyWide' ||
      projection.contributionScope === 'enemyApplied')
  );
}

export function contributesAreaSupport(projection: EffectProjection): boolean {
  return isAttackerEffect(projection) && projection.contributionScope === 'partyWide';
}

export function isSpecialAttack(projection: EffectProjection): boolean {
  return projection.modifier === 'powerMod' || projection.modifier === 'npSpecial';
}
