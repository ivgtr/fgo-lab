import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { NoblePhantasmVariant } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  BattleStateBase,
  ExecutableBattleState,
  ModifierKind,
  RejectedBattleState,
  TargetPredicateAssertion,
  WorldFactAssertion,
} from './contracts';
import { createConditionState } from './conditionState';
import { canonicalExclusiveGroup, canonicalExclusiveTraits } from './conditionSemantics';
import { cloneConditionFactProofs, type ConditionFactProof } from './conditionRead';
import { liveInputQuantity } from './stackQuantities';
import {
  cloneTraitFactLayers,
  projectTraitScope,
  assertExternalInitialTrait,
  commitTraitFact,
  incrementTraitFact,
} from './traitFactLayers';

export function appendModifier(
  state: ExecutableBattleState,
  operation: Extract<BattleOperation, { kind: 'addModifier' }>,
  value: number,
): void {
  state.modifiers = [
    ...state.modifiers,
    {
      operationId: operation.operationId,
      source: operation.source,
      modifier: operation.modifier,
      valuePermille: value,
      card: operation.card,
      order: operation.order,
    },
  ];
}

export function cloneBattleState(state: ExecutableBattleState): ExecutableBattleState {
  return {
    ...state,
    conditionFactProofs: cloneConditionFactProofs(state.conditionFactProofs),
    traitFactLayers: cloneTraitFactLayers(state.traitFactLayers),
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
  return {
    ...createConditionState(
      input,
      noblePhantasmVariant,
      attackerTraits,
      resolvedInputValues,
      targetPredicateAssertions,
      attackerPredicateAssertions,
      activationContext,
    ),
    actorFormId: noblePhantasmVariant.ref.actorFormId,
    modifiers: [],
    modifierRates: {},
    ignoreDefense: input.damageFunction.status === 'resolved' && input.damageFunction.ignoreDefense,
    ignoreDamageCut: input.ignoreDamageCut,
    evidence: [],
    unresolved: [],
  };
}

export function applyWorldFacts(
  state: ExecutableBattleState,
  assertions: readonly WorldFactAssertion[],
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  for (const assertion of assertions) {
    const fact = assertion.fact;
    if (fact.kind === 'quantity') {
      if (fact.quantity !== 'attackerHpPermille' || !state.hp) {
        candidate.quantities[fact.quantity] = fact.value;
        (candidate.conditionFactProofs.quantities as Map<string, ConditionFactProof>).set(
          fact.quantity,
          { kind: 'externalAssumption', clock: candidate.conditionReadClock },
        );
      }
    } else {
      assertExternalInitialTrait(candidate.traitFactLayers, fact.scope, fact.trait, fact.present, {
        kind: 'externalAssumption',
        clock: candidate.conditionReadClock,
      });
      projectTraitScope(candidate, fact.scope);
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
  candidate.conditionReadClock = {
    ...candidate.conditionReadClock,
    actorFormId: operation.targetFormId,
  };
  const traits = [...operation.targetTraits, 'cardNP'];
  const intrinsic: ConditionFactProof = {
    kind: 'canonicalIntrinsic',
    clock: {
      ...candidate.conditionReadClock,
      actorFormId: operation.targetFormId,
      operationId: operation.operationId,
      sourceInstanceId: operation.source.sourceInstanceId,
      occurrenceId: operation.source.effectOccurrenceId,
    },
  };
  candidate.traitFactLayers.intrinsic.attacker = new Map(
    traits.map((trait) => [
      trait,
      { present: true, count: 1, proof: intrinsic, countSupport: [intrinsic] },
    ]),
  );
  projectTraitScope(candidate, 'attacker');
  candidate.conditionFactProofs.completeTraits.attacker = intrinsic;
  for (const trait of candidate.initialTraitSuppressions.attacker) {
    (candidate.traits.attacker as Map<string, boolean>).set(trait, false);
    candidate.traitCounts.attacker = withoutTraitCount(candidate.traitCounts.attacker, trait);
  }
  return candidate;
}

export function applyTraitRemoval(
  state: ExecutableBattleState,
  scope: Extract<BattleOperation, { kind: 'removeTrait' }>['scope'],
  trait: string,
  proof: ConditionFactProof,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  (candidate.traits[scope] as Map<string, boolean>).set(trait, false);
  candidate.traitCounts[scope] = withoutTraitCount(candidate.traitCounts[scope], trait);
  (candidate.conditionFactProofs.traits[scope] as Map<string, ConditionFactProof>).set(
    trait,
    proof,
  );
  commitTraitFact(candidate.traitFactLayers, scope, trait, false, 0, proof, [proof]);
  return candidate;
}

export function applyInitialTraitSuppression(
  state: ExecutableBattleState,
  scope: Extract<BattleOperation, { kind: 'suppressInitialTrait' }>['scope'],
  trait: string,
  proof: ConditionFactProof,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  candidate.initialTraitSuppressions[scope] = new Set([
    ...candidate.initialTraitSuppressions[scope],
    trait,
  ]);
  (candidate.traits[scope] as Map<string, boolean>).set(trait, false);
  candidate.traitCounts[scope] = withoutTraitCount(candidate.traitCounts[scope], trait);
  (candidate.conditionFactProofs.traits[scope] as Map<string, ConditionFactProof>).set(
    trait,
    proof,
  );
  (candidate.conditionFactProofs.suppressions[scope] as Map<string, ConditionFactProof>).set(
    trait,
    proof,
  );
  commitTraitFact(candidate.traitFactLayers, scope, trait, false, 0, proof, [proof]);
  return candidate;
}

export function applyTraitAddition(
  state: ExecutableBattleState,
  scope: Extract<BattleOperation, { kind: 'addTrait' }>['scope'],
  trait: string,
  proof: ConditionFactProof,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  const group = canonicalExclusiveGroup(scope, trait);
  if (group)
    for (const conflictingTrait of canonicalExclusiveTraits(scope, group)) {
      if (conflictingTrait === trait) continue;
      (candidate.traits[scope] as Map<string, boolean>).set(conflictingTrait, false);
      (candidate.conditionFactProofs.traits[scope] as Map<string, ConditionFactProof>).set(
        conflictingTrait,
        proof,
      );
      commitTraitFact(candidate.traitFactLayers, scope, conflictingTrait, false, 0, proof, [proof]);
      candidate.traitCounts[scope] = withoutTraitCount(
        candidate.traitCounts[scope],
        conflictingTrait,
      );
    }
  incrementTraitFact(
    candidate.traitFactLayers,
    scope,
    trait,
    proof,
    candidate.conditionFactProofs.completeTraits[scope],
    group !== null,
  );
  projectTraitScope(candidate, scope);
  return candidate;
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
  presence: ReadonlyMap<string, boolean>,
  counts: Readonly<Record<string, number>>,
  stackTraits: ReadonlySet<string> = new Set(),
): string[] {
  return [...presence].flatMap(([trait, present]) => {
    if (!present) return [];
    const count = counts[trait];
    // DTO membership does not assert an exact quantity for a presence-only fact.
    if (stackTraits.has(trait) || count === undefined) return [trait];
    return Array.from({ length: count }, () => trait);
  });
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
  for (const [key, { scope, trait }] of Object.entries(state.stackQuantitySources)) {
    const count = liveInputQuantity(state, key);
    if (count !== undefined) stackStateCounts[scope][trait] = count;
  }
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
      state.traits.attackerState,
      state.traitCounts.attackerState,
      new Set(Object.keys(stackStateCounts.attackerState)),
    ),
    targetStateTraits: expandedTraits(
      state.traits.targetState,
      state.traitCounts.targetState,
      new Set(Object.keys(stackStateCounts.targetState)),
    ),
    target: {
      ...input.target,
      traits: expandedTraits(state.traits.target, state.traitCounts.target),
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
