import { effectExecutesInNpProgram } from './npProgramScope';
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

/** Unknown resource targets cannot share the proven non-intersection result for another actor. */
export function resolveResourceTargetPolicy(
  origin: Origin,
  policy: CanonicalTargetPolicy,
): Recipient | 'unresolved' | null {
  return policy === 'unresolved' ? 'unresolved' : resolveTargetPolicy(origin, policy);
}

export function operationRecipient(
  operation: EffectExecutionOperation,
  origin: Origin,
): Recipient | null {
  if (operation.kind === 'contextMutation' && operation.mutation === 'addQuantity')
    return 'attacker';
  if (
    operation.kind === 'buffInstanceMutation' ||
    operation.kind === 'populationMutation' ||
    operation.kind === 'resourceMutation' ||
    operation.kind === 'stateMutation' ||
    operation.kind === 'boundedPhaseIrrelevant'
  )
    return null;
  if (operation.kind === 'unsupported') return resolveTargetPolicy(origin, operation.route.target);
  return resolveTargetPolicy(origin, operation.route.target);
}

export function canNormalizeDamageEffect(effect: MasterEffect, origin: Origin): boolean {
  if (!effectExecutesInNpProgram(effect)) return false;
  return effect.execution.some((operation) => {
    if (
      operation.kind === 'ocRemovalResistance' ||
      operation.kind === 'grantOcBoost' ||
      operation.kind === 'grantOcApplicationRate' ||
      operation.kind === 'removeOcState' ||
      operation.kind === 'ocStateNonIntersection' ||
      operation.kind === 'buffInstanceMutation' ||
      operation.kind === 'populationMutation' ||
      operation.kind === 'resourceMutation' ||
      operation.kind === 'stateMutation' ||
      operation.kind === 'boundedPhaseIrrelevant'
    )
      return false;
    const recipient = operationRecipient(operation, origin);
    if (operation.kind === 'unsupported') return operation.damageRelevant && recipient !== null;
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
