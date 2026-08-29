import {
  actorFormEquals,
  actorFormKey,
  findActorForm,
  findNoblePhantasmVariant,
  type ActorFormId,
  type ActorFormTransition,
  type MasterEffect,
  type NoblePhantasmVariantRef,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type {
  AppliedPreparationEffect,
  PreNoblePhantasmState,
  PreparationFailureCode,
  PreparationTransitionResult,
} from './preparationContracts';
import { rejectPreparation } from './preparationContracts';
import { resolveTargetPolicy } from './effectRouting';

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
  effects.flatMap(({ execution }) => execution);

const isFormTransform = (operation: CanonicalOperation): operation is FormTransformOperation =>
  operation.kind === 'transformActorForm';

const isVariantSelection = (
  operation: CanonicalOperation,
): operation is VariantSelectionOperation => operation.kind === 'selectNoblePhantasmVariant';

const isRecipientTraitMutation = (
  operation: CanonicalOperation,
): operation is TraitMutationOperation =>
  operation.kind === 'contextMutation' &&
  'scope' in operation &&
  operation.scope === 'recipientState';

export function resolvePreparationStructuralOutcome(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
  effects: readonly MasterEffect[],
):
  | {
      currentFormId: ActorFormId;
      selectedVariant: NoblePhantasmVariantRef | null;
      stateTraits: PreNoblePhantasmState['stateTraits'];
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
  for (const operation of operations) {
    if (!isRecipientTraitMutation(operation)) continue;
    if (resolveTargetPolicy('attacker', operation.targetPolicy) !== 'attacker') continue;
    if (operation.mutation === 'addTrait') attackerState.add(operation.trait);
    if (operation.mutation === 'removeTrait') attackerState.delete(operation.trait);
  }
  return {
    currentFormId,
    selectedVariant,
    stateTraits: { ...state.stateTraits, attackerState },
  };
}

export function appendPreparationEffects(
  state: PreNoblePhantasmState,
  sourceKind: AppliedPreparationEffect['sourceKind'],
  sourceId: string,
  actorFormId: ActorFormId,
  effects: readonly MasterEffect[],
): readonly AppliedPreparationEffect[] {
  return [
    ...state.activeEffects,
    ...effects.map((effect) => ({
      sourceKind,
      sourceId,
      actorFormId,
      occurrenceId: effect.occurrenceId,
      effect,
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
  const occurrences = new Set(effects.map(({ occurrenceId }) => occurrenceId));
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
    for (const transition of servant.actorFormGraph.transitions)
      if (transition.activation.sourceKind === 'skill' && actorFormEquals(transition.from, current))
        pending.push(transition.to);
  }
  return false;
}

export function createPreparationState(
  servant: ServantMaster,
  initialFormId: ActorFormId,
): PreparationTransitionResult {
  const form = findActorForm(servant, initialFormId);
  const placeholder: PreNoblePhantasmState = {
    initialFormId,
    currentFormId: initialFormId,
    selectedNoblePhantasmVariant: form?.baseNoblePhantasmVariant ?? null,
    usedSkillSlots: new Set(),
    transformNoblePhantasmUsed: false,
    activeEffects: [],
    stateTraits: { attackerState: new Set(), targetState: new Set() },
    appliedActions: [],
    terminated: false,
  };
  if (
    !form ||
    !servant.actorFormGraph.initialFormIds.some((candidate) =>
      actorFormEquals(candidate, initialFormId),
    )
  )
    return rejectPreparation(placeholder, 'unknownInitialForm');
  return { status: 'applied', state: placeholder };
}
