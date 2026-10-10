import type { ConditionEvaluationState } from './condition';
import type { PreparationNpQuantityWrite } from './preparationProofs';
import type { StochasticSelection } from './stochasticPossibilities';
import type { SourceActivationReceipt } from './conditionRead';
import type { HpState } from './hpResource';
import type { NpTransferReceipt } from './npTransfer';
import type {
  ActorFormId,
  MasterDataSnapshot,
  StackInputDefinition,
  ActorFormTransition,
  CanonicalNpResourceSemantics,
  CanonicalInputDefinition,
  BattlePointDomain,
  MasterEffect,
  NoblePhantasmVariantRef,
  NoblePhantasmVariant,
  OcExecutionOperation,
} from '@fgo-lab/master-data';
import type { ActivationFact, PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { NpResourceState } from './npResource';
import type { OcState, NpOcUseReceipt, OcActionOutcome } from './ocState';
import type { ContributionApplicationPolicy } from './executionTypes';
import type {
  WorldFactAssertion,
  TargetPredicateAssertion,
  ConditionExpression,
} from './contracts';
import type { SourceEffect } from './sourceCollection';
import type { CountedBuffInstance } from './buffInstances';
import type { PopulationEvent } from './populationCounts';
import type { BattlePointState } from './battlePointResource';
import type { InputFacts } from './inputFacts';
import type { SourceExecutionBinding } from './executionBinding';
import type { PreparationSourceExecution } from './preparationExecution';
import type {
  PreparationOcAttemptSnapshot,
  PreparationBattlePointStep,
} from './preparationAttemptObservation';
import type { PreparationHpActionSnapshot } from './hpExecutionObservation';

export interface PreparationExecutionContext {
  stochasticSelection: StochasticSelection;
  planningOnly?: boolean;
  planningConditionChoices?: ReadonlyMap<string, boolean>;
  resourceSemantics: CanonicalNpResourceSemantics;
  npLevel: NpResourceState['npLevel'];
  initialGauge: number;
  overcharge: 1 | 2 | 3 | 4 | 5;
  stackInputs?: readonly StackInputDefinition[];
  canonicalInputValues?: Readonly<Record<string, number>>;
  initialMaximumHp?: number;
  maximumHpByForm?: ReadonlyMap<string, number>;
  attackerHpPermille?: number;
  battlePointPhase?: number | null;
  battlePointDomains?: readonly BattlePointDomain[];
  initialBattlePointPoints?: Readonly<Record<string, number>>;
  worldFacts?: readonly WorldFactAssertion[];
  targetPredicates?: readonly TargetPredicateAssertion[];
  attackerPredicates?: readonly TargetPredicateAssertion[];
  activationFacts?: readonly ActivationFact[];
  policy?: ContributionApplicationPolicy;
  initialSources?: readonly SourceEffect[];
  terminalSources?: readonly SourceEffect[];
}

export interface SkillSlotRef {
  actorLineageId: string;
  slot: 1 | 2 | 3;
}

export interface AppliedPreparationEffect {
  sourceActivation: SourceActivationReceipt;
  sourceKind: 'skill' | 'noblePhantasm';
  sourceId: string;
  actorFormId: ActorFormId;
  occurrenceId: string;
  effect: MasterEffect;
}

export interface AppliedPreparationAction {
  hpBefore?: HpState | undefined;
  hpAfter?: HpState | undefined;
  command: PreNoblePhantasmCommand;
  actorFormId: ActorFormId;
  sourceKind: 'skill' | 'noblePhantasm' | 'attackNoblePhantasm';
  sourceId: string;
  selectedEffects: readonly AppliedPreparationEffect[];
  activationFacts: readonly ActivationFact[];
  transition: ActorFormTransition | null;
  resourceBefore: NpResourceState;
  resourceAfter: NpResourceState;
  resourceTransaction: {
    afterConsumption: NpResourceState;
    mutations: readonly {
      step: number;
      occurrenceId: string;
      before: NpResourceState;
      after: NpResourceState;
    }[];
  };
  baseOvercharge: number | null;
  ocUse: NpOcUseReceipt | null;
  ocOutcomes: readonly OcActionOutcome[];
}

export interface PreNoblePhantasmState extends ConditionEvaluationState {
  /** Last explicit external intent; live physical facts remain in the state below. */
  externalBinding: {
    readonly inputs: Readonly<Record<string, number>>;
    readonly worldFacts: readonly WorldFactAssertion[];
  };
  inputFacts: InputFacts;
  sourceBindings: readonly PreparationSnapshot<SourceExecutionBinding>[];
  npQuantityWrites: readonly PreparationNpQuantityWrite[];
  battlePoints: BattlePointState;
  hp?: HpState | undefined;
  populationEvents: readonly PopulationEvent[];
  npTransfers?: readonly NpTransferReceipt[];
  uncertainEnemyCharge?: boolean;
  uncertainPlayerNp?: boolean;
  buffInstances: readonly CountedBuffInstance[];
  initialFormId: ActorFormId;
  currentFormId: ActorFormId;
  selectedNoblePhantasmVariant: NoblePhantasmVariantRef | null;
  usedSkillSlots: ReadonlySet<1 | 2 | 3>;
  transformNoblePhantasmUsed: boolean;
  activeEffects: readonly PreparationSnapshot<AppliedPreparationEffect>[];
  initialTraitSuppressions: { attacker: ReadonlySet<string>; target: ReadonlySet<string> };
  npResource: NpResourceState;
  ocState: OcState;
  ocInputDefinitions: readonly CanonicalInputDefinition[];
  uncertainContextWrites: readonly {
    scope: 'attackerState' | 'targetState' | 'field';
    trait: string;
    actor?: string;
  }[];
  baseOvercharge: number | null;
  appliedActions: readonly PreparationSnapshot<AppliedPreparationAction>[];
  terminated: boolean;
}

export type PreparationFailureCode =
  | 'invalidPreparationBinding'
  | 'attackerDead'
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
  | 'unsupportedHpExecution'
  | 'invalidHpExecution'
  | 'unsupportedOcExecution'
  | 'invalidOcExecution'
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
      recoveryInputDefinitions?: readonly CanonicalInputDefinition[];
      state: PreNoblePhantasmState;
    };

