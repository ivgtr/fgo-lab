import type { ConditionFactProof } from './conditionRead';
import { createInputFacts, writeInputFact } from './inputFacts';
import { sourceMaximumHpInputKey, sourceHpInputKey } from './operationCompiler';
import { seedHp } from './hpResource';
import { npProgramEffects, effectExecutesInNpProgram } from './npProgramScope';
import {
  ConditionReadIdentityError,
  emptyConditionFactProofs,
  type SourceActivationReceipt,
} from './conditionRead';
import { canonicalExclusiveGroup, canonicalExclusiveTraits } from './conditionSemantics';
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
import { seedBuffInstances, projectBuffInstanceCounts, isBuffCountInput } from './buffInstances';
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
  origin: Origin = 'attacker',
):
  | {
      currentFormId: ActorFormId;
      selectedVariant: NoblePhantasmVariantRef | null;
      stateTraits: PreNoblePhantasmState['stateTraits'];
      stackCounts: PreNoblePhantasmState['stackCounts'];
      initialTraitSuppressions: PreNoblePhantasmState['initialTraitSuppressions'];
    }
  | PreparationFailureCode {
  const identity = resolvePreparationIdentityOutcome(servant, state, effects);
  if (typeof identity === 'string') return identity;
  const { currentFormId, selectedVariant } = identity;
  const operations = operationsOf(effects);
  const attackerState = new Set(state.stateTraits.attackerState);
  const counts = { ...state.stackCounts.attackerState };
  const targetState = new Set(state.stateTraits.targetState);
  const targetCounts = { ...state.stackCounts.targetState };
  const fieldCounts = { ...state.stackCounts.field };
  const suppressions = {
    attacker: new Set(state.initialTraitSuppressions.attacker),
    target: new Set(state.initialTraitSuppressions.target),
  };
  for (const operation of operations) {
    if (!isRecipientTraitMutation(operation)) continue;
    if (operation.scope === 'field') {
      if (operation.mutation === 'addTrait') {
        const group = canonicalExclusiveGroup('field', operation.trait);
        if (group)
          for (const other of canonicalExclusiveTraits('field', group))
            if (other !== operation.trait) fieldCounts[other] = 0;
        fieldCounts[operation.trait] = group
          ? Math.max(1, fieldCounts[operation.trait] ?? 0)
          : (fieldCounts[operation.trait] ?? 0) + 1;
      } else fieldCounts[operation.trait] = 0;
      continue;
    }
    const recipient = resolveTargetPolicy(origin, operation.route.target);
    if (!recipient) continue;
    const traits = recipient === 'attacker' ? attackerState : targetState;
    const quantities = recipient === 'attacker' ? counts : targetCounts;
    if (operation.mutation === 'suppressInitialTrait') suppressions[recipient].add(operation.trait);
    if (operation.mutation === 'addTrait') {
      const scope = recipient === 'attacker' ? 'attackerState' : 'targetState';
      const group = canonicalExclusiveGroup(scope, operation.trait);
      if (group)
        for (const other of canonicalExclusiveTraits(scope, group)) {
          if (other === operation.trait) continue;
          traits.delete(other);
          quantities[other] = 0;
        }
      traits.add(operation.trait);
      quantities[operation.trait] = group
        ? Math.max(1, quantities[operation.trait] ?? 0)
        : (quantities[operation.trait] ?? 0) + 1;
    }
    if (operation.mutation === 'removeTrait') {
      traits.delete(operation.trait);
      quantities[operation.trait] = 0;
    }
  }
  return {
    currentFormId,
    selectedVariant,
    stateTraits: { attackerState, targetState },
    stackCounts: { attackerState: counts, targetState: targetCounts, field: fieldCounts },
    initialTraitSuppressions: suppressions,
  };
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
  const placeholder: PreNoblePhantasmState = {
    inputFacts: new Map(),
    sourceBindings: [],
    conditionWriteProofs: emptyConditionFactProofs(),
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
    stackCounts: { attackerState: {}, targetState: {}, field: {} },
    populationEvents: [],
    buffInstances: [],
    stateTraits: { attackerState: new Set(), targetState: new Set() },
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
  const sharedInputs = mergeInputDefinitions(
    [
      ...servant.skills.flatMap((skill) => skill.effects),
      ...servant.passives.flatMap((skill) => skill.effects),
      ...servant.noblePhantasmVariantGroups.flatMap((group) =>
        group.variants.flatMap((variant) => variant.effects),
      ),
      ...(context.initialSources ?? []).map((source) => source.effect),
      ...(context.terminalSources ?? []).map((source) => source.effect),
    ].flatMap((effect) => effect.inputDefinitions.filter((input) => input.kind === 'criticalStars')),
  );
  for (const input of sharedInputs) {
    if (placeholder.inputFacts.has(input.key) || input.defaultValue === null) continue;
    placeholder.inputFacts = writeInputFact(
      placeholder.inputFacts,
      input.key,
      input.defaultValue,
      [initialProof],
    );
  }
  (placeholder.conditionWriteProofs.quantities as Map<string, ConditionFactProof>).set(
    'npGauge:attacker',
    initialProof,
  );
  (placeholder.conditionWriteProofs.quantities as Map<string, ConditionFactProof>).set(
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
      (placeholder.conditionWriteProofs.quantities as Map<string, ConditionFactProof>).set(
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
      placeholder.stackCounts[scope] = { ...placeholder.stackCounts[scope], [trait]: count };
      (placeholder.conditionWriteProofs.traits[scope] as Map<string, ConditionFactProof>).set(
        trait,
        initialProof,
      );
      if (scope !== 'field' && count > 0)
        (placeholder.stateTraits[scope] as Set<string>).add(trait);
    }
    const buffInputs = inputs.filter(isBuffCountInput);
    placeholder.buffInstances = seedBuffInstances(buffInputs, context.canonicalInputValues ?? {});
    Object.assign(placeholder, projectBuffInstanceCounts(placeholder, buffInputs));
    for (const instance of placeholder.buffInstances)
      (placeholder.conditionWriteProofs.markers as Map<string, ConditionFactProof>).set(
        instance.identity,
        initialProof,
      );
    for (const scope of ['attackerState', 'targetState', 'field'] as const)
      for (const trait of Object.keys(placeholder.stackCounts[scope]))
        (placeholder.conditionWriteProofs.traits[scope] as Map<string, ConditionFactProof>).set(
          trait,
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
