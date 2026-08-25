import type { CanonicalExclusiveGroup, TraitScope } from './index';

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
  if (scope === 'field') return EXCLUSIVE_TRAIT_GROUPS.fieldRealm.has(trait) ? 'fieldRealm' : null;
  if (scope === 'attacker' || scope === 'target') {
    if (EXCLUSIVE_TRAIT_GROUPS.worldAttribute.has(trait)) return 'worldAttribute';
  }
  return null;
}

export function canonicalExclusiveTraits(
  scope: TraitScope,
  group: CanonicalExclusiveGroup,
): readonly string[] {
  if (group === 'fieldRealm')
    return scope === 'field' ? [...EXCLUSIVE_TRAIT_GROUPS.fieldRealm] : [];
  return scope === 'attacker' || scope === 'target'
    ? [...EXCLUSIVE_TRAIT_GROUPS.worldAttribute]
    : [];
}
