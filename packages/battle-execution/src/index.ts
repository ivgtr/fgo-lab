export type ActorScope = 'attacker' | 'target';
export type TraitScope = ActorScope | 'attackerState' | 'targetState' | 'field';
export type CardType = 'buster' | 'arts' | 'quick';
export type CanonicalExclusiveGroup = 'worldAttribute' | 'fieldRealm';
export interface OperationDecisionPlan {
  activation: 'automatic' | 'user';
  condition: 'evaluate' | 'userMayAssume' | 'unsupported';
}

export type ConditionExpression =
  | { kind: 'always' }
  | { kind: 'trait'; scope: TraitScope; trait: string; present: boolean }
  | {
      kind: 'traitCount';
      scope: TraitScope;
      traits: readonly string[];
      comparison: 'atLeast' | 'atMost' | 'equal';
      count: number;
    }
  | { kind: 'card'; card: CardType }
  | {
      kind: 'quantity';
      quantity: 'attackerHpPermille' | 'targetRarity' | 'battlePointPhase';
      comparison: 'lessThan' | 'atMost' | 'equal' | 'atLeast' | 'greaterThan';
      value: number;
    }
  | { kind: 'all'; expressions: readonly ConditionExpression[] }
  | { kind: 'any'; expressions: readonly ConditionExpression[] }
  | { kind: 'not'; expression: ConditionExpression }
  | {
      kind: 'partialTrait';
      scope: TraitScope;
      traits: readonly { trait: string; present: boolean }[];
    };

export interface OperationEvidence {
  rawPath: string;
  functionId: string;
  parameterKeys: readonly string[];
}

export interface OperationSource {
  origin: 'passive' | 'attacker' | 'craftEssence' | 'support' | 'mysticCode' | 'np';
  sourceInstanceId: string;
  sourceId: string;
  skillId: string;
  effectId: string;
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
  condition: ConditionExpression;
  decisionKey: string | null;
  decisionPlan: OperationDecisionPlan;
  enabledByDefault: boolean;
  evidence: OperationEvidence;
  presentation: { label: string; sourceName: string; skillName: string };
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
      kind: 'addModifier';
      modifier: ModifierKind;
      valuePermille: number;
      card: CardType | null;
    })
  | (OperationBase & {
      kind: 'changeModifierRate';
      modifier: ModifierKind;
      ratePermille: number;
    })
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
  order: number;
}

export interface BattleState {
  card: CardType;
  traits: Record<TraitScope, ReadonlyMap<string, boolean>>;
  traitCounts: Record<TraitScope, Readonly<Record<string, number>>>;
  quantities: {
    attackerHpPermille: number | null;
    targetRarity: number | null;
    battlePointPhase: number | null;
  };
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

export type ExecutionIssue =
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
        'unsupportedCondition' | 'constraintComplexityExceeded' | 'unrepresentableQuantityRange';
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
      quantity: keyof BattleState['quantities'];
      values: readonly number[];
    }
  | {
      kind: 'quantityRange';
      quantity: keyof BattleState['quantities'];
      ranges: readonly { min: number; max: number }[];
    }
  | { kind: 'cardMismatch'; cards: readonly CardType[] }
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
  valuePermille: number | null;
  value: number | null;
  modifier: ModifierKind | 'npSpecial' | null;
  source: OperationSource;
  executionSupport: 'supported' | 'unsupported';
  outcome: OperationOutcome;
  visibility: 'visible' | 'hidden';
  controllability: 'automatic' | 'user';
  decision:
    | {
        state: 'enabled';
        decisionKey: string;
        kind: 'effect';
        plan: OperationDecisionPlan;
      }
    | {
        state: 'disabled';
        decisionKey: string;
        kind: 'effect';
        plan: OperationDecisionPlan;
      }
    | {
        state: 'enabled' | 'disabled';
        decisionKey: string;
        kind: 'worldFact';
        fact: WorldFactAssertion['fact'];
      }
    | { state: 'none' };
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
  precision: 'exact' | 'approximate' | 'unsupported';
  issues: readonly ExecutionIssue[];
}

export {
  canNormalizeDamageEffect,
  evaluateConditionExpression,
  executeOrderedScenario,
  type OrderedScenarioExecution,
} from './engine';
export { canonicalExclusiveGroup } from './conditionSemantics';
export {
  applyNpDamageOperation,
  evaluateNpDamageOperation,
  type NpDamageOperationContext,
  type NpDamageOperationResult,
} from './npDamageOperation';
import type { NpDamageSpec } from '@fgo-lab/master-data';
