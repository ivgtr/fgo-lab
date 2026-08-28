import type {
  CanonicalEffectContributionScope,
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
  policy: CanonicalTargetPolicy,
): Recipient | null {
  if (policy === 'enemy') return 'target';
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
  if (operation.kind === 'selectNoblePhantasmVariant' || operation.kind === 'transformActorForm')
    return origin === 'attacker' || origin === 'passive' ? 'attacker' : null;
  return operation.kind === 'nonDamage'
    ? null
    : resolveTargetPolicy(origin, operation.targetPolicy);
}

export function canNormalizeDamageEffect(effect: MasterEffect, origin: Origin): boolean {
  if (effect.triggerScope !== null) return false;
  return effect.execution.some((operation) => {
    if (operation.kind === 'nonDamage') return false;
    const recipient = operationRecipient(operation, origin);
    if (operation.kind === 'contextMutation') return operation.damageRelevant && recipient !== null;
    if (operation.kind === 'selectNoblePhantasmVariant' || operation.kind === 'transformActorForm')
      return recipient !== null;
    if (operation.kind === 'unresolved') return operation.damageRelevant && recipient !== null;
    return (
      recipient === operation.expectedRecipient ||
      (recipient !== null && operation.targetMismatch === 'unsupported')
    );
  });
}
