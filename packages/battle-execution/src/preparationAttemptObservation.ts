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
  scopes.set(context, []);
}
export function preparationAttemptScope(context: PreparationExecutionContext) {
  return scopes.get(context);
}
export function finishPreparationAttemptCapture(
  context: PreparationExecutionContext,
  result: PreparationTransitionResult,
): void {
  const attempts = scopes.get(context);
  if (attempts) transitions.set(result, attempts);
  scopes.delete(context);
}
export function preparationOcAttemptsFor(result: PreparationTransitionResult) {
  return transitions.get(result);
}
