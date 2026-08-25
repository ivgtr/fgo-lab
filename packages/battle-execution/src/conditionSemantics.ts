import type { ActorScope, CanonicalExclusiveGroup, TraitScope } from './index';

export type TraitConstraintScope =
  | 'attackerInitial'
  | 'attackerState'
  | 'attackerCombined'
  | 'targetInitial'
  | 'targetState'
  | 'targetCombined'
  | 'field';

const TRAIT_SCOPE_SEMANTICS = {
  attacker: {
    readScopes: ['attacker', 'attackerState'],
    factScope: 'attackerInitial',
    conditionScope: 'attackerCombined',
    actor: 'attacker',
  },
  attackerState: {
    readScopes: ['attackerState'],
    factScope: 'attackerState',
    conditionScope: 'attackerState',
    actor: 'attacker',
  },
  target: {
    readScopes: ['target', 'targetState'],
    factScope: 'targetInitial',
    conditionScope: 'targetCombined',
    actor: 'target',
  },
  targetState: {
    readScopes: ['targetState'],
    factScope: 'targetState',
    conditionScope: 'targetState',
    actor: 'target',
  },
  field: {
    readScopes: ['field'],
    factScope: 'field',
    conditionScope: 'field',
    actor: 'field',
  },
} as const satisfies Record<
  TraitScope,
  {
    readScopes: readonly TraitScope[];
    factScope: TraitConstraintScope;
    conditionScope: TraitConstraintScope;
    actor: ActorScope | 'field';
  }
>;

export function traitConditionReadScopes(scope: TraitScope): readonly TraitScope[] {
  return TRAIT_SCOPE_SEMANTICS[scope].readScopes;
}

export function traitFactConstraintScope(scope: TraitScope): TraitConstraintScope {
  return TRAIT_SCOPE_SEMANTICS[scope].factScope;
}

export function traitConditionConstraintScope(scope: TraitScope): TraitConstraintScope {
  return TRAIT_SCOPE_SEMANTICS[scope].conditionScope;
}

export function traitConstraintActorScope(scope: TraitConstraintScope): ActorScope | 'field' {
  if (scope.startsWith('attacker')) return 'attacker';
  if (scope.startsWith('target')) return 'target';
  return 'field';
}

export function traitConstraintLayer(
  scope: TraitConstraintScope,
): 'initial' | 'state' | 'combined' | 'field' {
  if (scope.endsWith('Initial')) return 'initial';
  if (scope.endsWith('State')) return 'state';
  if (scope.endsWith('Combined')) return 'combined';
  return 'field';
}

export function traitConstraintPublicScope(scope: TraitConstraintScope): TraitScope {
  const actor = traitConstraintActorScope(scope);
  if (actor === 'field') return 'field';
  return traitConstraintLayer(scope) === 'state'
    ? actor === 'attacker'
      ? 'attackerState'
      : 'targetState'
    : actor;
}

function actorScopeForTrait(scope: TraitScope): ActorScope | 'field' {
  return TRAIT_SCOPE_SEMANTICS[scope].actor;
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
