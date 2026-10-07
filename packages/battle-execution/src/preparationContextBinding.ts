import { resolvedScenarioSchema, type PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { WorldFactAssertion } from './contracts';
import type { ConditionFactProof } from './conditionRead';
import { inputFactValues, writeInputFact } from './inputFacts';
import { mergeInputDefinitions } from './stackQuantities';
import { assertExternalInitialTrait } from './traitFactLayers';
import type { PreNoblePhantasmState, PreparationExecutionContext } from './preparationContracts';
import type { CanonicalInputDefinition, ServantMaster } from '@fgo-lab/master-data';

type BindingResult =
  | { status: 'bound'; state: PreNoblePhantasmState; context: PreparationExecutionContext }
  | { status: 'required'; definition: CanonicalInputDefinition }
  | { status: 'invalid' };

function omittedInputDefinition(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
  key: string,
): CanonicalInputDefinition | null {
  const effects = [
    ...servant.skills.flatMap((skill) => skill.effects),
    ...servant.passives.flatMap((source) => source.effects),
    ...servant.noblePhantasmVariantGroups.flatMap((group) =>
      group.variants.flatMap((variant) => variant.effects),
    ),
    ...(context.initialSources ?? []).map((source) => source.effect),
    ...(context.terminalSources ?? []).map((source) => source.effect),
  ];
  const sameKey = [
    ...effects.flatMap((effect) => effect.inputDefinitions),
    ...(context.stackInputs ?? []),
    ...state.ocInputDefinitions,
    ...(state.hp?.inputDefinitions ?? []),
  ].filter((definition) => definition.key === key);
  if (sameKey.length === 0) return null;
  try {
    return mergeInputDefinitions(sameKey)[0] ?? null;
  } catch {
    return null;
  }
}

function factIdentity(fact: WorldFactAssertion['fact']): string {
  return fact.kind === 'trait'
    ? JSON.stringify(['trait', fact.scope, fact.trait])
    : JSON.stringify(['quantity', fact.quantity]);
}

function worldAssertions(
  facts: readonly WorldFactAssertion[],
): Map<string, WorldFactAssertion> | null {
  const result = new Map<string, WorldFactAssertion>();
  const decisions = new Set<string>();
  for (const assertion of facts) {
    if (
      !resolvedScenarioSchema.shape.worldFactAssertions.element.safeParse(assertion).success ||
      decisions.has(assertion.decisionKey)
    )
      return null;
    decisions.add(assertion.decisionKey);
    const key = factIdentity(assertion.fact);
    const prior = result.get(key);
    if (prior && JSON.stringify(prior.fact) !== JSON.stringify(assertion.fact)) return null;
    result.set(key, assertion);
  }
  return result;
}

function cannotRebindInput(state: PreNoblePhantasmState, key: string): boolean {
  const fact = state.inputFacts.get(key);
  return (
    fact !== undefined &&
    (fact.kind !== 'known' || fact.support.some(({ kind }) => kind !== 'externalAssumption'))
  );
}

/** Bind changed external intent once before source execution; retain every live physical write. */
export function bindPreparationActionContext(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  command: PreNoblePhantasmCommand,
  context: PreparationExecutionContext,
): BindingResult {
  if (context.npLevel !== state.npResource.npLevel) return { status: 'invalid' };
  const incomingInputs = context.canonicalInputValues ?? {};
  if (Object.values(incomingInputs).some((value) => !Number.isFinite(value)))
    return { status: 'invalid' };
  const incomingWorld = context.worldFacts ?? [];
  const oldWorld = worldAssertions(state.externalBinding.worldFacts);
  const nextWorld = worldAssertions(incomingWorld);
  if (!oldWorld || !nextWorld) return { status: 'invalid' };
  const actionId = `preparation:${state.appliedActions.length}:${command.kind}`;
  const proof: ConditionFactProof = {
    kind: 'externalAssumption',
    clock: {
      phase: 'operation',
      actorFormId: state.currentFormId,
      actor: 'attacker',
      actionId,
      operationId: `${actionId}:bindExternalContext`,
      sourceInstanceId: null,
      occurrenceId: null,
      valueSetIndex: null,
      valueIndex: null,
    },
  };
  let inputFacts = state.inputFacts;
  let changed = JSON.stringify(state.externalBinding.worldFacts) !== JSON.stringify(incomingWorld);
  for (const key of new Set([
    ...Object.keys(state.externalBinding.inputs),
    ...Object.keys(incomingInputs),
  ])) {
    const previous = state.externalBinding.inputs[key];
    const next = incomingInputs[key];
    if (Object.is(previous, next)) continue;
    changed = true;
    if (cannotRebindInput(state, key)) return { status: 'invalid' };
    if (next === undefined) {
      const definition = omittedInputDefinition(servant, state, context, key);
      if (!definition) return { status: 'invalid' };
      if (definition.defaultValue === null) return { status: 'required', definition };
      inputFacts = writeInputFact(inputFacts, key, definition.defaultValue, [proof]);
    } else inputFacts = writeInputFact(inputFacts, key, next, [proof]);
  }

  let traitFactLayers = state.traitFactLayers;
  const quantities = { ...state.quantities };
  const quantityProofs = new Map(state.conditionFactProofs.quantities);
  for (const key of new Set([...oldWorld.keys(), ...nextWorld.keys()])) {
    const previous = oldWorld.get(key)?.fact;
    const next = nextWorld.get(key)?.fact;
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changed = true;
    const fact = next ?? previous;
    if (!fact) continue;
    if (fact.kind === 'trait') {
      if (traitFactLayers.writes[fact.scope].has(fact.trait)) return { status: 'invalid' };
      const externalInitial = { ...traitFactLayers.externalInitial };
      const scoped = new Map(externalInitial[fact.scope]);
      scoped.delete(fact.trait);
      externalInitial[fact.scope] = scoped;
      traitFactLayers = { ...traitFactLayers, externalInitial };
      if (next?.kind === 'trait') {
        if (
          (next.scope === 'attacker' || next.scope === 'target') &&
          !next.present &&
          traitFactLayers.intrinsic[next.scope].get(next.trait)?.kind === 'present'
        )
          return { status: 'invalid' };
        traitFactLayers = assertExternalInitialTrait(
          traitFactLayers,
          next.scope,
          next.trait,
          next.present,
          proof,
        );
      }
    } else {
      if (fact.quantity === 'attackerHpPermille') return { status: 'invalid' };
      const priorProof = quantityProofs.get(fact.quantity);
      if (priorProof && priorProof.kind !== 'externalAssumption') return { status: 'invalid' };
      quantities[fact.quantity] = next?.kind === 'quantity' ? next.value : null;
      if (next?.kind === 'quantity') quantityProofs.set(next.quantity, proof);
      else quantityProofs.delete(fact.quantity);
    }
  }
  if (!changed)
    return {
      status: 'bound',
      state,
      context: { ...context, canonicalInputValues: inputFactValues(state.inputFacts) },
    };
  const bound: PreNoblePhantasmState = {
    ...state,
    inputFacts,
    traitFactLayers,
    quantities,
    conditionFactProofs: { ...state.conditionFactProofs, quantities: quantityProofs },
    externalBinding: {
      inputs: { ...incomingInputs },
      worldFacts: incomingWorld.map(({ decisionKey, fact }) => ({
        decisionKey,
        fact: { ...fact },
      })),
    },
  };
  return {
    status: 'bound',
    state: bound,
    context: { ...context, canonicalInputValues: inputFactValues(bound.inputFacts) },
  };
}
