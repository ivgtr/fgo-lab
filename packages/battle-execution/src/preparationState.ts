import { npProgramEffects } from './npProgramScope';
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
import { rejectPreparation } from './preparationContracts';
import { resolveTargetPolicy, type Origin } from './effectRouting';

import { createOcState } from './ocState';
import { seedBuffInstances } from './buffInstances';
import { servantBuffCountInputs } from './stackQuantities';
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
      stochasticOutcome: activation.get(effect)?.procOutcome ?? null,
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
    initialFormId,
    currentFormId: initialFormId,
    selectedNoblePhantasmVariant: form?.baseNoblePhantasmVariant ?? null,
    usedSkillSlots: new Set(),
    transformNoblePhantasmUsed: false,
    activeEffects: [],
    stackCounts: { attackerState: {}, targetState: {}, field: {} },
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
  if (context.initialGauge > placeholder.npResource.capacity)
    return rejectPreparation(placeholder, 'resourceRequirementExceedsCapacity');
  if (!Number.isInteger(context.initialGauge) || context.initialGauge < 0)
    return rejectPreparation(placeholder, 'invalidResourceState');
  for (const definition of context.stackInputs ?? []) {
    const count = context.canonicalInputValues?.[definition.key] ?? definition.defaultValue;
    if (!Number.isInteger(count) || count < 0 || count > definition.maximum)
      return rejectPreparation(placeholder, 'invalidPreparationActivation');
    const { scope, trait } = definition.quantitySource;
    placeholder.stackCounts[scope] = { ...placeholder.stackCounts[scope], [trait]: count };
    if (scope !== 'field' && count > 0) (placeholder.stateTraits[scope] as Set<string>).add(trait);
  }
  try {
    placeholder.buffInstances = seedBuffInstances(
      servantBuffCountInputs(servant, [
        ...(context.initialSources ?? []),
        ...(context.terminalSources ?? []),
      ]),
      context.canonicalInputValues ?? {},
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
