import type { DamageResolutionInput } from '@fgo-lab/schema';
import { stackInputKey, type NoblePhantasmVariant } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  BattleStateBase,
  ExecutableBattleState,
  ModifierKind,
  RejectedBattleState,
  TargetPredicateAssertion,
  WorldFactAssertion,
} from './contracts';
import { targetPredicateKey } from './targetPredicate';
import { canonicalExclusiveGroup, canonicalExclusiveTraits } from './conditionSemantics';

export function cloneBattleState(state: ExecutableBattleState): ExecutableBattleState {
  return {
    ...state,
    traits: {
      attacker: new Map(state.traits.attacker),
      attackerState: new Map(state.traits.attackerState),
      target: new Map(state.traits.target),
      targetState: new Map(state.traits.targetState),
      field: new Map(state.traits.field),
    },
    actorPredicates: {
      attacker: new Map(state.actorPredicates.attacker),
      target: new Map(state.actorPredicates.target),
    },
    stackQuantitySources: { ...state.stackQuantitySources },
    traitCounts: {
      attacker: { ...state.traitCounts.attacker },
      attackerState: { ...state.traitCounts.attackerState },
      target: { ...state.traitCounts.target },
      targetState: { ...state.traitCounts.targetState },
      field: { ...state.traitCounts.field },
    },
    initialTraitSuppressions: {
      attacker: new Set(state.initialTraitSuppressions.attacker),
      target: new Set(state.initialTraitSuppressions.target),
    },
    quantities: { ...state.quantities },
    activationContext: state.activationContext,
    resolvedInputValues: { ...state.resolvedInputValues },
    modifiers: [...state.modifiers],
    modifierRates: { ...state.modifierRates },
    evidence: [...state.evidence],
    unresolved: [...state.unresolved],
  };
}

export function createInitialBattleState(
  input: DamageResolutionInput,
  noblePhantasmVariant: NoblePhantasmVariant,
  attackerTraits: readonly string[],
  resolvedInputValues: Readonly<Record<string, number>> = {},
  targetPredicateAssertions: readonly TargetPredicateAssertion[] = [],
  attackerPredicateAssertions: readonly TargetPredicateAssertion[] = [],
  activationContext: ExecutableBattleState['activationContext'],
): ExecutableBattleState {
  return createBattleStateBase(
    input,
    noblePhantasmVariant,
    attackerTraits,
    resolvedInputValues,
    targetPredicateAssertions,
    attackerPredicateAssertions,
    activationContext,
  );
}

export function createRejectedBattleState(
  input: DamageResolutionInput,
  noblePhantasmVariant: NoblePhantasmVariant,
  attackerTraits: readonly string[],
  resolvedInputValues: Readonly<Record<string, number>> = {},
  targetPredicateAssertions: readonly TargetPredicateAssertion[] = [],
  attackerPredicateAssertions: readonly TargetPredicateAssertion[] = [],
): RejectedBattleState {
  return createBattleStateBase(
    input,
    noblePhantasmVariant,
    attackerTraits,
    resolvedInputValues,
    targetPredicateAssertions,
    attackerPredicateAssertions,
    null,
  );
}

function createBattleStateBase<
  TActivationContext extends ExecutableBattleState['activationContext'] | null,
