import type { EffectControlViewModel } from './effectControls';

function isAttackerEffect(control: EffectControlViewModel): boolean {
  return ['attacker', 'passive', 'np'].includes(control.projection.source.origin);
}

export function contributesToPersonalDamage(control: EffectControlViewModel): boolean {
  return (
    isAttackerEffect(control) &&
    (control.projection.contributionScope === 'personal' ||
      control.projection.contributionScope === 'enemyApplied')
  );
}

export function contributesAreaSupport(control: EffectControlViewModel): boolean {
  return isAttackerEffect(control) && control.projection.contributionScope === 'partyWide';
}

export function isSpecialAttack(control: EffectControlViewModel): boolean {
  return control.projection.modifier === 'powerMod' || control.projection.modifier === 'npSpecial';
}
