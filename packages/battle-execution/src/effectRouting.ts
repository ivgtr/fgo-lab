import type {
  CanonicalEffectContributionScope,
  CanonicalEffectRoute,
  CanonicalTargetPolicy,
  EffectExecutionOperation,
  MasterEffect,
} from '@fgo-lab/master-data';
import type { EffectContributionScope, OperationSource } from './contracts';

export type Origin = OperationSource['origin'];
export type Recipient = 'attacker' | 'target';

export function resolveContributionScope(
  origin: Origin,
  scope: CanonicalEffectContributionScope,
): EffectContributionScope {
  if (origin === 'support' || origin === 'mysticCode') return 'external';
  if (origin === 'craftEssence') return 'personal';
  return scope;
}

export function resolveTargetPolicy(
  origin: Origin,
  policy: CanonicalTargetPolicy | CanonicalEffectRoute['target'],
): Recipient | null {
  if (policy === 'enemy') return 'target';
  if (policy === 'sourceActor')
    return origin === 'attacker' || origin === 'passive' || origin === 'np' ? 'attacker' : null;
  if (policy === 'sourceSelf')
    return origin === 'support' || origin === 'mysticCode' ? null : 'attacker';
  if (policy === 'partyOther') return origin === 'support' ? 'attacker' : null;
  if (policy === 'partyMember') return 'attacker';
  if (policy === 'attackerNpCard')
    return ['attacker', 'passive', 'craftEssence', 'np'].includes(origin) ? 'attacker' : null;
  return null;
}

export function operationRecipient(
  operation: EffectExecutionOperation,
  origin: Origin,
): Recipient | null {
  if (operation.kind === 'contextMutation' && operation.mutation === 'addQuantity')
    return 'attacker';
  if (operation.kind === 'nonDamage') return null;
  if (operation.kind === 'unresolved') return resolveTargetPolicy(origin, operation.route.target);
  return resolveTargetPolicy(origin, operation.route.target);
}

export function canNormalizeDamageEffect(effect: MasterEffect, origin: Origin): boolean {
  if (effect.triggerScope !== null) return false;
  return effect.execution.some((operation) => {
    if (operation.kind === 'nonDamage') return false;
    const recipient = operationRecipient(operation, origin);
    if (operation.kind === 'unresolved') return operation.damageRelevant && recipient !== null;
    if (operation.kind === 'contextMutation' && operation.mutation === 'addQuantity')
      return operation.damageRelevant;
    if (operation.kind === 'contextMutation' && !operation.damageRelevant) return false;
    if (operation.route.eligibility.kind === 'anyRecipient') return recipient !== null;
    return (
      recipient === operation.route.eligibility.recipient ||
      (recipient !== null && operation.route.eligibility.onMismatch === 'unsupported')
    );
  });
}