>(
  input: DamageResolutionInput,
  noblePhantasmVariant: NoblePhantasmVariant,
  attackerTraits: readonly string[],
  resolvedInputValues: Readonly<Record<string, number>>,
  targetPredicateAssertions: readonly TargetPredicateAssertion[],
  attackerPredicateAssertions: readonly TargetPredicateAssertion[],
  activationContext: TActivationContext,
): BattleStateBase & { activationContext: TActivationContext } {
  const attacker = [...attackerTraits, 'cardNP'];
  return {
    actorFormId: noblePhantasmVariant.ref.actorFormId,
    noblePhantasmVariant,
    card: input.cardType,
    traits: {
      attacker: traitFacts(attacker),
      attackerState: traitFacts(input.attackerStateTraits),
      target: traitFacts(input.target.traits),
      targetState: traitFacts(input.targetStateTraits),
      field: traitFacts(input.fieldTraits),
    },
    actorPredicates: {
      attacker: new Map(
        attackerPredicateAssertions.map((assertion) => [
          targetPredicateKey(assertion.predicate),
          { predicate: assertion.predicate, present: assertion.present },
        ]),
      ),
      target: new Map(
        targetPredicateAssertions.map((assertion) => [
          targetPredicateKey(assertion.predicate),
          { predicate: assertion.predicate, present: assertion.present },
        ]),
      ),
    },
    stackQuantitySources: Object.fromEntries(
      (['attackerState', 'targetState', 'field'] as const).flatMap((scope) =>
        Object.keys(input.stackStateCounts?.[scope] ?? {}).map((trait) => {
          const source = { scope, trait };
          return [stackInputKey(source), source];
        }),
      ),
    ),
    traitCounts: {
      attacker: traitCounts(attacker),
      attackerState: {
        ...traitCounts(input.attackerStateTraits),
        ...input.stackStateCounts?.attackerState,
      },
      target: traitCounts(input.target.traits),
      targetState: {
        ...traitCounts(input.targetStateTraits),
        ...input.stackStateCounts?.targetState,
      },
      field: { ...traitCounts(input.fieldTraits), ...input.stackStateCounts?.field },
    },
    initialTraitSuppressions: { attacker: new Set(), target: new Set() },
    quantities: {
      attackerHpPermille: input.attackerHpPermille,
      targetRarity: input.targetRarity,
      battlePointPhase: input.battlePointPhase,
    },
    activationContext,
    resolvedInputValues: { ...resolvedInputValues },
    modifiers: [],
    modifierRates: {},
    ignoreDefense: input.damageFunction.status === 'resolved' && input.damageFunction.ignoreDefense,
    ignoreDamageCut: input.ignoreDamageCut,
    evidence: [],
    unresolved: [],
  };
}

function traitFacts(traits: Iterable<string>): ReadonlyMap<string, boolean> {
  return new Map([...traits].map((trait) => [trait, true] as const));
}

export function applyWorldFacts(
  state: ExecutableBattleState,
  assertions: readonly WorldFactAssertion[],
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  for (const assertion of assertions) {
    const fact = assertion.fact;
    if (fact.kind === 'quantity') candidate.quantities[fact.quantity] = fact.value;
    else {
      (candidate.traits[fact.scope] as Map<string, boolean>).set(fact.trait, fact.present);
      candidate.traitCounts[fact.scope] = fact.present
        ? {
            ...candidate.traitCounts[fact.scope],
            [fact.trait]: Math.max(1, candidate.traitCounts[fact.scope][fact.trait] ?? 0),
          }
        : withoutTraitCount(candidate.traitCounts[fact.scope], fact.trait);
    }
  }
  return candidate;
}

export function applyNoblePhantasmVariantSelection(
  state: ExecutableBattleState,
  variant: NoblePhantasmVariant,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  candidate.noblePhantasmVariant = variant;
  if (variant.kind === 'attack') candidate.card = variant.card;
  return candidate;
}

export function applyActorFormTransition(
  state: ExecutableBattleState,
  operation: Extract<BattleOperation, { kind: 'transformActorForm' }>,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  candidate.actorFormId = operation.targetFormId;
  const traits = [...operation.targetTraits, 'cardNP'];
  candidate.traits.attacker = traitFacts(traits);
  candidate.traitCounts.attacker = traitCounts(traits);
  return candidate;
}

export function applyTraitAddition(
  state: ExecutableBattleState,
  scope: Extract<BattleOperation, { kind: 'addTrait' }>['scope'],
  trait: string,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  const group = canonicalExclusiveGroup(scope, trait);
  if (group)
    for (const conflictingTrait of canonicalExclusiveTraits(scope, group)) {
      if (conflictingTrait === trait) continue;
      (candidate.traits[scope] as Map<string, boolean>).set(conflictingTrait, false);
      candidate.traitCounts[scope] = withoutTraitCount(
        candidate.traitCounts[scope],
        conflictingTrait,
      );
    }
  (candidate.traits[scope] as Map<string, boolean>).set(trait, true);
  candidate.traitCounts[scope] = {
    ...candidate.traitCounts[scope],
    [trait]: group
      ? Math.max(1, candidate.traitCounts[scope][trait] ?? 0)
      : (candidate.traitCounts[scope][trait] ?? 0) + 1,
  };
  return candidate;
}

