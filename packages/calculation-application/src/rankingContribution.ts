import type { DamageContributionProjection, EffectProjection } from '@fgo-lab/battle-execution';
import { stateTraitsRequiredByCondition } from './conditionProvenance';

export type RankingContributionPolicyState = 'included' | 'excludedByRankingPolicy';

export function resolveRankingEffectContribution(
  effect: EffectProjection,
  projection: DamageContributionProjection,
): RankingContributionPolicyState {
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
  return 'included';
}

export function rankingEffectContributes(
  effect: EffectProjection,
  projection: DamageContributionProjection,
): boolean {
  return (
    effect.outcome === 'applied' &&
    resolveRankingEffectContribution(effect, projection) === 'included'
  );
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
