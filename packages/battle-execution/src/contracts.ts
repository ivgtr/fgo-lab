import type {
  CanonicalInputDefinition,
  EffectProc,
  EffectProcSelection,
  ModifierValueExpression,
  NpDamageSpec,
  TraitReadPolicy,
} from '@fgo-lab/master-data';
import type {
  ActivationWitness,
  TargetAttributeContext,
  TargetClassContext,
  TargetPredicate,
} from '@fgo-lab/schema';

export type ActorScope = 'attacker' | 'target';
export type EffectContributionScope =
  'personal' | 'partyWide' | 'partyOther' | 'enemyApplied' | 'external';
export type TraitScope = ActorScope | 'attackerState' | 'targetState' | 'field';
export type CardType = 'buster' | 'arts' | 'quick';
export type CanonicalExclusiveGroup = 'worldAttribute' | 'fieldRealm' | 'npCardForm';
export interface OperationDecisionPlan {
  activation: 'automatic' | 'user';
  condition: 'evaluate' | 'userMayAssume' | 'unsupported';
}

export type ConditionExpression =
  | { kind: 'always' }
  | {
      kind: 'trait';
      scope: TraitScope;
      trait: string;
      present: boolean;
      readPolicy?: TraitReadPolicy;
    }
  | {
      kind: 'targetPredicate';
      scope: ActorScope;
      predicate: TargetPredicate;
      present: boolean;
    }
  | {
      kind: 'traitCount';
      scope: TraitScope;
      traits: readonly string[];
      readPolicy?: TraitReadPolicy;
      comparison: 'atLeast' | 'atMost' | 'equal';
      count: number;
    }
  | { kind: 'card'; card: CardType }
  | { kind: 'choice'; group: string; candidate: string }
  | { kind: 'operationTrigger'; source: string; position: number }
  | {
      kind: 'sourceQuantity';
      quantity: 'battlePointRate';
      subjectId: string;
      comparison: 'atMost' | 'atLeast';
      value: number;
    }
  | {
      kind: 'quantity';
      quantity: 'attackerHpPermille' | 'targetRarity' | 'battlePointPhase';
      subjectId?: string;
      comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
      value: number;
    }
  | {
      kind: 'inputQuantity';
      inputKey: string;
      comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
      value: number;
    }
  | { kind: 'all'; expressions: readonly ConditionExpression[] }
  | { kind: 'any'; expressions: readonly ConditionExpression[] }
  | { kind: 'not'; expression: ConditionExpression };

export interface OperationEvidence {
  rawPath: string;
  functionId: string;
}

export interface OperationSource {
  origin: 'passive' | 'attacker' | 'craftEssence' | 'support' | 'mysticCode' | 'np';
  sourceInstanceId: string;
  sourceId: string;
  skillId: string;
  effectId: string;
  effectOccurrenceId: string;
  transactionGroupId?: string;
}

export type ExecutionPhase =
  | 'passive'
  | 'attackerSkill'
  | 'craftEssence'
  | 'support'
  | 'mysticCode'
  | 'beforeNpDamage'
  | 'damageEvaluation'
  | 'npDamage';

interface OperationBase {
  operationId: string;
  order: number;
  phase: ExecutionPhase;
  source: OperationSource;
  contributionScope: EffectContributionScope;
  condition: ConditionExpression;
  decisionKey: string | null;
  decisionPlan: OperationDecisionPlan;
  sourceEnabled: boolean;
  enabledByDefault: boolean;
  gameActivation: 'constant' | 'skillUse' | 'npBeforeDamage' | 'derived';
  proc: EffectProc;
  procSelection: EffectProcSelection;
  procRatePermille: number | null;
  activation:
    | { kind: 'sourceDefault' }
    | {
        kind: 'linkedDecisions';
        links: readonly {
          decisionKey: string;
          reason: 'sourceSkill' | 'traitPrerequisite';
          selection: 'operationEnabled' | 'conditionSatisfied';
        }[];
      };
  evidence: OperationEvidence;
  presentation: { label: string; sourceName: string; skillName: string };
  inputDefinitions: readonly CanonicalInputDefinition[];
}

export type ModifierKind =
  | 'attackBuff'
  | 'defenseBuff'
  | 'cardBuff'
  | 'cardResistance'
  | 'npDamageBuff'
  | 'npResistance'
  | 'eventDamageBuff'
  | 'specialDamageBuff'
  | 'powerMod'
  | 'flatDamage'
  | 'ignoreDefense'
  | 'ignoreDamageCut';

