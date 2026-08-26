import type {
  CanonicalTargetPolicy,
  EffectExecutionOperation,
  MasterEffect,
} from '@fgo-lab/master-data';
import type { OperationSource } from './contracts';

export type Origin = OperationSource['origin'];
export type Recipient = 'attacker' | 'target';

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
    if (operation.kind === 'cardTypeMutation' || operation.kind === 'unresolved')
      return recipient !== null;
    return (
      recipient === operation.expectedRecipient ||
      (recipient !== null && operation.targetMismatch === 'unsupported')
    );
  });
}
