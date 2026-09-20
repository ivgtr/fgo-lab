import type {
  ActorScope,
  CanonicalExclusiveGroup,
  ConditionExpression,
  TraitScope,
} from './contracts';
import type { TargetPredicate } from '@fgo-lab/schema';
import type { AnalyzedActivationFactSet } from '@fgo-lab/schema';
import type { CanonicalTraitProvenance } from '@fgo-lab/master-data';
import { noblePhantasmVariantKey, type NoblePhantasmVariantRef } from '@fgo-lab/master-data';
import { evaluateActivationRequirement } from './activationCondition';

export interface IntrinsicAttackConditionFacts {
  card: 'buster' | 'arts' | 'quick' | null;
  noblePhantasmVariant: NoblePhantasmVariantRef;
  attackerTraits?: ReadonlyMap<string, boolean>;
  activationFacts?: AnalyzedActivationFactSet;
}

export type ContributionConditionClass =
  | 'intrinsicSatisfied'
  | 'intrinsicUnsatisfied'
  | 'intrinsicRuntime'
  | 'conditional'
  | 'unsupported';

/**
 * Classifies contribution dependency after binding the selected attack identity. Boolean
 * composition lives here so admission and execution policy cannot simplify it differently.
 */
export function classifyContributionCondition(
  condition: ConditionExpression,
  attack?: IntrinsicAttackConditionFacts,
): ContributionConditionClass {
  const classify = (expression: ConditionExpression): ContributionConditionClass => {
    if (expression.kind === 'always') return 'intrinsicSatisfied';
    if (expression.kind === 'unsupported') return 'unsupported';
    if (expression.kind === 'card')
      return attack === undefined
        ? 'intrinsicRuntime'
        : expression.card === attack.card
          ? 'intrinsicSatisfied'
          : 'intrinsicUnsatisfied';
    if (expression.kind === 'noblePhantasmVariant')
      return attack === undefined
        ? 'intrinsicRuntime'
        : noblePhantasmVariantKey(expression.variant) ===
            noblePhantasmVariantKey(attack.noblePhantasmVariant)
          ? 'intrinsicSatisfied'
          : 'intrinsicUnsatisfied';
    if (expression.kind === 'choice' || expression.kind === 'operationTrigger') {
      if (!attack?.activationFacts) return 'intrinsicRuntime';
      const evaluated = evaluateActivationRequirement(expression, attack.activationFacts);
      return evaluated === null
        ? 'intrinsicRuntime'
        : evaluated
          ? 'intrinsicSatisfied'
          : 'intrinsicUnsatisfied';
    }
    if (expression.kind === 'trait') {
      if (expression.scope !== 'attacker') return 'conditional';
      if (traitConditionEvaluationSource(expression) !== 'worldFacts') return 'intrinsicRuntime';
      const present = attack?.attackerTraits?.get(expression.trait);
      if (present === undefined) return 'intrinsicRuntime';
      return present === expression.present ? 'intrinsicSatisfied' : 'intrinsicUnsatisfied';
    }
    if (expression.kind === 'all' || expression.kind === 'any') {
      const members = expression.expressions.map(classify);
      if (expression.kind === 'all') {
        if (members.includes('unsupported')) return 'unsupported';
        if (members.includes('intrinsicUnsatisfied')) return 'intrinsicUnsatisfied';
        if (members.includes('conditional')) return 'conditional';
        return members.includes('intrinsicRuntime') ? 'intrinsicRuntime' : 'intrinsicSatisfied';
      }
      if (members.includes('unsupported')) return 'unsupported';
      if (members.includes('intrinsicSatisfied')) return 'intrinsicSatisfied';
      if (members.includes('conditional')) return 'conditional';
      return members.includes('intrinsicRuntime') ? 'intrinsicRuntime' : 'intrinsicUnsatisfied';
    }
    if (expression.kind === 'not') {
      const member = classify(expression.expression);
      if (member === 'intrinsicSatisfied') return 'intrinsicUnsatisfied';
      if (member === 'intrinsicUnsatisfied') return 'intrinsicSatisfied';
      return member;
    }
    return 'conditional';
  };
  return classify(condition);
}

const DEFAULT_TRAIT_PROVENANCE: CanonicalTraitProvenance = {
  stateSources: 'activeOnly',
  ignoredStateTraits: 'exclude',
  unremovableStateTraits: 'include',
};

export type TraitConditionLeaf = Extract<ConditionExpression, { kind: 'trait' | 'traitCount' }>;
export type TraitConditionEvaluationSource = 'worldFacts' | 'effectLocalDecision';

/** Owns which trait-condition variants can be evaluated from canonical world facts. */
export function traitConditionEvaluationSource(
  condition: TraitConditionLeaf,
): TraitConditionEvaluationSource {
  if (condition.kind === 'traitCount') return 'worldFacts';
  const provenance = condition.provenance;
  return provenance === undefined ||
    (provenance.stateSources === DEFAULT_TRAIT_PROVENANCE.stateSources &&
      provenance.ignoredStateTraits === DEFAULT_TRAIT_PROVENANCE.ignoredStateTraits &&
      provenance.unremovableStateTraits === DEFAULT_TRAIT_PROVENANCE.unremovableStateTraits)
    ? 'worldFacts'
    : 'effectLocalDecision';
}

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

