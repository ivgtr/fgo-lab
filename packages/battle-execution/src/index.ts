export type ActorScope = 'attacker' | 'target';
export type TraitScope = ActorScope | 'field';
export type CardType = 'buster' | 'arts' | 'quick';

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
  | { kind: 'not'; expression: ConditionExpression };

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
  | 'npDamage';

interface OperationBase {
  operationId: string;
  order: number;
  phase: ExecutionPhase;
  source: OperationSource;
  condition: ConditionExpression;
  decisionKey: string | null;
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
  | 'flatDamage';

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
      function:
        | { kind: 'standard' }
        | { kind: 'defensePiercing' }
        | { kind: 'trait'; trait: string; correctionPermille: number }
        | {
            kind: 'traitCount';
            scope: ActorScope;
            traits: readonly string[];
            correctionPermille: number;
            maximumCount: number;
          }
        | { kind: 'stateTrait'; trait: string; correctionPermille: number }
        | { kind: 'hpRatioLow'; maximumCorrectionPermille: number }
        | { kind: 'targetRarity'; rarities: readonly number[]; correctionPermille: number }
        | {
            kind: 'traitExpression';
            expression: ConditionExpression;
            correctionPermille: number;
          }
        | {
            kind: 'battlePointPhase';
            correctionPermille: number;
            maximumPhase: number;
          };
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
  traits: Record<TraitScope, ReadonlySet<string>>;
  quantities: {
    attackerHpPermille: number | null;
    targetRarity: number | null;
    battlePointPhase: number | null;
  };
  modifiers: readonly AppliedModifier[];
  ignoreDefense: boolean;
  ignoreDamageCut: boolean;
  evidence: readonly OperationEvidence[];
  unresolved: readonly ExecutionIssue[];
}

export type ScenarioAssumption = {
  decisionKey: string;
  assertion:
    | { kind: 'trait'; scope: TraitScope; trait: string; present: boolean }
    | {
        kind: 'quantity';
        quantity: keyof BattleState['quantities'];
        value: number;
      };
};

export type ExecutionIssue =
  | { kind: 'unsupportedCondition'; operationId: string; detail: string }
  | { kind: 'unsupportedOperation'; operationId: string; detail: string }
  | { kind: 'unsupportedParameter'; operationId: string; parameter: string }
  | { kind: 'contradictoryAssumptions'; decisionKeys: readonly string[] };

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
  modifier: ModifierKind | 'npSpecial' | null;
  visibility: 'visible' | 'hidden';
  controllability: 'automatic' | 'user';
  decision:
    | { state: 'enabled'; decisionKey: string }
    | { state: 'disabled'; decisionKey: string }
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