export type OperationModifierValueExpression =
  | Extract<ModifierValueExpression, { kind: 'inputLinear' }>
  | (Extract<ModifierValueExpression, { kind: 'inverseHpLinear' | 'hpRangeLinear' }> & {
      quantitySource: { kind: 'attackerHpPermille' } | { kind: 'canonicalInput'; inputKey: string };
    });

export type BattleOperation =
  | (OperationBase & {
      kind: 'addTrait';
      scope: TraitScope;
      trait: string;
    })
  | (OperationBase & {
      kind: 'removeTrait';
      scope: TraitScope;
      trait: string;
    })
  | (OperationBase & {
      kind: 'suppressInitialTrait';
      scope: ActorScope;
      trait: string;
    })
  | (OperationBase & {
      kind: 'addQuantity';
      quantity: 'battlePointPhase';
      subjectId: string;
      amount: number;
      applicationTiming: 'duringExecution' | 'representedByCurrentInput';
    })
  | (OperationBase & {
      kind: 'addModifier';
      modifier: ModifierKind;
      valuePermille: number;
      valueExpression: OperationModifierValueExpression | null;
      card: CardType | null;
    })
  | (OperationBase & {
      kind: 'changeModifierRate';
      modifier: ModifierKind;
      ratePermille: number;
    })
  | (OperationBase & { kind: 'changeCardType'; card: CardType; stateTraits: readonly string[] })
  | (OperationBase & { kind: 'ignoreDefense' })
  | (OperationBase & { kind: 'ignoreDamageCut' })
  | (OperationBase & {
      kind: 'executeNpDamage';
      damage: NpDamageSpec;
      overcharge: number;
      selectedNpLevel: number;
      npMultipliers: readonly [number, number, number, number, number];
    });

export interface AppliedModifier {
  operationId: string;
  source: OperationSource;
  modifier: ModifierKind;
  valuePermille: number;
  card: CardType | null;
  order: number;
}

export interface BattleState {
  card: CardType;
  traits: Record<TraitScope, ReadonlyMap<string, boolean>>;
  actorPredicates: Record<
    ActorScope,
    ReadonlyMap<string, { predicate: TargetPredicate; present: boolean }>
  >;
  traitCounts: Record<TraitScope, Readonly<Record<string, number>>>;
  initialTraitSuppressions: Record<ActorScope, ReadonlySet<string>>;
  quantities: {
    attackerHpPermille: number | null;
    targetRarity: number | null;
    battlePointPhase: number | null;
  };
  activationWitnesses: readonly ActivationWitness[];
  resolvedInputValues: Readonly<Record<string, number>>;
  modifiers: readonly AppliedModifier[];
  modifierRates: Partial<Record<ModifierKind, number>>;
  ignoreDefense: boolean;
  ignoreDamageCut: boolean;
  evidence: readonly OperationEvidence[];
  unresolved: readonly ExecutionIssue[];
}

export type EffectDecision = {
  decisionKey: string;
  operationEnabled: boolean;
  conditionSatisfaction: 'evaluate' | 'assumeSatisfied';
};

export type WorldFactAssertion = {
  decisionKey: string;
  fact:
    | { kind: 'trait'; scope: TraitScope; trait: string; present: boolean }
    | { kind: 'quantity'; quantity: keyof BattleState['quantities']; value: number };
};

export type TargetPredicateAssertion = {
  sourceKey: string;
  predicate: TargetPredicate;
  present: boolean;
};

export type ExecutionIssue =
  | {
      kind: 'invalidTargetContext';
      detail:
        | 'noSatisfiableTarget'
        | 'ambiguousTargetResult'
        | 'identityWorldFactForbidden'
        | 'unknownFamily'
        | 'targetSearchLimit';
      sourceKeys: readonly string[];
    }
  | { kind: 'invalidCanonicalInput'; inputKey: string; detail: 'unknownInputKey' }
  | {
      kind: 'invalidProcSelection';
      operationId: string;
      detail: 'duplicateEffectDecision' | 'missingSuccessCountDefinition';
    }
  | { kind: 'unsupportedCondition'; operationId: string; detail: string }
  | { kind: 'unsupportedOperation'; operationId: string; detail: string }
  | { kind: 'unsupportedParameter'; operationId: string; parameter: string }
  | ConstraintValidationIssue
  | { kind: 'unsafeLocalConditionDecision'; operationId: string; detail: string };

export type ConstraintValidationIssue =
  | {
      kind: 'constraintConflict';
      sourceKeys: readonly string[];
      conflicts: readonly ConditionConstraintConflict[];
    }
  | {
      kind: 'constraintValidationUnsupported';
      sourceKeys: readonly string[];
      reason:
        | 'unsupportedCondition'
        | 'constraintComplexityExceeded'
        | 'unrepresentableQuantityRange'
        | 'quantityFactOutOfDomain';
    };