function traitCounts(traits: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const trait of traits) result[trait] = (result[trait] ?? 0) + 1;
  return result;
}

export function combinedTraitCounts(
  ...groups: readonly Readonly<Record<string, number>>[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const group of groups)
    for (const [trait, count] of Object.entries(group))
      result[trait] = (result[trait] ?? 0) + count;
  return result;
}

export function withoutTraitCount(
  counts: Readonly<Record<string, number>>,
  removedTrait: string,
): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).filter(([trait]) => trait !== removedTrait));
}

function expandedTraits(
  counts: Readonly<Record<string, number>>,
  stackTraits: ReadonlySet<string> = new Set(),
): string[] {
  return Object.entries(counts).flatMap(([trait, count]) =>
    Array.from(
      { length: stackTraits.has(trait) ? Number(count > 0) : Math.max(0, count) },
      () => trait,
    ),
  );
}

export function foldDamageInput(
  input: DamageResolutionInput,
  state: ExecutableBattleState,
): DamageResolutionInput {
  const stackStateCounts: NonNullable<DamageResolutionInput['stackStateCounts']> = {
    attackerState: {},
    targetState: {},
    field: {},
  };
  for (const { scope, trait } of Object.values(state.stackQuantitySources))
    stackStateCounts[scope][trait] = state.traitCounts[scope][trait] ?? 0;
  const hasStacks = Object.keys(state.stackQuantitySources).length > 0;
  const sums: Partial<Record<ModifierKind, number>> = {};
  for (const modifier of state.modifiers) {
    if (modifier.card !== null && modifier.card !== state.card) continue;
    sums[modifier.modifier] = (sums[modifier.modifier] ?? 0) + modifier.valuePermille;
  }
  const value = (kind: ModifierKind) => (sums[kind] ?? 0) / 1000;
  const npBase = input.npDamageBuff + value('npDamageBuff');
  const npRate = (state.modifierRates.npDamageBuff ?? 0) / 1000;
  return {
    ...input,
    cardType: state.card,
    fieldTraits: [...state.traits.field].flatMap(([trait, present]) => (present ? [trait] : [])),
    ...(hasStacks ? { stackStateCounts } : {}),
    attackerStateTraits: expandedTraits(
      state.traitCounts.attackerState,
      new Set(Object.keys(stackStateCounts.attackerState)),
    ),
    targetStateTraits: expandedTraits(
      state.traitCounts.targetState,
      new Set(Object.keys(stackStateCounts.targetState)),
    ),
    target: {
      ...input.target,
      traits: expandedTraits(state.traitCounts.target),
    },
    attackBuff: input.attackBuff + value('attackBuff'),
    defenseBuff: input.defenseBuff + value('defenseBuff'),
    cardBuff: input.cardBuff + value('cardBuff'),
    cardResistance: input.cardResistance + value('cardResistance'),
    npDamageBuff: npRate ? npBase * (1 + npRate) : npBase,
    npResistance: input.npResistance + value('npResistance'),
    eventDamageBuff: input.eventDamageBuff + value('eventDamageBuff'),
    specialDamageBuff: input.specialDamageBuff + value('specialDamageBuff'),
    powerMod: input.powerMod + value('powerMod'),
    flatDamage: input.flatDamage + (sums.flatDamage ?? 0),
    ignoreDamageCut: state.ignoreDamageCut,
    damageFunction:
      input.damageFunction.status === 'resolved'
        ? {
            ...input.damageFunction,
            ignoreDefense: input.damageFunction.ignoreDefense || state.ignoreDefense,
          }
        : input.damageFunction,
  };
}
