import type { MasterEffect } from '@fgo-lab/master-data';
import type { ModifierKind, OperationSource } from './contracts';

const NON_DAMAGE = new Set([
  'changeCommandCardType',
  'downTolerance',
  'upCriticaldamage',
  'upExtraattack',
  'upTolerance',
  'upToleranceSubstate',
]);
const POSSIBLY_DAMAGE = new Set([
  'attackBeforeFunction',
  'addSelfdamage',
  'buffRate',
  'downAtk',
  'downCommandall',
  'downNpdamage',
  'fieldIndividuality',
  'fieldIndividualityChangedFunction',
  'npattackPrevBuff',
  'subFieldIndividuality',
  'subIndividuality',
  'subSelfdamage',
  'tdTypeChange',
  'tdTypeChangeArts',
  'tdTypeChangeBuster',
  'tdTypeChangeQuick',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);
const ATTACK_REDUCTION = new Set(['downAtk', 'downCommandall', 'downNpdamage']);
const DEFENSIVE = new Set([
  'subSelfdamage',
  'upDefence',
  'upDefenceNpdamage',
  'upDefencecommandall',
]);

export type Origin = OperationSource['origin'];
export type Recipient = 'attacker' | 'target';

export interface DamageEffectRoute {
  modifier: ModifierKind | 'ignoreDefense' | 'ignoreDamageCut';
  recipient: Recipient;
  sign: 1 | -1;
}

export function targetRecipient(origin: Origin, target: string): Recipient | null {
  if (target.startsWith('enemy')) return 'target';
  if (target === 'self') return origin === 'support' || origin === 'mysticCode' ? null : 'attacker';
  if (target === 'ptOther' || target === 'ptOtherFull')
    return origin === 'support' ? 'attacker' : null;
  if (target === 'ptOne' || target === 'ptAll' || target === 'ptFull') return 'attacker';
  return null;
}

export function changesAttackerNpCard(effect: MasterEffect, origin: Origin): boolean {
  return (
    effect.npCardTypeChange !== null &&
    ['attacker', 'passive', 'craftEssence', 'np'].includes(origin) &&
    (effect.target === 'self' || effect.target === 'commandTypeSelfTreasureDevice')
  );
}

function rawRoute(effect: MasterEffect): Omit<DamageEffectRoute, 'recipient'> | null {
  const types = effect.buffTypes ?? [];
  if (types.some((type) => NON_DAMAGE.has(type))) return null;
  if (types.includes('pierceDefence')) return { modifier: 'ignoreDefense', sign: 1 };
  if (types.includes('pierceSubdamage')) return { modifier: 'ignoreDamageCut', sign: 1 };
  if (types.includes('addDamage')) return { modifier: 'flatDamage', sign: 1 };
  if (
    types.some((type) =>
      ['upDamage', 'upDamageIndividuality', 'upDamageIndividualityActiveonly'].includes(type),
    )
  )
    return { modifier: 'powerMod', sign: 1 };
  if (types.includes('upAtk')) return { modifier: 'attackBuff', sign: 1 };
  if (types.includes('downAtk')) return { modifier: 'attackBuff', sign: -1 };
  if (types.includes('downDefence')) return { modifier: 'attackBuff', sign: 1 };
  if (types.includes('upDefence')) return { modifier: 'defenseBuff', sign: 1 };
  if (types.includes('upNpdamage')) return { modifier: 'npDamageBuff', sign: 1 };
  if (types.includes('downNpdamage')) return { modifier: 'npDamageBuff', sign: -1 };
  if (types.includes('downDefenceNpdamage')) return { modifier: 'npDamageBuff', sign: 1 };
  if (types.includes('upDefenceNpdamage')) return { modifier: 'npResistance', sign: 1 };
  if (
    effect.cardTypes.length &&
    types.some((type) => ['upCommandall', 'upCommandatk'].includes(type))
  )
    return { modifier: 'cardBuff', sign: 1 };
  if (effect.cardTypes.length && types.includes('downCommandall'))
    return { modifier: 'cardBuff', sign: -1 };
  if (effect.cardTypes.length && types.includes('downDefencecommandall'))
    return { modifier: 'cardBuff', sign: 1 };
  if (effect.cardTypes.length && types.includes('upDefencecommandall'))
    return { modifier: 'cardResistance', sign: 1 };
  return null;
}

function expectedRecipient(effect: MasterEffect): Recipient {
  return (effect.buffTypes ?? []).some((type) =>
    [
      'downDefence',
      'upDefence',
      'downDefencecommandall',
      'upDefencecommandall',
      'downDefenceNpdamage',
      'upDefenceNpdamage',
    ].includes(type),
  )
    ? 'target'
    : 'attacker';
}

export function damageEffectRoute(effect: MasterEffect, origin: Origin): DamageEffectRoute | null {
  const value = rawRoute(effect);
  const recipient = targetRecipient(origin, effect.target);
  return value && recipient === expectedRecipient(effect) ? { ...value, recipient } : null;
}

export function canNormalizeDamageEffect(effect: MasterEffect, origin: Origin): boolean {
  if (effect.triggerScope !== null) return false;
  const recipient = targetRecipient(origin, effect.target);
  const types = effect.buffTypes ?? [];
  const potentiallyRelevant =
    !(effect.target.startsWith('enemy') && types.some((type) => ATTACK_REDUCTION.has(type))) &&
    !(!effect.target.startsWith('enemy') && types.some((type) => DEFENSIVE.has(type))) &&
    types.some((type) => POSSIBLY_DAMAGE.has(type));
  return Boolean(
    changesAttackerNpCard(effect, origin) ||
    damageEffectRoute(effect, origin) ||
    (recipient === 'attacker' &&
      effect.buffTypes?.includes('buffRate') &&
      effect.buffRateTargets?.includes('buffNpDamageUp')) ||
    (recipient && potentiallyRelevant),
  );
}
