import { SOURCE_WORLD_TRAIT_INPUT_PREFIX } from './ocConditionInputs';
import { hpPermille } from './hpResource';
import { traitFacts, traitCounts } from './conditionState';
import type { OcSourceProgram } from './ocSourceProgram';
import { activationFactKey, analyzeActivationFactSet, type ActivationFact } from '@fgo-lab/schema';
import { findActorForm, findNoblePhantasmVariant, type ServantMaster } from '@fgo-lab/master-data';
import { createConditionState } from './conditionState';
import { markerTraitCounts } from './buffInstances';
import type { ConditionEvaluationState } from './condition';
import type { PreNoblePhantasmState, PreparationExecutionContext } from './preparationContracts';

/** Preparation uses the same condition facts as damage execution, without a synthetic damage input. */
export function preparationConditionState(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
  actionFacts: readonly ActivationFact[] = [],
): ConditionEvaluationState | null {
  const variant = state.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, state.selectedNoblePhantasmVariant)
    : undefined;
  if (!variant) return null;
  if (analyzeActivationFactSet(context.activationFacts ?? []).status !== 'valid') return null;
  const combinedFacts = [
    ...(context.activationFacts ?? []),
    ...state.appliedActions.flatMap(({ activationFacts }) =>
      activationFacts.filter((fact) => fact.kind !== 'sourceQuantity'),
    ),
    ...actionFacts,
  ];
  const activation = analyzeActivationFactSet(
    [...new Map(combinedFacts.map((fact) => [activationFactKey(fact), fact])).values()].sort(
      (left, right) => activationFactKey(left).localeCompare(activationFactKey(right)),
    ),
  );
  if (activation.status !== 'valid') return null;
  const facts = createConditionState(
    {
      cardType: variant.kind === 'attack' ? variant.card : null,
      attackerStateTraits: [],
      targetStateTraits: [],
      fieldTraits: [],
      target: { traits: [] },
      attackerHpPermille: hpPermille(state.hp?.actors.attacker),
      targetRarity: null,
      battlePointPhase: context.battlePointPhase ?? null,
    },
    variant,
    findActorForm(servant, state.currentFormId)?.traits ?? [],
    context.canonicalInputValues ?? {},
    context.targetPredicates ?? [],
    context.attackerPredicates ?? [],
    activation.factSet,
  );
  for (const { fact } of context.worldFacts ?? []) {
    if (fact.kind === 'quantity') {
      if (fact.quantity !== 'attackerHpPermille') facts.quantities[fact.quantity] = fact.value;
    } else {
      (facts.traits[fact.scope] as Map<string, boolean>).set(fact.trait, fact.present);
      facts.traitCounts[fact.scope] = {
        ...facts.traitCounts[fact.scope],
        [fact.trait]: Number(fact.present),
      };
    }
  }
  for (const scope of ['attackerState', 'targetState', 'field'] as const) {
    for (const [trait, count] of Object.entries(state.stackCounts[scope])) {
      (facts.traits[scope] as Map<string, boolean>).set(trait, count > 0);
      facts.traitCounts[scope] = { ...facts.traitCounts[scope], [trait]: count };
    }
  }
  facts.stackQuantitySources = {
    ...facts.stackQuantitySources,
    ...Object.fromEntries(
      (context.stackInputs ?? []).map((input) => [input.key, input.quantitySource]),
    ),
  };
  facts.hp = state.hp;
  facts.buffInstances = state.buffInstances;
  facts.battlePoints = state.battlePoints;
  if (context.battlePointDomains) facts.battlePointDomains = context.battlePointDomains;
  facts.resourceActor = 'attacker';
  facts.initialTraitSuppressions = state.initialTraitSuppressions;
  return facts;
}

/** A support's self-condition reads that support, while enemy and field facts retain their scope. */
export function preparationSourceConditionState(
  program: OcSourceProgram,
  facts: ConditionEvaluationState,
): ConditionEvaluationState {
  if (program.conditionActor === 'attacker') return facts;
  const traits = program.source.sourceTraits;
  const bound: ConditionEvaluationState = {
    ...facts,
    card: null,
    resourceActor: program.source.sourceInstanceId,
    traits: { ...facts.traits, attacker: traitFacts(traits), attackerState: new Map() },
    traitCounts: { ...facts.traitCounts, attacker: traitCounts(traits), attackerState: {} },
    actorPredicates: { ...facts.actorPredicates, attacker: new Map() },
    initialTraitSuppressions: { ...facts.initialTraitSuppressions, attacker: new Set() },
    buffInstances: (facts.buffInstances ?? [])
      .filter((instance) => instance.actor !== 'attacker')
      .map((instance) =>
        instance.actor === program.source.sourceInstanceId
          ? { ...instance, actor: 'attacker' }
          : instance,
      ),
    quantities: {
      ...facts.quantities,
      attackerHpPermille: hpPermille(facts.hp?.actors[program.source.sourceInstanceId]),
    },
    stackQuantitySources: Object.fromEntries(
      Object.entries(facts.stackQuantitySources).filter(
        ([, source]) => source.scope !== 'attackerState',
      ),
    ),
  };
  for (const [key, value] of Object.entries(facts.resolvedInputValues)) {
    if (!key.startsWith(SOURCE_WORLD_TRAIT_INPUT_PREFIX) || (value !== 0 && value !== 1)) continue;
    try {
      const parsed: unknown = JSON.parse(key.slice(SOURCE_WORLD_TRAIT_INPUT_PREFIX.length));
      if (!Array.isArray(parsed)) continue;
      const [actor, fact] = parsed as unknown[];
      if (
        actor !== program.source.sourceInstanceId ||
        typeof fact !== 'object' ||
        fact === null ||
        !('kind' in fact) ||
        !('scope' in fact) ||
        !('trait' in fact) ||
        fact.kind !== 'trait' ||
        (fact.scope !== 'attacker' && fact.scope !== 'attackerState') ||
        typeof fact.trait !== 'string'
      )
        continue;
      (bound.traits[fact.scope] as Map<string, boolean>).set(fact.trait, value === 1);
      // A combined actor assertion includes the absence/presence of represented initial state.
      if (fact.scope === 'attacker')
        (bound.traits.attackerState as Map<string, boolean>).set(fact.trait, value === 1);
    } catch {
      continue;
    }
  }
  const live = markerTraitCounts(facts.buffInstances ?? [], program.source.sourceInstanceId);
  for (const [trait, count] of Object.entries(live)) {
    (bound.traits.attackerState as Map<string, boolean>).set(trait, count > 0);
    bound.traitCounts.attackerState = { ...bound.traitCounts.attackerState, [trait]: count };
  }
  return bound;
}
