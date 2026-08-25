import type { ExclusiveTraitGroup, TraitScope } from './index';

const EXCLUSIVE_TRAIT_GROUPS = {
  worldAttribute: new Set([
    'attributeSky',
    'attributeEarth',
    'attributeHuman',
    'attributeStar',
    'attributeBeast',
  ]),
  fieldRealm: new Set(['fieldHeaven', 'fieldHell']),
  alignmentOrder: new Set([
    'alignmentLawful',
    'alignmentNeutral',
    'alignmentChaotic',
    'alignmentMadness',
    'alignmentSummer',
  ]),
  alignmentMoral: new Set(['alignmentGood', 'alignmentBalanced', 'alignmentEvil']),
} satisfies Record<ExclusiveTraitGroup, ReadonlySet<string>>;

export function exclusiveTraitGroup(scope: TraitScope, trait: string): ExclusiveTraitGroup | null {
  if (scope === 'field') return EXCLUSIVE_TRAIT_GROUPS.fieldRealm.has(trait) ? 'fieldRealm' : null;
  if (scope === 'attacker' || scope === 'target') {
    if (EXCLUSIVE_TRAIT_GROUPS.worldAttribute.has(trait)) return 'worldAttribute';
    if (EXCLUSIVE_TRAIT_GROUPS.alignmentOrder.has(trait)) return 'alignmentOrder';
    if (EXCLUSIVE_TRAIT_GROUPS.alignmentMoral.has(trait)) return 'alignmentMoral';
  }
  return null;
}
