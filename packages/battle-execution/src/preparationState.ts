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
      activeStateTraits: ReadonlySet<string>;
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
  const traits = new Set(state.activeStateTraits);
  for (const operation of operations) {
    if (!isRecipientTraitMutation(operation)) continue;
    if (operation.mutation === 'addTrait') traits.add(operation.trait);
    if (operation.mutation === 'removeTrait') traits.delete(operation.trait);
  }
  return { currentFormId, selectedVariant, activeStateTraits: traits };
}

function removeExplicitlyClearedEffects(
  active: readonly AppliedPreparationEffect[],
  effects: readonly MasterEffect[],
): readonly AppliedPreparationEffect[] {
  const removedTraits = new Set(
    operationsOf(effects).flatMap((operation) =>
      isRecipientTraitMutation(operation) && operation.mutation === 'removeTrait'
        ? [operation.trait]
        : [],
    ),
  );
  if (removedTraits.size === 0) return active;
  return active.filter(({ effect }) =>
    operationsOf([effect]).every(
      (operation) =>
        !isRecipientTraitMutation(operation) ||
        operation.mutation !== 'addTrait' ||
        !removedTraits.has(operation.trait),
    ),
  );
}

export function appendPreparationEffects(
  state: PreNoblePhantasmState,
  sourceKind: AppliedPreparationEffect['sourceKind'],
  sourceId: string,
  actorFormId: ActorFormId,
  effects: readonly MasterEffect[],
): readonly AppliedPreparationEffect[] {
  const retained = removeExplicitlyClearedEffects(state.activeEffects, effects);
  return [
    ...retained,
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
    activeStateTraits: new Set(),
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
