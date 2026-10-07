import { analyzeActivationFactSet } from '@fgo-lab/schema';
import { createConditionState } from './conditionState';
import { assertExternalInitialTrait, commitTraitFact, addTraitFact, replaceIntrinsicTraitFacts } from './traitFactLayers';
import type { ConditionFactProof } from './conditionRead';
import { createInputFacts, writeInputFact } from './inputFacts';
import { CRITICAL_STARS_INITIAL_INPUT } from './resourceSemantics';
import { sourceMaximumHpInputKey, sourceHpInputKey } from './operationCompiler';
import { seedHp } from './hpResource';
import { npProgramEffects, effectExecutesInNpProgram } from './npProgramScope';
import {
  ConditionReadIdentityError,
  type SourceActivationReceipt,
} from './conditionRead';
import { cloneConditionFactProofs } from './conditionRead';
import {
  actorFormEquals,
  actorFormKey,
  findActorForm,
  findNoblePhantasmVariant,
  getSkillsForActorForm,
  type ActorFormId,
  type ActorFormTransition,
  type MasterEffect,
  type NoblePhantasmVariantRef,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type {
  AppliedPreparationEffect,
  PreNoblePhantasmState,
  PreparationExecutionContext,
  PreparationFailureCode,
  PreparationTransitionResult,
} from './preparationContracts';
import { emptyBattlePointState, reconcilePreparationBattlePoints } from './battlePointResource';
import { rejectPreparation } from './preparationContracts';
import { resolveTargetPolicy, type Origin } from './effectRouting';

import { createOcState } from './ocState';
import { seedBuffInstances, bindBuffCountSources, isBuffCountInput } from './buffInstances';
import { servantBuffCountInputs, mergeInputDefinitions } from './stackQuantities';
import type { PreparationEffectActivation } from './preparationTransaction';

type CanonicalOperation = MasterEffect['execution'][number];
type FormTransformOperation = Extract<CanonicalOperation, { kind: 'transformActorForm' }>;
type VariantSelectionOperation = Extract<
  CanonicalOperation,
  { kind: 'selectNoblePhantasmVariant' }
>;
type TraitMutationOperation = Extract<
  CanonicalOperation,
  { kind: 'contextMutation'; mutation: 'addTrait' | 'removeTrait' | 'suppressInitialTrait' }
>;

const operationsOf = (effects: readonly MasterEffect[]) =>
  npProgramEffects(effects).flatMap(({ execution }) => execution);

const isFormTransform = (operation: CanonicalOperation): operation is FormTransformOperation =>
  operation.kind === 'transformActorForm';

const isVariantSelection = (
  operation: CanonicalOperation,
): operation is VariantSelectionOperation => operation.kind === 'selectNoblePhantasmVariant';

const isRecipientTraitMutation = (
  operation: CanonicalOperation,
): operation is TraitMutationOperation =>
  operation.kind === 'contextMutation' && 'scope' in operation;

export function resolvePreparationIdentityOutcome(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  effects: readonly MasterEffect[],
):
  | { currentFormId: ActorFormId; selectedVariant: NoblePhantasmVariantRef | null }
  | PreparationFailureCode {
  const operations = operationsOf(effects);
  const transforms = operations.filter(isFormTransform);
  const selections = operations.filter(isVariantSelection);
  if (transforms.length > 1 || selections.length > 1) return 'transitionConflict';
  if (transforms.length === 1 && selections.length !== 1) return 'transitionAtomicity';
  const currentFormId = transforms[0]?.targetFormId ?? state.currentFormId;
  if (!findActorForm(servant, currentFormId)) return 'transitionAtomicity';
  const selectedVariant = selections[0]?.variant ?? state.selectedNoblePhantasmVariant;
  if (selectedVariant) {
    const variant = findNoblePhantasmVariant(servant, selectedVariant);
    if (!variant) return 'variantUnavailable';
    if (!actorFormEquals(variant.ref.actorFormId, currentFormId)) return 'variantFormMismatch';
  }
  return { currentFormId, selectedVariant };
}

export function resolvePreparationStructuralOutcome(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  effects: readonly MasterEffect[],
  origin: Origin,
  proof: ConditionFactProof,
):
  | {
      currentFormId: ActorFormId;
      selectedVariant: NoblePhantasmVariantRef | null;
      traitFactLayers: PreNoblePhantasmState['traitFactLayers'];
      conditionFactProofs: PreNoblePhantasmState['conditionFactProofs'];
      noblePhantasmVariant: PreNoblePhantasmState['noblePhantasmVariant'];
      card: PreNoblePhantasmState['card'];
      initialTraitSuppressions: PreNoblePhantasmState['initialTraitSuppressions'];
    }
  | PreparationFailureCode {
  const identity = resolvePreparationIdentityOutcome(servant, state, effects);
  if (typeof identity === 'string') return identity;
  const { currentFormId, selectedVariant } = identity;
  const operations = operationsOf(effects);
  let current = state;
  for (const operation of operations) current = applyPreparationTraitOperation(current, operation, origin, proof);
  const form = findActorForm(servant, currentFormId);
  const variant = selectedVariant ? findNoblePhantasmVariant(servant, selectedVariant) ?? null : null;
  const intrinsic: ConditionFactProof = { kind: 'canonicalIntrinsic', clock: { ...proof.clock, actorFormId: currentFormId } };
  return {
    currentFormId, selectedVariant,
    traitFactLayers: actorFormEquals(state.currentFormId, currentFormId) ? current.traitFactLayers : replaceIntrinsicTraitFacts(current.traitFactLayers, 'attacker', [...(form?.traits ?? []), 'cardNP'], intrinsic),
    conditionFactProofs: current.conditionFactProofs,
    noblePhantasmVariant: variant,
    card: variant?.kind === 'attack' ? variant.card : null,
    initialTraitSuppressions: current.initialTraitSuppressions,
  };
}

/** A canonical context writer changes its native fact and proof at the actual operation. */
export function applyPreparationTraitOperation(state: PreNoblePhantasmState, operation: CanonicalOperation, origin: Origin, proof: ConditionFactProof): PreNoblePhantasmState {
  if (!isRecipientTraitMutation(operation)) return state;
  const actor = operation.scope === 'field' ? null : resolveTargetPolicy(origin, operation.route.target);
  if (operation.scope !== 'field' && !actor) return state;
  const scope = operation.scope === 'field' ? 'field' : actor === 'attacker' ? 'attackerState' : 'targetState';
  if (operation.mutation === 'suppressInitialTrait') {
    if (!actor) return state;
    const suppressions = { ...state.initialTraitSuppressions, [actor]: new Set([...state.initialTraitSuppressions[actor], operation.trait]) };
    const proofs = cloneConditionFactProofs(state.conditionFactProofs);
    (proofs.suppressions[actor] as Map<string, ConditionFactProof>).set(operation.trait, proof);
    return { ...state, initialTraitSuppressions: suppressions, conditionFactProofs: proofs, traitFactLayers: commitTraitFact(state.traitFactLayers, actor, operation.trait, false, 0, proof, [proof]) };
  }
  return { ...state, traitFactLayers: operation.mutation === 'addTrait' ? addTraitFact(state.traitFactLayers, scope, operation.trait, proof) : commitTraitFact(state.traitFactLayers, scope, operation.trait, false, 0, proof, [proof]) };
}

export function requiredPreparationConditionRead(
  effect: MasterEffect,
  activation: ReadonlyMap<MasterEffect, PreparationEffectActivation>,
): SourceActivationReceipt {
  if (!effectExecutesInNpProgram(effect)) return { kind: 'notApplicable' };
  const value = activation.get(effect);
  if (!value) throw new ConditionReadIdentityError('preparation:' + effect.occurrenceId);
  return value.sourceActivation;
}

export function appendPreparationEffects(
  state: PreNoblePhantasmState,
  sourceKind: AppliedPreparationEffect['sourceKind'],
  sourceId: string,
  actorFormId: ActorFormId,
  effects: readonly MasterEffect[],
  activation: ReadonlyMap<MasterEffect, PreparationEffectActivation>,
): readonly AppliedPreparationEffect[] {
  return [
    ...state.activeEffects,
    ...npProgramEffects(effects).map((effect) => ({
      sourceKind,
      sourceId,
      actorFormId,
      occurrenceId: effect.occurrenceId,
      effect,
      sourceActivation: requiredPreparationConditionRead(effect, activation),
    })),
  ];
}

export function findPreparationTransition(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  sourceKind: ActorFormTransition['activation']['sourceKind'],
  sourceId: string,
  effects: readonly MasterEffect[],
): ActorFormTransition | null | PreparationFailureCode {
  const occurrences = new Set(npProgramEffects(effects).map(({ occurrenceId }) => occurrenceId));
  const transitions = servant.actorFormGraph.transitions.filter(
    (transition) =>
      actorFormEquals(transition.from, state.currentFormId) &&
      transition.activation.sourceKind === sourceKind &&
      transition.activation.sourceId === sourceId &&
      transition.activation.effectOccurrenceIds.some((id) => occurrences.has(id)),
  );
  if (transitions.length > 1) return 'transitionConflict';
  return transitions[0] ?? null;
}

export function formCanReachAttackWithoutPreparationNp(
  servant: ServantMaster,
  initial: ActorFormId,
): boolean {
  const pending = [initial];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    const key = actorFormKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    const ref = findActorForm(servant, current)?.baseNoblePhantasmVariant;
    const variant = ref ? findNoblePhantasmVariant(servant, ref) : undefined;
    if (variant?.kind === 'attack') return true;
    const skillOccurrences = new Map(
      getSkillsForActorForm(servant, current).map((skill) => [
        skill.id,
        new Set(npProgramEffects(skill.effects).map((effect) => effect.occurrenceId)),
      ]),
    );
    for (const transition of servant.actorFormGraph.transitions)
      if (
        transition.activation.sourceKind === 'skill' &&
        actorFormEquals(transition.from, current) &&
        transition.activation.effectOccurrenceIds.some((id) =>
          skillOccurrences.get(transition.activation.sourceId)?.has(id),
        )
      )
        pending.push(transition.to);
  }
  return false;
}

