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
import { cloneConditionFactProofs, type ConditionFactProof } from './conditionRead';
import {
  assertExternalInitialTrait,
  projectTraitScope,
  commitTraitFact,
  cloneTraitFactLayers,
} from './traitFactLayers';

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
    const proof: ConditionFactProof = {
      kind: 'externalAssumption',
      clock: facts.conditionReadClock,
    };
    if (fact.kind === 'quantity') {
      if (fact.quantity !== 'attackerHpPermille') {
        facts.quantities[fact.quantity] = fact.value;
        (facts.conditionFactProofs.quantities as Map<string, ConditionFactProof>).set(
          fact.quantity,
          proof,
        );
      }
    } else {
      assertExternalInitialTrait(
        facts.traitFactLayers,
        fact.scope,
        fact.trait,
        fact.present,
        proof,
      );
      projectTraitScope(facts, fact.scope);
    }
  }
  for (const scope of ['attackerState', 'targetState', 'field'] as const) {
    for (const [trait, count] of Object.entries(state.stackCounts[scope])) {
      (facts.traits[scope] as Map<string, boolean>).set(trait, count > 0);
      const proof = state.conditionWriteProofs.traits[scope].get(trait);
      if (!proof) return null;
      commitTraitFact(facts.traitFactLayers, scope, trait, count > 0, count, proof);
      (facts.conditionFactProofs.traits[scope] as Map<string, ConditionFactProof>).set(
        trait,
        proof,
      );
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
  facts.conditionFactProofs.suppressions = {
    attacker: new Map(state.conditionWriteProofs.suppressions.attacker),
    target: new Map(state.conditionWriteProofs.suppressions.target),
  };
  facts.conditionFactProofs.quantities = new Map([
    ...facts.conditionFactProofs.quantities,
    ...state.conditionWriteProofs.quantities,
  ]);
  facts.conditionFactProofs.markers = new Map(state.conditionWriteProofs.markers);
  for (const input of context.stackInputs ?? []) {
    const proof = facts.conditionFactProofs.traits[input.quantitySource.scope].get(
      input.quantitySource.trait,
    );
    if (proof)
      (facts.conditionFactProofs.inputs as Map<string, ConditionFactProof>).set(input.key, proof);
  }
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
    traitFactLayers: cloneTraitFactLayers(facts.traitFactLayers),
    conditionFactProofs: cloneConditionFactProofs(facts.conditionFactProofs),
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
  const intrinsic: ConditionFactProof = {
    kind: 'canonicalIntrinsic',
    clock: facts.conditionReadClock,
  };
  bound.traitFactLayers.intrinsic.attacker = new Map(
    traits.map((trait) => [trait, { present: true, count: 1, proof: intrinsic }]),
  );
  for (const scope of ['attacker', 'attackerState'] as const) {
    bound.traitFactLayers.externalInitial[scope] = new Map();
    bound.traitFactLayers.writes[scope] = new Map();
    projectTraitScope(bound, scope);
  }
  bound.conditionFactProofs.traits.attacker = new Map(traits.map((trait) => [trait, intrinsic]));
  bound.conditionFactProofs.completeTraits.attacker = intrinsic;
  bound.conditionFactProofs.traits.attackerState = new Map();
  bound.conditionFactProofs.predicates.attacker = new Map();
  bound.conditionFactProofs.suppressions.attacker = new Map();
  for (const [key, value] of Object.entries(facts.resolvedInputValues)) {
    if (!key.startsWith(SOURCE_WORLD_TRAIT_INPUT_PREFIX)) continue;
    if (value !== 0 && value !== 1) throw new TypeError('invalid_source_world_trait_value');
    const parsed: unknown = JSON.parse(key.slice(SOURCE_WORLD_TRAIT_INPUT_PREFIX.length));
    if (!Array.isArray(parsed) || parsed.length !== 2)
      throw new TypeError('invalid_source_world_trait_identity');
    const [actor, fact] = parsed as unknown[];
    if (
      typeof actor !== 'string' ||
      typeof fact !== 'object' ||
      fact === null ||
      !('kind' in fact) ||
      !('scope' in fact) ||
      !('trait' in fact) ||
      fact.kind !== 'trait' ||
      (fact.scope !== 'attacker' && fact.scope !== 'attackerState') ||
      typeof fact.trait !== 'string' ||
      fact.trait.length === 0 ||
      !('present' in fact) ||
      fact.present !== true ||
      Object.keys(fact).some((field) => !['kind', 'scope', 'trait', 'present'].includes(field))
    )
      throw new TypeError('invalid_source_world_trait_identity');
    if (actor !== program.source.sourceInstanceId) continue;
    const proof: ConditionFactProof = {
      kind: 'externalAssumption',
      clock: bound.conditionReadClock,
    };
    assertExternalInitialTrait(bound.traitFactLayers, fact.scope, fact.trait, value === 1, proof);
    projectTraitScope(bound, fact.scope);
    // A combined actor assertion includes the absence/presence of represented initial state.
    if (fact.scope === 'attacker') {
      assertExternalInitialTrait(
        bound.traitFactLayers,
        'attackerState',
        fact.trait,
        value === 1,
        proof,
      );
      projectTraitScope(bound, 'attackerState');
    }
  }
  const live = markerTraitCounts(facts.buffInstances ?? [], program.source.sourceInstanceId);
  for (const [trait, count] of Object.entries(live)) {
    (bound.traits.attackerState as Map<string, boolean>).set(trait, count > 0);
    bound.traitCounts.attackerState = { ...bound.traitCounts.attackerState, [trait]: count };
  }
  return bound;
}
