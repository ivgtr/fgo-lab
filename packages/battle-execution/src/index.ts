export {
  conditionQuantityReads,
  expressionQuantityReads,
  readsResource,
  resourceSourceActor,
  resourceRecipientActor,
  currentResourceQuery,
  mutationResourceAccess,
  resourceQueriesMayIntersect,
  ATTACKER_RESOURCE_ACTOR,
} from './resourceQueries';
export type { ResourceActor, ResourceKind, ResourceQuery, QuantityRead } from './resourceQueries';
export { conditionReadsResource } from './resourceSemantics';
export { effectExecutesInNpProgram, npProgramEffects } from './npProgramScope';
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
  ContributionComponent,
  ContributionId,
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
export { canNormalizeDamageEffect, resolveResourceTargetPolicy } from './effectRouting';
export {
  markerEffectReads,
  terminalMarkerReads,
  markerRelevantSourceIndexes,
} from './markerDependency';
export { isConsistentNpOcUseReceipt } from './ocState';
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
  executeOrderedScenarioWithAuditObservation,
  executeOrderedScenarioCandidates,
  prepareOrderedScenario,
  type OrderedScenarioExecution,
  type OrderedExecutionAuditEvent,
  type OrderedCandidateStateAudit,
  type OrderedExecutionGroupAuditEvent,
  type OrderedInputQuantityReadAuditEvent,
  type OrderedMutationAuditEvent,
  type OrderedExecutionAuditObservation,
  type OrderedScenarioExecutionWithAuditObservation,
  type PreparedOrderedScenario,
  type ResolvedCanonicalInputSet,
  type ContributionApplicationPolicy,
  type ContributionPolicyDecision,
  type EffectiveContribution,
  type EffectiveContributionSet,
} from './engine';
export { preparationExecutionStateFor } from './executionTypes';
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
  compareTraitCount,
  decisiveConditionGroup,
  resolveCombinedTraitValue,
  traitConditionConstraintScope,
  traitConditionEvaluationSource,
  traitConditionScopeSemantics,
  traitConditionReadScopes,
  targetConditionWitnessSpace,
  traitConstraintActorScope,
  traitConstraintLayer,
  traitConstraintPublicScope,
  traitFactConstraintScope,
  type TraitConstraintScope,
  type TraitConditionEvaluationSource,
  type TraitConditionScopeLayer,
  type TraitConditionScopeSemantics,
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

export {
  mergeInputDefinitions,
  stackOwnedWitnessCondition,
  servantStackInputs,
} from './stackQuantities';

export { effectReadsOc, noblePhantasmReadsOc, ocRelevantSourceIndexes } from './ocDependency';
export { hpRelevantSourceIndexes, terminalHpReaders } from './hpDependency';
export { compileOcSourceProgram, hasOcExecution, hasOcConditionReader } from './ocSourceProgram';

export { SOURCE_CHOICE_INPUT_PREFIX, OC_WORLD_TRAIT_INPUT_PREFIX } from './ocConditionInputs';

export type { OcResourceDependencyContext } from './ocResourceDependencies';

export {
  populationInputIssue,
  populationInputEquivalenceKey,
  populationCountSaturation,
} from './populationCounts';

export { populationInputsHaveEquivalentTerminalDamage } from './populationGaugeEquivalence';

export { npTransferInputSaturation } from './npTransfer';

export * from './hpResource';
export * from './preparationHp';
export * from './battlePointResource';

export { UnresolvedPreparationPlanningRead } from './hpPlanning';

export type {
  ConditionRead,
  ConditionReadClock,
  ConditionReadEvidence,
  ConditionFactProof,
  SourceActivationReceipt,
} from './conditionRead';
export {
  StochasticBranchRequired,
  IllegalStochasticWitness,
  executeStochasticPossibilities,
  stochasticWitnessEntries,
} from './stochasticPossibilities';
export type { ExecutionPossibilities } from './stochasticPossibilities';
export type { StochasticSelection, StochasticChoice } from './stochasticPossibilities';
export type { ExecutionPossibilityCertificate } from './stochasticPossibilities';
export type {
  PreparationActionExecution,
  PreparationInitializationExecution,
  PreparationSourceExecution,
  PreparationOperationExecution,
  RejectedPreparationDiagnostic,
} from './preparationExecution';
export { diagnoseRejectedPreparation } from './preparationDiagnostic';
export {
  prepareDiagnosticOrderedScenario,
  executeDiagnosticOrderedScenarioWithAuditObservation,
} from './engine';

export { stochasticWitnessKey } from './stochasticPossibilities';
export type { OcRateInstance, OcActionStep, OcApplicationRead } from './ocState';

export { projectBattleTraitPresence, readTraitPresence, readTraitQuantity } from './traitFactLayers';

export { liveTraitQuantityRead } from './stackQuantities';
