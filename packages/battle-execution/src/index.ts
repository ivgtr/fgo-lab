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
export { conditionHasActivationFact, conditionIsActivationLocal } from './activation';
export {
  activationRequirementOwnerSelected,
  collectActivationRequirementOwners,
  type ActivationRequirementOwner,
} from './activationContext';
export {
  executeOrderedScenario,
  executeOrderedScenarioCandidates,
  prepareOrderedScenario,
  type OrderedScenarioExecution,
  type PreparedOrderedScenario,
  type ResolvedCanonicalInputSet,
} from './engine';
export {
  MAX_TARGET_CANDIDATES,
  materializeTargetCandidate,
  resolveTargetCandidates,
  validateTargetCandidateConstraint,
  type TargetCandidate,
  type TargetCandidateConstraintResult,
  type TargetResolution,
} from './targetContext';
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
