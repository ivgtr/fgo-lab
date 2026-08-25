import type { ActorScope, CanonicalExclusiveGroup, TraitScope } from './index';

export function traitConditionReadScopes(scope: TraitScope): readonly TraitScope[] {
  if (scope === 'attacker') return ['attacker', 'attackerState'];
  if (scope === 'target') return ['target', 'targetState'];
  return [scope];
}

export function impliedTraitConstraintScopes(
  scope: TraitScope,
  present: boolean,
): readonly TraitScope[] {
  if (!present) return [scope];
  if (scope === 'attackerState') return ['attackerState', 'attacker'];
  if (scope === 'targetState') return ['targetState', 'target'];
  return [scope];
}

function actorScopeForTrait(scope: TraitScope): ActorScope | 'field' {
  if (scope === 'attackerState') return 'attacker';
  if (scope === 'targetState') return 'target';
  return scope;
}

const EXCLUSIVE_TRAIT_GROUPS = {
  worldAttribute: new Set([
    'attributeSky',
    'attributeEarth',
    'attributeHuman',
    'attributeStar',
    'attributeBeast',
  ]),
  fieldRealm: new Set(['fieldHeaven', 'fieldHell']),
} satisfies Record<CanonicalExclusiveGroup, ReadonlySet<string>>;

export function canonicalExclusiveGroup(
  scope: TraitScope,
  trait: string,
): CanonicalExclusiveGroup | null {
  const canonical = actorScopeForTrait(scope);
  if (canonical === 'field')
    return EXCLUSIVE_TRAIT_GROUPS.fieldRealm.has(trait) ? 'fieldRealm' : null;
  return EXCLUSIVE_TRAIT_GROUPS.worldAttribute.has(trait) ? 'worldAttribute' : null;
}

export function canonicalExclusiveTraits(
  scope: TraitScope,
  group: CanonicalExclusiveGroup,
): readonly string[] {
  const canonical = actorScopeForTrait(scope);
  if (group === 'fieldRealm')
    return canonical === 'field' ? [...EXCLUSIVE_TRAIT_GROUPS.fieldRealm] : [];
  return canonical === 'attacker' || canonical === 'target'
    ? [...EXCLUSIVE_TRAIT_GROUPS.worldAttribute]
    : [];
}
