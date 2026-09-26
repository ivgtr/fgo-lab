import { appendConditionReadAudit, observeScalarNp } from './candidateStateAudit';
import type { MutableCandidateStateAudit } from './candidateStateAudit';
import { evaluateConditionAgainstKnownFacts } from './candidateOperationContext';
import { operationConditionResult } from './operationResult';
import { applyNoblePhantasmDamage } from './npDamageExecution';
import type { EffectDecision, BattleOperation } from './contracts';
import type { ContributionApplicationPolicy } from './executionTypes';
import type { SourceEffect } from './sourceCollection';
import type { HpState } from './hpResource';
import type {
  PreNoblePhantasmState,
  PreparationExecutionContext,
  PreparationTransitionResult,
} from './preparationContracts';
import type { OcActionResult } from './ocState';
import type { ExecutableBattleState, OperationResult } from './contracts';
import type { NpDamageOperationContext, NpDamageOperationResult } from './npDamageOperation';
import type { DamageResolutionInput } from '@fgo-lab/schema';

/** Original-owner references; capture only, never part of a product/serialized state. */
export interface PreparationHpAction {
  actionId: string;
  start: PreNoblePhantasmState;
  sources: readonly SourceEffect[];
  writes: {
    source: SourceEffect;
    operationIndex: number;
    before: HpState;
    after: HpState;
    receipts: HpState['receipts'];
  }[];
  native?: OcActionResult;
  returned?: PreNoblePhantasmState;
}
const scopes = new WeakMap<PreparationExecutionContext, PreparationHpAction[]>();
const transitions = new WeakMap<PreparationTransitionResult, readonly PreparationHpAction[]>();
export function beginPreparationHpCapture(context: PreparationExecutionContext) {
  scopes.set(context, []);
}
export function preparationHpScope(context: PreparationExecutionContext) {
  return scopes.get(context);
}
export function finishPreparationHpCapture(
  context: PreparationExecutionContext,
  result: PreparationTransitionResult,
) {
  const actions = scopes.get(context);
  if (actions) transitions.set(result, actions);
  scopes.delete(context);
}
export function preparationHpActionsFor(result: PreparationTransitionResult) {
  return transitions.get(result);
}
export interface HpNpEvaluation {
  ratio: number | null;
  disposition: 'consumed' | 'excluded' | 'missing' | 'invalid';
  context: NpDamageOperationContext;
  evaluation: NpDamageOperationResult;
  input: DamageResolutionInput;
}
export interface HpCandidateObservation {
  seed: { hp: HpState | undefined; permille: number | null };
  reads: {
    operationId: string;
    operationSequence: number;
    operationGroupIndex: number;
    state: ExecutableBattleState;
    actor: string;
    permille: number | null;
    comparison: string;
    expectedValue: number;
    evaluated: boolean | null;
    conditionOutcome?: OperationResult['condition'];
  }[];
  nps: (HpNpEvaluation & {
    operationId: string;
    operationSequence: number;
    operationGroupIndex: number;
    state: ExecutableBattleState;
  })[];
}
const candidates = new WeakMap<object, HpCandidateObservation>();
export function beginHpCandidateCapture(owner: object, state: ExecutableBattleState) {
  const observation: HpCandidateObservation = {
    seed: { hp: state.hp, permille: state.quantities.attackerHpPermille },
    reads: [],
    nps: [],
  };
  candidates.set(owner, observation);
  return observation;
}
export function hpCandidateObservationFor(owner: object | undefined) {
  return owner ? candidates.get(owner) : undefined;
}

export function observeHpNp(
  observation: HpCandidateObservation,
  state: ExecutableBattleState,
  operationId: string,
  operationSequence: number,
  operationGroupIndex: number,
) {
  return (evaluation: HpNpEvaluation) =>
    observation.nps.push({
      ...evaluation,
      operationId,
      operationSequence,
      operationGroupIndex,
      state,
    });
}

interface HpQuantityRead {
  actor: string;
  permille: number | null;
  comparison: string;
  expectedValue: number;
  evaluated: boolean | null;
}
type HpQuantityObserver = (read: HpQuantityRead) => void;
const conditionScopes = new WeakMap<object, HpQuantityObserver>();
export function beginHpConditionCapture(state: object, observer: HpQuantityObserver) {
  const previous = conditionScopes.get(state);
  conditionScopes.set(state, observer);
  return previous;
}
export function finishHpConditionCapture(state: object, previous: HpQuantityObserver | undefined) {
  if (previous) conditionScopes.set(state, previous);
  else conditionScopes.delete(state);
}
export function observeHpQuantity(
  state: object,
  actor: string,
  permille: number | null,
  comparison: string,
  expectedValue: number,
  evaluated: boolean | null,
): void {
  conditionScopes.get(state)?.({ actor, permille, comparison, expectedValue, evaluated });
}

export function applyObservedNpDamage(
  input: DamageResolutionInput,
  operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>,
  state: ExecutableBattleState,
  decisions: ReadonlyMap<string, EffectDecision>,
  policy: ContributionApplicationPolicy,
  audit: MutableCandidateStateAudit | undefined,
  hp: HpCandidateObservation | undefined,
  sequence: number,
  group: number,
): DamageResolutionInput {
  return applyNoblePhantasmDamage(
    input,
    operation,
    state,
    decisions,
    policy,
    audit && observeScalarNp(audit, operation, sequence, group),
    hp ? observeHpNp(hp, state, operation.operationId, sequence, group) : undefined,
  );
}

export function evaluateObservedCondition(
  operation: BattleOperation,
  state: ExecutableBattleState,
  audit: MutableCandidateStateAudit | undefined,
  sequence: number,
  group: number,
): boolean | null {
  const hp = hpCandidateObservationFor(audit);
  const first = hp?.reads.length;
  const previous = hp
    ? beginHpConditionCapture(state, (read) =>
        hp.reads.push({
          ...read,
          state,
          operationId: operation.operationId,
          operationSequence: sequence,
          operationGroupIndex: group,
        }),
      )
    : undefined;
  try {
    const outcome = evaluateConditionAgainstKnownFacts(
      operation,
      state,
      audit
        ? (read) => appendConditionReadAudit(audit, read, sequence, group, operation.operationId)
        : undefined,
    );
    if (hp && first !== undefined)
      for (let index = first; index < hp.reads.length; index++)
        hp.reads[index]!.conditionOutcome = operationConditionResult(outcome);
    return outcome;
  } finally {
    if (hp) finishHpConditionCapture(state, previous);
  }
}
