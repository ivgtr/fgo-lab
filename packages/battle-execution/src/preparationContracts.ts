import type {
  ActorFormId,
  ActorFormTransition,
  CanonicalNpResourceSemantics,
  CanonicalInputDefinition,
  MasterEffect,
  NoblePhantasmVariantRef,
} from '@fgo-lab/master-data';
import type { ActivationFact, PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { NpResourceState } from './npResource';

export interface PreparationExecutionContext {
  resourceSemantics: CanonicalNpResourceSemantics;
  npLevel: NpResourceState['npLevel'];
  initialGauge: number;
  overcharge: 1 | 2 | 3 | 4 | 5;
  canonicalInputValues?: Readonly<Record<string, number>>;
  attackerHpPermille?: number;
  battlePointPhase?: number | null;
}

export interface SkillSlotRef {
  actorLineageId: string;
  slot: 1 | 2 | 3;
}

export interface AppliedPreparationEffect {
  sourceKind: 'skill' | 'noblePhantasm';
  sourceId: string;
  actorFormId: ActorFormId;
  occurrenceId: string;
  effect: MasterEffect;
  /** Present only when preparation itself had to resolve this effect's proc. */
  stochasticOutcome: 'success' | 'failure' | null;
}

export interface AppliedPreparationAction {
  command: PreNoblePhantasmCommand;
  actorFormId: ActorFormId;
  sourceKind: 'skill' | 'noblePhantasm' | 'attackNoblePhantasm';
  sourceId: string;
  selectedEffects: readonly AppliedPreparationEffect[];
  activationFacts: readonly ActivationFact[];
  transition: ActorFormTransition | null;
  resourceBefore: NpResourceState;
  resourceAfter: NpResourceState;
  baseOvercharge: number | null;
}

export interface PreNoblePhantasmState {
  initialFormId: ActorFormId;
  currentFormId: ActorFormId;
  selectedNoblePhantasmVariant: NoblePhantasmVariantRef | null;
  usedSkillSlots: ReadonlySet<1 | 2 | 3>;
  transformNoblePhantasmUsed: boolean;
  activeEffects: readonly AppliedPreparationEffect[];
  stateTraits: {
    attackerState: ReadonlySet<string>;
    targetState: ReadonlySet<string>;
  };
  npResource: NpResourceState;
  baseOvercharge: number | null;
  appliedActions: readonly AppliedPreparationAction[];
  terminated: boolean;
}

export type PreparationFailureCode =
  | 'unknownInitialForm'
  | 'actionAfterAttack'
  | 'skillSlotReused'
  | 'skillSlotUnavailable'
  | 'choiceRequired'
  | 'choiceUnavailable'
  | 'transitionConflict'
  | 'transitionAtomicity'
  | 'variantUnavailable'
  | 'variantFormMismatch'
  | 'transformNoblePhantasmReused'
  | 'transformNoblePhantasmUnavailable'
  | 'transformNoblePhantasmDoesNotReachAttack'
  | 'attackNoblePhantasmUnavailable'
  | 'invalidResourceState'
  | 'resourceRequirementExceedsCapacity'
  | 'insufficientNpGauge'
  | 'invalidResourceMutation'
  | 'unsupportedResourceMutation'
  | 'invalidPreparationActivation'
  | 'ambiguousPreparationCondition'
  | 'preparationInputRequired';

export type PreparationTransitionResult =
  | { status: 'applied'; state: PreNoblePhantasmState }
  | {
      status: 'rejected';
      code: PreparationFailureCode;
      requiredInput: CanonicalInputDefinition | null;
      requiredInputEffectOccurrenceId: string | null;
      state: PreNoblePhantasmState;
    };

export const rejectPreparation = (
  state: PreNoblePhantasmState,
  code: PreparationFailureCode,
  requiredInput: CanonicalInputDefinition | null = null,
  requiredInputEffectOccurrenceId: string | null = null,
): PreparationTransitionResult => ({
  status: 'rejected',
  code,
  requiredInput,
  requiredInputEffectOccurrenceId,
  state,
});