export type ConditionConstraintConflict =
  | {
      kind: 'exclusiveTrait';
      scope: TraitScope;
      group: CanonicalExclusiveGroup;
      traits: readonly string[];
    }
  | { kind: 'traitPolarity'; scope: TraitScope; trait: string }
  | {
      kind: 'quantityEquality';
      quantity: keyof BattleState['quantities'] | 'battlePointRate' | `input:${string}`;
      values: readonly number[];
    }
  | {
      kind: 'quantityRange';
      quantity: keyof BattleState['quantities'] | 'battlePointRate' | `input:${string}`;
      ranges: readonly { min: number; max: number }[];
    }
  | { kind: 'cardMismatch'; cards: readonly CardType[] }
  | { kind: 'choiceConflict'; group: string; candidates: readonly string[] }
  | { kind: 'targetPredicatePolarity'; predicate: TargetPredicate }
  | {
      kind: 'targetIdentityConflict';
      axis: 'class' | 'attribute';
      values: readonly string[];
    }
  | { kind: 'unsatisfiableExpression' };

export type OperationOutcome =
  'applied' | 'notApplied' | 'notRelevant' | 'impossible' | 'unsupported';

export interface ProjectionExplanation {
  code:
    | 'applied'
    | 'disabled'
    | 'conditionNotMet'
    | 'cardMismatch'
    | 'targetMismatch'
    | 'stateMutationOnly'
    | 'unresolved';
  condition: ConditionExpression | null;
}

export interface EffectProjection {
  projectionKey: string;
  operationId: string;
  label: string;
  sourceName: string;
  skillName: string;
  gameActivation: 'constant' | 'skillUse' | 'npBeforeDamage' | 'derived';
  sourceActive: boolean;
  proc: EffectProc;
  procRatePermille: number | null;
  valuePermille: number | null;
  value: number | null;
  requiredQuantity: 'attackerHpPermille' | null;
  requiredQuantityOwner: 'attacker' | 'source' | null;
  requiredInputs: readonly CanonicalInputDefinition[];
  modifier: ModifierKind | 'npSpecial' | 'cardTypeChange' | null;
  source: OperationSource;
  contributionScope: EffectContributionScope;
  activationSources: readonly OperationSource[];
  executionSupport: 'supported' | 'unsupported';
  outcome: OperationOutcome;
  visibility: 'visible' | 'hidden';
  controllability: 'automatic' | 'user';
  selectionGroups: readonly {
    groupKey: string;
    candidateKey: string;
  }[];
  decision:
    | {
        state: 'enabled';
        decisionKey: string;
        kind: 'effect';
        plan: OperationDecisionPlan;
        targetContext?: {
          predicates: readonly TargetPredicate[];
          fallbackClass: Extract<TargetClassContext, { kind: 'relative' }>;
          fallbackAttribute: Extract<TargetAttributeContext, { kind: 'relative' }>;
        };
      }
    | {
        state: 'disabled';
        decisionKey: string;
        kind: 'effect';
        plan: OperationDecisionPlan;
        targetContext?: {
          predicates: readonly TargetPredicate[];
          fallbackClass: Extract<TargetClassContext, { kind: 'relative' }>;
          fallbackAttribute: Extract<TargetAttributeContext, { kind: 'relative' }>;
        };
      }
    | {
        state: 'enabled' | 'disabled';
        decisionKey: string;
        kind: 'worldFact';
        fact: WorldFactAssertion['fact'];
      }
    | {
        state: 'enabled' | 'disabled';
        decisionKey: string;
        kind: 'targetPredicate';
        target: TargetPredicate;
        fallbackClass: TargetClassContext | null;
        fallbackAttribute: TargetAttributeContext | null;
      }
    | { state: 'none' };
  conditionDecision: 'none' | 'evaluate' | 'assumeSatisfied';
  explanation: ProjectionExplanation;
}

export interface OperationResult {
  operation: BattleOperation;
  outcome: OperationOutcome;
  condition: 'satisfied' | 'unsatisfied' | 'unresolved';
  state: BattleState;
  projection: EffectProjection;
  issue: ExecutionIssue | null;
}

export interface BattleExecutionResult {
  state: BattleState;
  operations: readonly OperationResult[];
  projections: readonly EffectProjection[];
  precision: 'exact' | 'approximate' | 'inputRequired' | 'unsupported';
  issues: readonly ExecutionIssue[];
  requiredInputs: readonly (CanonicalInputDefinition & { effectOccurrenceIds: string[] })[];
  inputDefinitions: readonly CanonicalInputDefinition[];
}
