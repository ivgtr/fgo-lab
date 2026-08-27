import type { EffectProjection } from '@fgo-lab/battle-execution';

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
