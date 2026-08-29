import type {
  ActorFormId,
  ActorFormTransition,
  MasterEffect,
  NoblePhantasmVariantRef,
} from '@fgo-lab/master-data';
import type { ActivationFact, PreNoblePhantasmCommand } from '@fgo-lab/schema';

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
}

export interface AppliedPreparationAction {
  command: PreNoblePhantasmCommand;
  actorFormId: ActorFormId;
  sourceKind: 'skill' | 'noblePhantasm' | 'attackNoblePhantasm';
  sourceId: string;
  selectedEffects: readonly AppliedPreparationEffect[];
  activationFacts: readonly ActivationFact[];
  transition: ActorFormTransition | null;
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
  | 'attackNoblePhantasmUnavailable';

export type PreparationTransitionResult =
  | { status: 'applied'; state: PreNoblePhantasmState }
  | { status: 'rejected'; code: PreparationFailureCode; state: PreNoblePhantasmState };

export const rejectPreparation = (
  state: PreNoblePhantasmState,
  code: PreparationFailureCode,
): PreparationTransitionResult => ({ status: 'rejected', code, state });
