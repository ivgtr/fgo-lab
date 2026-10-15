export const ALL_TEST_INCLUDES = ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}'];

// These fixture-based unit files preserve and restore complete execution diagnostics. They remain
// mandatory unit tests, but run in a separate serial group so their large snapshots do not compete
// with ordinary unit workers. Production and opt-in audit responsibilities stay unchanged.
export const UNIT_DIAGNOSTIC_TEST_INCLUDES = [
  'packages/calculation-application/src/hpExecution.test.ts',
  'packages/calculation-application/src/productionBattlePointCapacityPreparationAttemptAudit.test.ts',
  'packages/calculation-application/src/productionBattlePointCapacityPreparationAudit.test.ts',
  'packages/calculation-application/src/productionBattlePointPreparationAttemptAudit.test.ts',
  'packages/calculation-application/src/productionBattlePointPreparationAudit.test.ts',
  'packages/calculation-application/src/productionClosureAudit.test.ts',
  'packages/calculation-application/src/productionHpGivePreparationAttemptAudit.test.ts',
  'packages/calculation-application/src/productionHpGivePreparationAudit.test.ts',
  'packages/calculation-application/src/productionHpMaximumFixedPreparationAudit.test.ts',
  'packages/calculation-application/src/productionHpPreparationAttemptAudit.test.ts',
  'packages/calculation-application/src/productionHpPreparationAudit.test.ts',
  'packages/calculation-application/src/productionHpPublishedDependencyCoverage.test.ts',
  'packages/calculation-application/src/productionScalarQuantityAudit.test.ts',
  'packages/calculation-application/src/productionScalarQuantityRecoveryAudit.test.ts',
  'packages/calculation-application/src/scenario.test.ts',
];

export const UNIT_DIAGNOSTIC_PARALLEL_TEST_INCLUDES = [
  'packages/calculation-application/src/productionHpPreparationAttemptAudit.test.ts',
  'packages/calculation-application/src/productionBattlePointCapacityPreparationAttemptAudit.test.ts',
];
export const UNIT_DIAGNOSTIC_SERIAL_TEST_INCLUDES = UNIT_DIAGNOSTIC_TEST_INCLUDES.filter(
  (file) => !UNIT_DIAGNOSTIC_PARALLEL_TEST_INCLUDES.includes(file),
);

export const UNIT_TEST_PROJECTS = ['unit', 'unit-diagnostics', 'unit-diagnostics-serial'];

// Production owns published-master audits, approved goldens/differentials,
// calculator/ranking parity, and evidence integrity. Keep this list explicit so
// a test cannot silently move between quality-gate responsibilities.
export const PRODUCTION_TEST_INCLUDES = [
  'apps/web/src/adapters/share.test.ts',
  'apps/web/src/features/calculator/Calculator.reachable-choice.test.tsx',
  'packages/calculation-application/src/canonicalActorCount.test.ts',
  'packages/calculation-application/src/canonicalInputs.test.ts',
  'packages/calculation-application/src/evidence.test.ts',
  'packages/calculation-application/src/evidenceInventory.test.ts',
  'packages/calculation-application/src/executionBaselineInventory.test.ts',
  'packages/calculation-application/src/externalDifferential.test.ts',
  'packages/calculation-application/src/hpConditionGolden.test.ts',
  'packages/calculation-application/src/mlbOnlyEffectsGolden.test.ts',
  'packages/calculation-application/src/npFunctionGolden.test.ts',
  'packages/calculation-application/src/procEffectsGolden.test.ts',
  'packages/calculation-application/src/productionAudit.test.ts',
  'packages/calculation-application/src/productionBattlePointControlWitness.test.ts',
  'packages/calculation-application/src/productionBattlePointPaths.test.ts',
  'packages/calculation-application/src/productionCurrentRecord.test.ts',
  'packages/calculation-application/src/productionExecutionParity.test.ts',
  'packages/calculation-application/src/productionHpControlWitness.test.ts',
  'packages/calculation-application/src/productionHpPaths.test.ts',
  'packages/calculation-application/src/productionMarkerPaths.test.ts',
  'packages/calculation-application/src/productionMasterAudit.test.ts',
  'packages/calculation-application/src/productionMasterInventory.test.ts',
  'packages/calculation-application/src/productionPreparationResourceReceipt.test.ts',
  'packages/calculation-application/src/productionStructuralControl.test.ts',
  'packages/calculation-application/src/reachableControlProfile.test.ts',
  'packages/calculation-application/src/rankingCandidateSpace.test.ts',
  'packages/calculation-application/src/rankingConditionInventory.test.ts',
  'packages/calculation-application/src/rankingWorldWitness.test.ts',
  'packages/calculation-application/src/specialInputInventory.test.ts',
  'packages/calculation-application/src/targetContextProduction.test.ts',
  'packages/calculation-application/src/unsupportedConvergenceGolden.test.ts',
  'packages/data-pipeline/src/executionSemanticsProduction.test.ts',
  'packages/data-pipeline/src/masterGolden.test.ts',
  'packages/data-pipeline/src/productionAudit.test.ts',
];

// Exhaustive user-control and all-owner sweeps have an explicit, opt-in suite.
// Keep the ordinary production inventory test small enough for every quality run.
export const AUDIT_TEST_INCLUDES = [
  'packages/calculation-application/src/productionHpSelectedAllyMaximumFixedPreparationAudit.test.ts',
  'packages/calculation-application/src/productionMasterControlAudit.test.ts',
  'packages/calculation-application/src/productionHpMaximumFixedPreparationAttemptAudit.test.ts',
  'packages/calculation-application/src/productionHpReceivePreparationAudit.test.ts',
  'packages/calculation-application/src/productionHpReceivePreparationAttemptAudit.test.ts',
];