/** Canonical declarations remain owned by master; physical snapshots expose no writable state. */
export type PreparationSnapshot<T> = T extends PreNoblePhantasmState
  ? PreparationStateSnapshot
  : T extends
        | MasterEffect
        | CanonicalNpResourceSemantics
        | MasterEffect['execution'][number]
        | CanonicalInputDefinition
        | NoblePhantasmVariant
        | ActorFormTransition
        | ActivationFact
        | BattlePointDomain
        | Extract<
            OcExecutionOperation,
            { kind: 'grantOcBoost' | 'grantOcApplicationRate' }
          >['cells'][number][number]
        | Extract<
            OcExecutionOperation,
            { kind: 'grantOcApplicationRate' }
          >['cells'][number][number]['amount']
        | ConditionExpression
    ? Readonly<T>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<K, PreparationSnapshot<V>>
      : T extends ReadonlySet<infer V>
        ? ReadonlySet<PreparationSnapshot<V>>
        : T extends readonly unknown[]
          ? { readonly [K in keyof T]: PreparationSnapshot<T[K]> }
          : T extends object
            ? { readonly [K in keyof T]: PreparationSnapshot<T[K]> }
            : T;

type SnapshotFields<T> = { readonly [K in keyof T]: PreparationSnapshot<T[K]> };
export interface PreparationStateSnapshot extends SnapshotFields<PreNoblePhantasmState> {
  readonly npResource: PreparationSnapshot<PreNoblePhantasmState['npResource']>;
}
export interface PreparationContextSnapshot extends SnapshotFields<PreparationExecutionContext> {
  readonly resourceSemantics: Readonly<CanonicalNpResourceSemantics>;
}
export type PreparationTransitionObservation = PreparationSnapshot<PreparationTransitionResult>;

/** The completed result itself is the native action receipt, never a mutable reducer draft. */
export type PreparationCompletedTransitionResult = PreparationTransitionObservation & {
  readonly before: PreparationStateSnapshot;
  readonly command: PreparationSnapshot<PreNoblePhantasmCommand> | null;
  readonly sources: readonly PreparationSourceExecution[];
  readonly committedSources: readonly PreparationSourceExecution[];
  readonly observations: {
    readonly ocAttempts: readonly PreparationOcAttemptSnapshot[];
    readonly battlePointSteps: readonly PreparationSnapshot<PreparationBattlePointStep>[];
    readonly hpActions: readonly PreparationHpActionSnapshot[];
  };
};

export const rejectPreparation = (
  state: PreNoblePhantasmState,
  code: PreparationFailureCode,
  requiredInput: CanonicalInputDefinition | null = null,
  requiredInputEffectOccurrenceId: string | null = null,
  recoveryInputDefinitions: readonly CanonicalInputDefinition[] = [],
): PreparationTransitionResult => ({
  status: 'rejected',
  code,
  requiredInput,
  requiredInputEffectOccurrenceId,
  ...(recoveryInputDefinitions.length ? { recoveryInputDefinitions } : {}),
  state,
});

export interface PreparationContextOptions {
  stochasticSelection?: StochasticSelection;
  master?: MasterDataSnapshot;
  initialMaximumHp?: number;
  initialOvercharge?: 1 | 2 | 3 | 4 | 5;
  policy?: PreparationExecutionContext['policy'];
  initialBattlePointPoints?: Readonly<Record<string, number>>;
}
