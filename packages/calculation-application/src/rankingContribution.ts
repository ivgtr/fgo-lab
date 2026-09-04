import type { EffectProjection, EffectiveContributionSet } from '@fgo-lab/battle-execution';
import { isAreaDamageContribution, isAttackerDamageContribution } from './contributionPolicy';

export function contributionsForEffect(
  effect: EffectProjection,
  effective: EffectiveContributionSet,
) {
  return effective.contributions.filter(
    (contribution) => contribution.contributionId === effect.contributionId,
  );
}

export function rankingEffectContributes(
  effect: EffectProjection,
  effective: EffectiveContributionSet,
): boolean {
  return (
    effect.outcome === 'applied' &&
    contributionsForEffect(effect, effective).some((contribution) => contribution.effective)
  );
}

export function contributesToAttackerDamage(effect: EffectProjection): boolean {
  return isAttackerDamageContribution(effect);
}

export function contributesAreaSupport(effect: EffectProjection): boolean {
  return isAttackerDamageContribution(effect) && isAreaDamageContribution(effect);
}

export function isSpecialAttack(effect: EffectProjection): boolean {
  return effect.modifier === 'powerMod' || effect.modifier === 'npSpecial';
}
