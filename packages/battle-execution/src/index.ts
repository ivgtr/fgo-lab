export type {
  ActorScope,
  AppliedModifier,
  BattleExecutionResult,
  BattleOperation,
  BattleState,
  CanonicalExclusiveGroup,
  CardType,
  ConditionConstraintConflict,
  ConditionExpression,
  ConstraintValidationIssue,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  ExecutionPhase,
  ModifierKind,
  OperationDecisionPlan,
  OperationEvidence,
  OperationOutcome,
  OperationResult,
  OperationSource,
  ProjectionExplanation,
  TraitScope,
  WorldFactAssertion,
} from './contracts';
export { canNormalizeDamageEffect } from './effectRouting';
export { evaluateCondition as evaluateConditionExpression } from './condition';
export { executeOrderedScenario, type OrderedScenarioExecution } from './engine';
export {
  canonicalExclusiveGroup,
  canonicalExclusiveTraits,
  traitConditionConstraintScope,
  traitConditionReadScopes,
  traitConstraintActorScope,
  traitConstraintLayer,
  traitConstraintPublicScope,
  traitFactConstraintScope,
  type TraitConstraintScope,
} from './conditionSemantics';
export {
  applyNpDamageOperation,
  evaluateNpDamageOperation,
  type NpDamageOperationContext,
  type NpDamageOperationResult,
} from './npDamageOperation';
