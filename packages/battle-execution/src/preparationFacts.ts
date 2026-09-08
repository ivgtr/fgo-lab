import { sourceHpInputKey } from './operationCompiler';
import { traitFacts, traitCounts } from './conditionState';
import type { OcSourceProgram } from './ocSourceProgram';
import { activationFactKey, analyzeActivationFactSet, type ActivationFact } from '@fgo-lab/schema';
import { findActorForm, findNoblePhantasmVariant, type ServantMaster } from '@fgo-lab/master-data';
import { createConditionState } from './conditionState';
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
      attackerHpPermille: context.attackerHpPermille ?? null,
      targetRarity: null,
      battlePointPhase: context.battlePointPhase ?? null,
    },
    variant,
    findActorForm(servant, state.currentFormId)?.traits ?? [],
    context.canonicalInputValues ?? {},
    context.targetPredicates ?? [],
    [],
    activation.factSet,
  );
  for (const { fact } of context.worldFacts ?? []) {
    if (fact.kind === 'quantity') facts.quantities[fact.quantity] = fact.value;
    else {
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
  return {
    ...facts,
    card: null,
    traits: { ...facts.traits, attacker: traitFacts(traits), attackerState: new Map() },
    traitCounts: { ...facts.traitCounts, attacker: traitCounts(traits), attackerState: {} },
    actorPredicates: { ...facts.actorPredicates, attacker: new Map() },
    initialTraitSuppressions: { ...facts.initialTraitSuppressions, attacker: new Set() },
    quantities: {
      ...facts.quantities,
      attackerHpPermille: facts.resolvedInputValues[sourceHpInputKey(program.source)] ?? 1000,
    },
    stackQuantitySources: Object.fromEntries(
      Object.entries(facts.stackQuantitySources).filter(
        ([, source]) => source.scope !== 'attackerState',
      ),
    ),
  };
}
