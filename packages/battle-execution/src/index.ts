export type {
  ActorScope,
  ActivationContext,
  AppliedModifier,
  BattleExecutionResult,
  BattleExecutionState,
  BattleOperation,
  BattleStateBase,
  CanonicalExclusiveGroup,
  CardType,
  ConditionConstraintConflict,
  ConditionExpression,
  ConstraintValidationIssue,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  ExecutionPhase,
  ExecutableBattleState,
  ModifierKind,
  OperationDecisionPlan,
  OperationEvidence,
  OperationOutcome,
  OperationResult,
  OperationSource,
  ProjectionExplanation,
  RejectedBattleState,
  TraitScope,
  WorldFactAssertion,
} from './contracts';
export { canNormalizeDamageEffect } from './effectRouting';
export { evaluateCondition as evaluateConditionExpression } from './condition';
export {
  analyzeActivationCondition,
  conditionAllowsEffectLocalDecision,
  conditionHasActivationFact,
  conditionHasNonActivationDecision,
  conditionIsActivationLocal,
  conditionRequiresActivationFact,
  evaluateActivationRequirement,
  hasMissingMandatoryActivationFact,
  type ActivationConditionAnalysis,
} from './activationCondition';
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
  type DamageContributionProjection,
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
export {
  resolveAttackerFormExecution,
  type ResolvedAttackerFormExecution,
  type ResolvedAttackerSkillUse,
} from './sourceCollection';
export {
  availablePreparationSkillCommands,
  availableTransformNoblePhantasmCommand,
  createPreNoblePhantasmState,
  currentFormPassives,
  reducePreNoblePhantasmAction,
  type AppliedPreparationAction,
  type AppliedPreparationEffect,
  type PreNoblePhantasmState,
  type PreparationFailureCode,
  type PreparationTransitionResult,
  type SkillSlotRef,
} from './preNoblePhantasm';
