import type { DamageResolutionInput } from '@fgo-lab/schema';
import type { BattleState, ModifierKind, WorldFactAssertion } from './contracts';

export function cloneBattleState(state: BattleState): BattleState {
  return {
    ...state,
    traits: {
      attacker: new Map(state.traits.attacker),
      attackerState: new Map(state.traits.attackerState),
      target: new Map(state.traits.target),
      targetState: new Map(state.traits.targetState),
      field: new Map(state.traits.field),
    },
    traitCounts: {
      attacker: { ...state.traitCounts.attacker },
      attackerState: { ...state.traitCounts.attackerState },
      target: { ...state.traitCounts.target },
      targetState: { ...state.traitCounts.targetState },
      field: { ...state.traitCounts.field },
    },
    quantities: { ...state.quantities },
    modifiers: [...state.modifiers],
    modifierRates: { ...state.modifierRates },
    evidence: [...state.evidence],
    unresolved: [...state.unresolved],
  };
}

export function createInitialBattleState(
  input: DamageResolutionInput,
  attackerTraits: readonly string[],
): BattleState {
  const attacker = [...attackerTraits, 'cardNP'];
  return {
    card: input.cardType,
    traits: {
      attacker: traitFacts(attacker),
      attackerState: traitFacts(input.attackerStateTraits),
      target: traitFacts(input.target.traits),
      targetState: traitFacts(input.targetStateTraits),
      field: traitFacts(input.fieldTraits),
    },
    traitCounts: {
      attacker: traitCounts(attacker),
      attackerState: traitCounts(input.attackerStateTraits),
      target: traitCounts(input.target.traits),
      targetState: traitCounts(input.targetStateTraits),
      field: traitCounts(input.fieldTraits),
    },
    quantities: {
      attackerHpPermille: input.attackerHpPermille,
      targetRarity: input.targetRarity,
      battlePointPhase: input.battlePointPhase,
    },
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
  state: BattleState,
  assertions: readonly WorldFactAssertion[],
): BattleState {
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

function expandedTraits(counts: Readonly<Record<string, number>>): string[] {
  return Object.entries(counts).flatMap(([trait, count]) =>
    Array.from({ length: Math.max(0, count) }, () => trait),
  );
}

export function foldDamageInput(
  input: DamageResolutionInput,
  state: BattleState,
): DamageResolutionInput {
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
    attackerStateTraits: expandedTraits(state.traitCounts.attackerState),
    targetStateTraits: expandedTraits(state.traitCounts.targetState),
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
