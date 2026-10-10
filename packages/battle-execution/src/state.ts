import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { NoblePhantasmVariant } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  BattleStateBase,
  ExecutableBattleState,
  TraitScope,
  ModifierKind,
  RejectedBattleState,
  TargetPredicateAssertion,
  WorldFactAssertion,
} from './contracts';
import { createConditionState } from './conditionState';
import { cloneConditionFactProofs, type ConditionFactProof } from './conditionRead';
import { cloneInputFacts } from './inputFacts';
import type { ConditionEvaluationState } from './condition';
import { liveInputQuantity } from './stackQuantities';
import {
  projectBattleTraitPresence,
  assertExternalInitialTrait,
  commitTraitFact,
  addTraitFact,
  replaceIntrinsicTraitFacts,
} from './traitFactLayers';

/** Copies writable condition containers; immutable trait roots and owned facts remain shared. */
export function forkConditionState<T extends ConditionEvaluationState>(state: T): T {
  return {
    ...state,
    conditionFactProofs: cloneConditionFactProofs(state.conditionFactProofs),
    inputFacts: cloneInputFacts(state.inputFacts),
    actorPredicates: {
      attacker: new Map(state.actorPredicates.attacker),
      target: new Map(state.actorPredicates.target),
    },
    stackQuantitySources: { ...state.stackQuantitySources },
    initialTraitSuppressions: {
      attacker: new Set(state.initialTraitSuppressions.attacker),
      target: new Set(state.initialTraitSuppressions.target),
    },
    quantities: { ...state.quantities },
  };
}

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
    ...forkConditionState(state),
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
      candidate.traitFactLayers = assertExternalInitialTrait(
        candidate.traitFactLayers,
        fact.scope,
        fact.trait,
        fact.present,
        {
          kind: 'externalAssumption',
          clock: candidate.conditionReadClock,
        },
      );
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
  candidate.traitFactLayers = replaceIntrinsicTraitFacts(
    candidate.traitFactLayers,
    'attacker',
    traits,
    intrinsic,
  );

  return candidate;
}

export function applyTraitRemoval(
  state: ExecutableBattleState,
  scope: Extract<BattleOperation, { kind: 'removeTrait' }>['scope'],
  trait: string,
  proof: ConditionFactProof,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);

  candidate.traitFactLayers = commitTraitFact(
    candidate.traitFactLayers,
    scope,
    trait,
    false,
    0,
    proof,
    [proof],
  );

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

  (candidate.conditionFactProofs.suppressions[scope] as Map<string, ConditionFactProof>).set(
    trait,
    proof,
  );
  candidate.traitFactLayers = commitTraitFact(
    candidate.traitFactLayers,
    scope,
    trait,
    false,
    0,
    proof,
    [proof],
  );

  return candidate;
}

export function applyTraitAddition(
  state: ExecutableBattleState,
  scope: Extract<BattleOperation, { kind: 'addTrait' }>['scope'],
  trait: string,
  proof: ConditionFactProof,
): ExecutableBattleState {
  const candidate = cloneBattleState(state);
  candidate.traitFactLayers = addTraitFact(candidate.traitFactLayers, scope, trait, proof);

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

function expandedTraits(state: ExecutableBattleState, scope: TraitScope): string[] {
  return [...projectBattleTraitPresence(state, scope)].flatMap(([trait, present]) =>
    present ? [trait] : [],
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
    fieldTraits: expandedTraits(state, 'field'),
    ...(hasStacks ? { stackStateCounts } : {}),
    attackerStateTraits: expandedTraits(state, 'attackerState'),
    targetStateTraits: expandedTraits(state, 'targetState'),
    target: { ...input.target, traits: expandedTraits(state, 'target') },
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