/** Resolves the initial/state portion of a combined actor trait read. */
export function resolveCombinedTraitValue(input: {
  scope: 'target' | 'targetState' | 'attacker' | 'attackerState';
  initial: boolean | undefined;
  state: boolean | undefined;
  suppressed: boolean;
}): boolean | undefined {
  if (input.scope === 'targetState' || input.scope === 'attackerState') return input.state;
  if (input.state === true) return true;
  if (input.suppressed) return false;
  if (input.initial === true) return true;
  if (input.initial === false && input.state === false) return false;
  return undefined;
}

export function compareTraitCount(
  comparison: 'atLeast' | 'atMost' | 'equal',
  actual: number,
  expected: number,
): boolean {
  switch (comparison) {
    case 'atLeast':
      return actual >= expected;
    case 'atMost':
      return actual <= expected;
    case 'equal':
      return actual === expected;
  }
}

/** Returns a decisive all/any result, or undefined when unresolved members remain. */
export function decisiveConditionGroup(
  kind: 'all' | 'any',
  members: readonly unknown[],
): boolean | undefined {
  if (kind === 'all' && members.includes(false)) return false;
  if (kind === 'any' && members.includes(true)) return true;
  return undefined;
}

export interface TargetConditionWitnessSpace {
  traitFacts: readonly {
    scope: 'target' | 'targetState';
    trait: string;
  }[];
  predicates: readonly TargetPredicate[];
}

/**
 * Returns the physical target facts whose values can change a condition result. The condition
 * evaluator remains the owner of truth: this function only exposes its read dimensions so finite
 * planners do not have to reinterpret polarity, boolean composition, or trait-count comparisons.
 */
export function targetConditionWitnessSpace(
  condition: ConditionExpression | null,
): TargetConditionWitnessSpace {
  const traitFacts = new Map<string, { scope: 'target' | 'targetState'; trait: string }>();
  const predicates = new Map<string, TargetPredicate>();
  const visit = (expression: ConditionExpression): void => {
    if (expression.kind === 'trait' || expression.kind === 'traitCount') {
      if (traitConditionEvaluationSource(expression) !== 'worldFacts') return;
      if (expression.scope !== 'target' && expression.scope !== 'targetState') return;
      const traits = expression.kind === 'trait' ? [expression.trait] : expression.traits;
      for (const scope of traitConditionReadScopes(expression.scope)) {
        if (scope !== 'target' && scope !== 'targetState') continue;
        for (const trait of traits) traitFacts.set(`${scope}:${trait}`, { scope, trait });
      }
      return;
    }
    if (expression.kind === 'targetPredicate') {
      if (expression.scope === 'target')
        predicates.set(JSON.stringify(expression.predicate), expression.predicate);
      return;
    }
    if (expression.kind === 'all' || expression.kind === 'any') {
      for (const child of expression.expressions) visit(child);
      return;
    }
    if (expression.kind === 'not') visit(expression.expression);
  };
  if (condition) visit(condition);
  return {
    traitFacts: [...traitFacts.values()].sort((left, right) =>
      `${left.scope}:${left.trait}`.localeCompare(`${right.scope}:${right.trait}`),
    ),
    predicates: [...predicates.values()],
  };
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
  npCardForm: new Set(['traitId:3121', 'traitId:3122']),
} satisfies Record<CanonicalExclusiveGroup, ReadonlySet<string>>;

export function canonicalExclusiveGroup(
  scope: TraitScope,
  trait: string,
): CanonicalExclusiveGroup | null {
  const canonical = actorScopeForTrait(scope);
  if (canonical === 'field')
    return EXCLUSIVE_TRAIT_GROUPS.fieldRealm.has(trait) ? 'fieldRealm' : null;
  if (EXCLUSIVE_TRAIT_GROUPS.npCardForm.has(trait)) return 'npCardForm';
  return EXCLUSIVE_TRAIT_GROUPS.worldAttribute.has(trait) ? 'worldAttribute' : null;
}

export function canonicalExclusiveTraits(
  scope: TraitScope,
  group: CanonicalExclusiveGroup,
): readonly string[] {
  const canonical = actorScopeForTrait(scope);
  if (group === 'fieldRealm')
    return canonical === 'field' ? [...EXCLUSIVE_TRAIT_GROUPS.fieldRealm] : [];
  if (group === 'npCardForm')
    return canonical === 'attacker' || canonical === 'target'
      ? [...EXCLUSIVE_TRAIT_GROUPS.npCardForm]
      : [];
  return canonical === 'attacker' || canonical === 'target'
    ? [...EXCLUSIVE_TRAIT_GROUPS.worldAttribute]
    : [];
}