export function createPreparationState(
  servant: ServantMaster,
  initialFormId: ActorFormId,
  context: PreparationExecutionContext,
): PreparationTransitionResult {
  const form = findActorForm(servant, initialFormId);
  const variant = form?.baseNoblePhantasmVariant ? findNoblePhantasmVariant(servant, form.baseNoblePhantasmVariant) ?? null : null;
  const initialActivation = analyzeActivationFactSet([]);
  if (initialActivation.status !== 'valid') throw new TypeError('invalid_empty_activation');
  const placeholder: PreNoblePhantasmState = {
    ...createConditionState(
      { cardType: variant?.kind === 'attack' ? variant.card : null, attackerStateTraits: [], targetStateTraits: [], fieldTraits: [], target: { traits: [] }, attackerHpPermille: context.attackerHpPermille ?? null, targetRarity: null, battlePointPhase: context.battlePointPhase ?? null },
      variant,
      form?.traits ?? [], context.canonicalInputValues ?? {}, context.targetPredicates ?? [], context.attackerPredicates ?? [],
      initialActivation.factSet, initialFormId,
    ),
    sourceBindings: [],
    npQuantityWrites: [],
    battlePoints: emptyBattlePointState(),
    hp: {
      actors: {
        attacker: seedHp(context.initialMaximumHp, context.attackerHpPermille ?? null),
        ...Object.fromEntries(
          [...(context.initialSources ?? []), ...(context.terminalSources ?? [])]
            .filter((source) => source.origin === 'support')
            .map((source) => [
              source.sourceInstanceId,
              seedHp(
                validSourceMaximum(context.canonicalInputValues?.[sourceMaximumHpInputKey(source)]),
                context.canonicalInputValues?.[sourceHpInputKey(source)] ?? 1000,
              ),
            ]),
        ),
      },
      receipts: [],
    },
    initialFormId,
    currentFormId: initialFormId,
    selectedNoblePhantasmVariant: form?.baseNoblePhantasmVariant ?? null,
    usedSkillSlots: new Set(),
    transformNoblePhantasmUsed: false,
    activeEffects: [],
    populationEvents: [],
    buffInstances: [],
    initialTraitSuppressions: { attacker: new Set(), target: new Set() },
    npResource: {
      npLevel: context.npLevel,
      capacity: context.resourceSemantics.capacityByNpLevel[context.npLevel - 1]!,
      gauge: context.initialGauge,
    },
    baseOvercharge: null,
    ocState: createOcState(),
    ocInputDefinitions: [],
    uncertainContextWrites: [],
    appliedActions: [],
    terminated: false,
  };
  const initialProof = {
    kind: 'selectedInitialResource' as const,
    clock: {
      phase: 'initial' as const,
      actorFormId: initialFormId,
      actor: 'attacker',
      actionId: null,
      operationId: null,
      sourceInstanceId: null,
      occurrenceId: null,
      valueSetIndex: null,
      valueIndex: null,
    },
  };
  placeholder.inputFacts = createInputFacts(context.canonicalInputValues ?? {}, {
    kind: 'externalAssumption',
    clock: initialProof.clock,
  });
  for (const { fact } of context.worldFacts ?? []) {
    const external: ConditionFactProof = { kind: 'externalAssumption', clock: initialProof.clock };
    if (fact.kind === 'trait') placeholder.traitFactLayers = assertExternalInitialTrait(placeholder.traitFactLayers, fact.scope, fact.trait, fact.present, external);
    else if (fact.quantity !== 'attackerHpPermille') {
      placeholder.quantities[fact.quantity] = fact.value;
      (placeholder.conditionFactProofs.quantities as Map<string, ConditionFactProof>).set(fact.quantity, external);
    }
  }
  const initialEffects = [
    ...servant.skills.flatMap((skill) => skill.effects),
    ...servant.passives.flatMap((skill) => skill.effects),
    ...servant.noblePhantasmVariantGroups.flatMap((group) =>
      group.variants.flatMap((variant) => variant.effects),
    ),
    ...(context.initialSources ?? []).map((source) => source.effect),
    ...(context.terminalSources ?? []).map((source) => source.effect),
  ];
  const sharedInputs = mergeInputDefinitions(
    initialEffects.flatMap((effect) =>
      effect.inputDefinitions.filter((input) => input.kind === 'criticalStars'),
    ),
  );
  if (
    !sharedInputs.some((input) => input.key === CRITICAL_STARS_INITIAL_INPUT.key) &&
    initialEffects.some((effect) =>
      effect.execution.some(
        (operation) =>
          operation.kind === 'resourceMutation' && operation.resource === 'criticalStars',
      ),
    )
  )
    sharedInputs.push(CRITICAL_STARS_INITIAL_INPUT);
  for (const input of sharedInputs) {
    if (placeholder.inputFacts.has(input.key) || input.defaultValue === null) continue;
    placeholder.inputFacts = writeInputFact(placeholder.inputFacts, input.key, input.defaultValue, [
      initialProof,
    ]);
  }
  (placeholder.conditionFactProofs.quantities as Map<string, ConditionFactProof>).set(
    'npGauge:attacker',
    initialProof,
  );
  (placeholder.conditionFactProofs.quantities as Map<string, ConditionFactProof>).set(
    'attackerHpPermille',
    initialProof,
  );
  placeholder.battlePoints = reconcilePreparationBattlePoints(
    servant,
    placeholder,
    context,
  ).battlePoints;
  for (const [actor, value] of Object.entries(placeholder.battlePoints.actors))
    for (const subject of Object.keys(value.domains))
      (placeholder.conditionFactProofs.quantities as Map<string, ConditionFactProof>).set(
        'battlePoint:' + actor + ':' + subject,
        initialProof,
      );
  if (context.initialGauge > placeholder.npResource.capacity)
    return rejectPreparation(placeholder, 'resourceRequirementExceedsCapacity');
  if (!Number.isInteger(context.initialGauge) || context.initialGauge < 0)
    return rejectPreparation(placeholder, 'invalidResourceState');
  try {
    const inputs = mergeInputDefinitions([
      ...(context.stackInputs ?? []),
      ...servantBuffCountInputs(servant, [
        ...(context.initialSources ?? []),
        ...(context.terminalSources ?? []),
      ]),
    ]);
    const invalid = inputs.find((definition) => {
      const count = context.canonicalInputValues?.[definition.key] ?? definition.defaultValue;
      return (
        count === null ||
        !Number.isSafeInteger(count) ||
        count < definition.minimum ||
        count > definition.maximum
      );
    });
    if (invalid)
      return rejectPreparation(
        placeholder,
        'preparationInputRequired',
        invalid,
        'preparation:initialCount',
      );
    for (const definition of inputs) {
      if (definition.kind !== 'effectStackCount') continue;
      const count = context.canonicalInputValues?.[definition.key] ?? definition.defaultValue;
      const { scope, trait } = definition.quantitySource;
      placeholder.stackQuantitySources[definition.key] = definition.quantitySource;
      placeholder.traitFactLayers = commitTraitFact(placeholder.traitFactLayers, scope, trait, count > 0, count, initialProof, [initialProof]);
      placeholder.inputFacts = writeInputFact(placeholder.inputFacts, definition.key, count, [initialProof]);
    }
    const buffInputs = inputs.filter(isBuffCountInput);
    placeholder.buffInstances = seedBuffInstances(buffInputs, context.canonicalInputValues ?? {});
    Object.assign(placeholder, bindBuffCountSources(placeholder, buffInputs));
    for (const instance of placeholder.buffInstances)
      (placeholder.conditionFactProofs.markers as Map<string, ConditionFactProof>).set(
        instance.identity,
        initialProof,
      );

  } catch {
    return rejectPreparation(placeholder, 'invalidPreparationActivation');
  }
  if (
    !form ||
    !servant.actorFormGraph.initialFormIds.some((candidate) =>
      actorFormEquals(candidate, initialFormId),
    )
  )
    return rejectPreparation(placeholder, 'unknownInitialForm');
  return { status: 'applied', state: placeholder };
}

function validSourceMaximum(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
