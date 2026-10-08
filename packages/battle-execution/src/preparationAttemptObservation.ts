import { beginPreparationHpCapture, takePreparationHpCapture } from './hpExecutionObservation';
export { preparationHpActionsFor, hpCandidateObservationFor } from './hpExecutionObservation';
export { compiledSourcesFor, compiledOperationSourceFor } from './executionSourceObservation';
export type { PreparationHpAction, HpCandidateObservation } from './hpExecutionObservation';
import type { SourceEffect } from './sourceCollection';
import type { PreparationSourceExecution, PreparationSourceDraft } from './preparationExecution';
import type { BattlePointState } from './battlePointResource';
import type {
  OcActionResult,
  OcActionStep,
  OcRateHpRead,
  OcRateInstance,
  OcState,
} from './ocState';
import type { HpState } from './hpResource';
export { hpPermille } from './hpResource';
export { ocRateAppliesToGrant, ocApplicationParticipates, ocBindingParticipates } from './ocState';
import type {
  PreparationExecutionContext,
  PreparationCompletedTransitionResult,
  PreNoblePhantasmState,
} from './preparationContracts';

/** Native observations owned by the completed execution result. */
export interface PreparationOcAttempt {
  actionId: string;
  sourceExecutions: readonly PreparationSourceExecution[];
  rates: PreparationOcRateObservation;
  sources: readonly SourceEffect[];
  start: PreNoblePhantasmState;
  stepOrigins: { index: number; source: SourceEffect; operationIndex: number | null }[];
  reached: { index: number; step: OcActionStep }[];
  writes: {
    source: SourceEffect;
    operationIndex: number;
    step: number;
    status: 'applied' | 'invalid' | 'unsupported' | 'notApplicable';
    before: BattlePointState;
    after: BattlePointState;
    receipts: BattlePointState['receipts'];
  }[];
  native?: OcActionResult;
  attempted?: BattlePointState;
  returned?: PreNoblePhantasmState;
}
const scopes = new WeakMap<PreparationExecutionContext, PreparationOcAttempt[]>();

/** The source writer supplies its actual results; observers never infer commit membership. */
const sourceDrafts = new WeakMap<PreparationOcAttempt, readonly PreparationSourceDraft[]>();

export function capturePreparationSources(
  attempt: PreparationOcAttempt,
  executions: readonly PreparationSourceDraft[],
): void {
  sourceDrafts.set(attempt, executions);
}

/** The action owner publishes the same sealed source objects in receipts and diagnostics. */
export function publishPreparationSources(
  attempt: PreparationOcAttempt,
  sealed: ReadonlyMap<PreparationSourceDraft, PreparationSourceExecution>,
): void {
  const drafts = sourceDrafts.get(attempt);
  if (!drafts) throw new TypeError('missing_preparation_source_drafts');
  attempt.sourceExecutions = drafts.map((draft) => {
    const execution = sealed.get(draft);
    if (!execution) throw new TypeError('foreign_preparation_source_draft');
    return execution;
  });
  sourceDrafts.delete(attempt);
}

export function preparationSourcesFor(attempt: PreparationOcAttempt) {
  return attempt.sourceExecutions;
}

/** Native query selection and physical HP reads are distinct; neither changes product state. */
export interface PreparationOcRateObservation {
  selections: { step: number; state: OcState; hp: HpState | undefined }[];
  queries: { step: number; state: OcState; rate: OcRateInstance; hp: HpState | undefined }[];
  reads: (OcRateHpRead & { step: number })[];
}
export function capturePreparationOcRates(attempt: PreparationOcAttempt) {
  const observation: PreparationOcRateObservation = { selections: [], queries: [], reads: [] };
  attempt.rates = observation;
  return observation;
}
export function preparationOcRatesFor(attempt: PreparationOcAttempt) {
  return attempt.rates;
}
export function beginPreparationAttemptCapture(context: PreparationExecutionContext): void {
  beginPreparationHpCapture(context);
  scopes.set(context, []);
  battlePointScopes.set(context, []);
}
export function preparationAttemptScope(context: PreparationExecutionContext) {
  return scopes.get(context);
}
export function takePreparationAttemptCapture(context: PreparationExecutionContext) {
  const ocAttempts = scopes.get(context) ?? [];
  const battlePointSteps = battlePointScopes.get(context) ?? [];
  const hpActions = takePreparationHpCapture(context);
  scopes.delete(context);
  battlePointScopes.delete(context);
  return { ocAttempts, battlePointSteps, hpActions };
}
export function preparationOcAttemptsFor(result: PreparationCompletedTransitionResult) {
  return result.observations.ocAttempts;
}

/** Separate capture keeps the existing attempt diagnostic and serialized shapes unchanged. */
export type PreparationBattlePointStep =
  | { kind: 'write'; actionId: string; write: PreparationOcAttempt['writes'][number] }
  | { kind: 'commit'; actionId: string; before: BattlePointState; after: BattlePointState }
  | { kind: 'sourceEnd'; actionId: string; source: SourceEffect; state: BattlePointState }
  | {
      kind: 'reconcile';
      owner: 'operation' | 'source' | 'reducer';
      actionId: string | null;
      source: SourceEffect | null;
      before: PreNoblePhantasmState;
      after: PreNoblePhantasmState;
      domains: PreparationExecutionContext['battlePointDomains'];
    };
const battlePointScopes = new WeakMap<PreparationExecutionContext, PreparationBattlePointStep[]>();
export function preparationBattlePointScope(context: PreparationExecutionContext) {
  return battlePointScopes.get(context);
}
export function preparationBattlePointStepsFor(result: PreparationCompletedTransitionResult) {
  return result.observations.battlePointSteps;
}
