import { beginPreparationHpCapture, finishPreparationHpCapture } from './hpExecutionObservation';
export { preparationHpActionsFor, hpCandidateObservationFor } from './hpExecutionObservation';
export type { PreparationHpAction, HpCandidateObservation } from './hpExecutionObservation';
import type { SourceEffect } from './sourceCollection';
import type { BattlePointState } from './battlePointResource';
import type { OcActionResult, OcActionStep } from './ocState';
import type {
  PreparationExecutionContext,
  PreparationTransitionResult,
  PreNoblePhantasmState,
} from './preparationContracts';

/** Internal capture transport; no observation fields are added to product states/results. */
export interface PreparationOcAttempt {
  actionId: string;
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
const transitions = new WeakMap<PreparationTransitionResult, readonly PreparationOcAttempt[]>();
export function beginPreparationAttemptCapture(context: PreparationExecutionContext): void {
  beginPreparationHpCapture(context);
  scopes.set(context, []);
  battlePointScopes.set(context, []);
}
export function preparationAttemptScope(context: PreparationExecutionContext) {
  return scopes.get(context);
}
export function finishPreparationAttemptCapture(
  context: PreparationExecutionContext,
  result: PreparationTransitionResult,
): void {
  finishPreparationHpCapture(context, result);
  const attempts = scopes.get(context);
  if (attempts) transitions.set(result, attempts);
  scopes.delete(context);
  const steps = battlePointScopes.get(context);
  if (steps) battlePointTransitions.set(result, steps);
  battlePointScopes.delete(context);
}
export function preparationOcAttemptsFor(result: PreparationTransitionResult) {
  return transitions.get(result);
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
const battlePointTransitions = new WeakMap<
  PreparationTransitionResult,
  readonly PreparationBattlePointStep[]
>();
export function preparationBattlePointScope(context: PreparationExecutionContext) {
  return battlePointScopes.get(context);
}
export function preparationBattlePointStepsFor(result: PreparationTransitionResult) {
  return battlePointTransitions.get(result);
}
