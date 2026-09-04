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
export {
  contributionIsIncluded,
  createEffectiveContributionSet,
  effectiveContributionsForOperation,
} from './effectiveContributions';
export { runtimeInputKey } from './runtimeInputIdentity';
export { effectChangesPreparation } from './preparationTransaction';
export type { ResolvedStochasticOutcome } from './stochasticOutcomes';
export { evaluateCondition as evaluateConditionExpression } from './condition';
export {
  DEFAULT_NP_RESOURCE_SEMANTICS,
  applyNpResourceTransaction,
  createNpResourceState,
  deriveBaseOvercharge,
  npCapacityForLevel,
  type NpResourceMutation,
  type NpResourceState,
  type NpResourceTransaction,
  type NpResourceTransactionResult,
} from './npResource';
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
  type ContributionApplicationPolicy,
  type ContributionPolicyDecision,
  type EffectiveContribution,
  type EffectiveContributionSet,
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
  classifyContributionCondition,
  traitConditionConstraintScope,
  traitConditionEvaluationSource,
  traitConditionReadScopes,
  targetConditionWitnessSpace,
  traitConstraintActorScope,
  traitConstraintLayer,
  traitConstraintPublicScope,
  traitFactConstraintScope,
  type TraitConstraintScope,
  type TraitConditionEvaluationSource,
  type TraitConditionLeaf,
  type TargetConditionWitnessSpace,
  type ContributionConditionClass,
  type IntrinsicAttackConditionFacts,
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
  type SourceEffect,
} from './sourceCollection';
export {
  compileEffectCached,
  compileEffectCondition,
  runtimeInputDefinitionsForSource,
  type CompiledOperations,
} from './operationCompiler';
export { noblePhantasmDamageCondition, noblePhantasmDamageDependency } from './npDamageCompilation';
export { planOperationActivations } from './activation';
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
  type PreparationExecutionContext,
  type PreparationTransitionResult,
  type SkillSlotRef,
} from './preNoblePhantasm';
