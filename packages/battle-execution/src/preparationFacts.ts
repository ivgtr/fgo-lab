import { hpPermille } from './hpResource';
import { SOURCE_WORLD_TRAIT_INPUT_PREFIX } from './ocConditionInputs';
import { inputFactValues } from './inputFacts';
import type { OcSourceProgram } from './ocSourceProgram';
import { activationFactKey, analyzeActivationFactSet, type ActivationFact } from '@fgo-lab/schema';
import { type ServantMaster } from '@fgo-lab/master-data';
import type { ConditionEvaluationState } from './condition';
import type { PreNoblePhantasmState, PreparationExecutionContext } from './preparationContracts';
import { cloneConditionFactProofs, type ConditionFactProof } from './conditionRead';
import {
  assertExternalInitialTrait,
  cloneTraitFactLayers,
  replaceIntrinsicTraitFacts,
  clearExternalTraitScopes,
} from './traitFactLayers';

/** Preparation uses the same condition facts as damage execution, without a synthetic damage input. */
export function preparationConditionState(
  _servant: ServantMaster,
  state: PreNoblePhantasmState,
  context: PreparationExecutionContext,
  actionFacts: readonly ActivationFact[] = [],
): ConditionEvaluationState | null {
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
  return {
    ...state,
    activationContext: activation.factSet,
  };
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
  bound.traitFactLayers = replaceIntrinsicTraitFacts(
    bound.traitFactLayers,
    'attacker',
    traits,
    intrinsic,
  );
  bound.traitFactLayers = clearExternalTraitScopes(bound.traitFactLayers, [
    'attacker',
    'attackerState',
  ]);
  bound.conditionFactProofs.predicates.attacker = new Map();
  bound.conditionFactProofs.suppressions.attacker = new Map();
  for (const [key, value] of Object.entries(inputFactValues(facts.inputFacts))) {
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
    bound.traitFactLayers = assertExternalInitialTrait(
      bound.traitFactLayers,
      fact.scope,
      fact.trait,
      value === 1,
      proof,
    );

    // A combined actor assertion includes the absence/presence of represented initial state.
    if (fact.scope === 'attacker') {
      bound.traitFactLayers = assertExternalInitialTrait(
        bound.traitFactLayers,
        'attackerState',
        fact.trait,
        value === 1,
        proof,
      );
    }
  }
  return bound;
}
