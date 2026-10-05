import type { ConditionRead } from './conditionRead';
import type { ConditionReadAudit } from './condition';
import { appendConditionReadAudit, observeScalarNp } from './candidateStateAudit';
import type { MutableCandidateStateAudit } from './candidateStateAudit';
import { evaluateConditionAgainstKnownFacts, modifierValue } from './candidateOperationContext';
import { operationConditionResult } from './operationResult';
import { applyNoblePhantasmDamage } from './npDamageExecution';
import type { EffectDecision, BattleOperation, ConditionExpression } from './contracts';
import type { ContributionApplicationPolicy } from './executionTypes';
import type { SourceEffect } from './sourceCollection';
import type { HpState, HpModifierInstance } from './hpResource';
import type { HpGainConsumption, HpGiveGainConsumption } from './preparationHp';
import type { executeHpOperation, HpOperation } from './preparationHp';
import type { CanonicalInputDefinition } from '@fgo-lab/master-data';
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
  /** One decision for each reached native HP step, before any operation result is filtered. */
  steps: {
    source: SourceEffect;
    operation: HpOperation;
    operationIndex: number;
    step: number;
    decision: 'skipped' | 'missingHpState' | 'attempted';
  }[];
  /** Every reached HP operation, including rejected results; borrowed from the original owner. */
  operations: {
    source: SourceEffect;
    operation: HpOperation;
    operationIndex: number;
    step: number;
    before: HpState;
    result: ReturnType<typeof executeHpOperation>;
  }[];
  /** Ordered physical gain-multiplier reads, including empty and rejected reads. */
  modifierReads: {
    source: SourceEffect;
    operationIndex: number;
    step: number;
    read: Parameters<
      NonNullable<Parameters<typeof executeHpOperation>[0]['observeModifierRead']>
    >[0];
  }[];
  /** Native condition callbacks entered in order, before their physical read capture. */
  conditionAttempts: {
    kind: 'source' | 'modifierUse';
    source: SourceEffect;
    operation: HpModifierInstance['operation'] | null;
    operationIndex: number | null;
    instance: HpModifierInstance | null;
    step: number;
  }[];
  /** Native evaluations in execution order, including false reads filtered before gain aggregation. */
  conditionReads: {
    kind: 'source' | 'modifierUse';
    source: SourceEffect;
    operation: HpModifierInstance['operation'] | null;
    operationIndex: number | null;
    instance: HpModifierInstance | null;
    step: number;
    condition: ConditionExpression;
    reads: HpQuantityRead[];
    outcome: boolean | null;
  }[];
  writes: {
    source: SourceEffect;
    operationIndex: number;
    before: HpState;
    after: HpState;
    receipts: HpState['receipts'];
  }[];
  /** Original transfer operation result and append boundaries; capture-only borrowed references. */
  transferOperations?: {
    source: SourceEffect;
    operationIndex: number;
    step: number;
    before: HpState;
    result: ReturnType<typeof executeHpOperation>;
    receipts: HpState['receipts'];
    donorReceipts: NonNullable<HpState['donorReceipts']>;
  }[];
  modifierWrites?: {
    source: SourceEffect;
    operationIndex: number;
    operation: HpModifierInstance['operation'];
    valueSetIndex: number;
    valueIndex: number;
    before: HpState;
    after: HpState;
    modifiers: readonly HpModifierInstance[];
    receipts: HpState['receipts'];
  }[];
  /** Selected recipient writes stay separate from the sourceSelf evidence contract. */
  selectedAllyMaximumFixedWrites?: NonNullable<PreparationHpAction['modifierWrites']>;
  /** Kept separate from maximumFixed writes to preserve existing diagnostic scopes. */
  receiveWrites?: NonNullable<PreparationHpAction['modifierWrites']>;
  receiveConsumptions?: {
    source: SourceEffect;
    operationIndex: number;
    valueSetIndex: number;
    valueIndex: number;
    consumption: HpGainConsumption;
  }[];
  /** Give evidence has its own lifetime and never changes receive diagnostic payloads. */
  giveWrites?: NonNullable<PreparationHpAction['modifierWrites']>;
  giveGains?: PreparationHpAction['writes'];
  giveConsumptions?: {
    source: SourceEffect;
    operationIndex: number;
    valueSetIndex: number;
    valueIndex: number;
    consumption: HpGiveGainConsumption;
  }[];
  /** Original empty give read after owner condition filtering; separate from positive consumption. */
  giveExcludedConsumptions?: NonNullable<PreparationHpAction['giveConsumptions']>;
  /** Original enemy noHealing appends, including each selected recipient. */
  noHealingWrites?: NonNullable<PreparationHpAction['modifierWrites']>;
  sourceEnds: {
    source: SourceEffect;
    step: number;
    before: PreNoblePhantasmState;
    after: PreNoblePhantasmState;
    /** Present only when the original owner restored sourceState after a stochastic failure. */
    sourceStart?: PreNoblePhantasmState;
    stochasticFailureSteps?: readonly number[];
  }[];
  /** Original state immediately before native committed execution markers are appended. */
  commitStartHp?: HpState;
  native?: OcActionResult;
  /** Original preparation owner input and occurrence when a native attempt requests input. */
  rejectionInput?: { requiredInput: CanonicalInputDefinition; occurrenceId: string };
  attempted?: PreNoblePhantasmState;
  returned?: PreNoblePhantasmState;
}
/** Observe only original applied writes; all HP semantics remain with executeHpOperation. */
export function captureSelectedAllyMaximumFixedWrite(
  action: PreparationHpAction,
  source: SourceEffect,
  operation: SourceEffect['effect']['execution'][number],
  operationIndex: number,
  before: HpState,
  after: HpState,
  valueSetIndex: number,
): void {
  if (
    source.origin !== 'attacker' ||
    operation.kind !== 'hpModifier' ||
    operation.action !== 'maximumFixed' ||
    operation.lifetime !== 'active' ||
    operation.route.target !== 'partyMember' ||
    operation.selection !== 'selectedAlly' ||
    operation.bounds.minimum !== null ||
    operation.bounds.maximum !== null ||
    (operation.useCondition !== undefined && operation.useCondition.kind !== 'always')
  )
    return;
  (action.selectedAllyMaximumFixedWrites ??= []).push({
    source,
    operationIndex,
    operation,
    valueSetIndex,
    valueIndex: source.valueIndex,
    before,
    after,
    modifiers: (after.modifiers ?? []).slice(before.modifiers?.length ?? 0),
    receipts: after.receipts.slice(before.receipts.length),
  });
}

/** Capture only original active/direct sourceSelf give writes; sign/bounds remain owner values. */
export function captureGiveWrite(
  action: PreparationHpAction,
  source: SourceEffect,
  operation: SourceEffect['effect']['execution'][number],
  operationIndex: number,
  before: HpState,
  after: HpState,
  valueSetIndex: number,
): void {
  if (
    source.origin !== 'attacker' ||
    operation.kind !== 'hpModifier' ||
    operation.action !== 'give' ||
    operation.lifetime !== 'active' ||
    operation.route.target !== 'sourceSelf' ||
    (operation.selection !== undefined && operation.selection !== 'direct')
  )
    return;
  (action.giveWrites ??= []).push({
    source,
    operationIndex,
    operation,
    valueSetIndex,
    valueIndex: source.valueIndex,
    before,
    after,
    modifiers: (after.modifiers ?? []).slice(before.modifiers?.length ?? 0),
    receipts: after.receipts.slice(before.receipts.length),
  });
}

/** Borrow the original operation result; this never executes an HP writer. */
export function captureNoHealingWrite(
  action: PreparationHpAction,
  source: SourceEffect,
  operation: SourceEffect['effect']['execution'][number],
  operationIndex: number,
  before: HpState,
  after: HpState,
  valueSetIndex: number,
): void {
  if (
    source.origin !== 'attacker' ||
    operation.kind !== 'hpModifier' ||
    operation.action !== 'noHealing' ||
    operation.lifetime !== 'active' ||
    operation.route.target !== 'enemy' ||
    operation.selection !== 'allEnemies'
  )
    return;
  (action.noHealingWrites ??= []).push({
    source,
    operationIndex,
    operation,
    valueSetIndex,
    valueIndex: source.valueIndex,
    before,
    after,
    modifiers: (after.modifiers ?? []).slice(before.modifiers?.length ?? 0),
    receipts: after.receipts.slice(before.receipts.length),
  });
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
  valueReads: {
    operation: Extract<BattleOperation, { kind: 'addModifier' }>;
    result: OperationResult;
    operationSequence: number;
    operationGroupIndex: number;
    state: ExecutableBattleState;
    permille: number | null;
    value: number | null;
    contributionIncluded: boolean;
    modifierAppended: boolean;
  }[];
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
    /** The condition leaf actually evaluated, retained only in audit capture. */
    leaf: Extract<ConditionExpression, { kind: 'quantity' }>;
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
    valueReads: [],
    reads: [],
    nps: [],
  };
  candidates.set(owner, observation);
  return observation;
}
export function hpCandidateObservationFor(owner: object | undefined) {
  return owner ? candidates.get(owner) : undefined;
}

export function resolveObservedModifierValue(
  operation: BattleOperation,
  state: ExecutableBattleState,
  observation: HpCandidateObservation | undefined,
) {
  let read: { permille: number | null; value: number | null } | undefined;
  const value = modifierValue(
    operation,
    state,
    observation ? (event) => (read = event) : undefined,
  );
  return { value, read, state, modifierCountBefore: state.modifiers.length };
}

export function captureHpValueRead(
  observation: HpCandidateObservation | undefined,
  operation: BattleOperation,
  result: OperationResult,
  sequence: number,
  group: number,
  after: ExecutableBattleState,
  observed: ReturnType<typeof resolveObservedModifierValue> | undefined,
  contributionIncluded: boolean,
) {
  if (!observation || !observed?.read || operation.kind !== 'addModifier') return;
  const { read, state, modifierCountBefore } = observed;
  observation.valueReads.push({
    operation,
    result,
    operationSequence: sequence,
    operationGroupIndex: group,
    state,
    ...read,
    contributionIncluded,
    modifierAppended:
      result.outcome === 'applied' &&
      contributionIncluded &&
      after.modifiers.length === modifierCountBefore + 1 &&
      after.modifiers.at(-1)?.operationId === operation.operationId &&
      after.modifiers.at(-1)?.valuePermille === read.value,
  });
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

export interface HpQuantityRead {
  actor: string;
  permille: number | null;
  comparison: string;
  expectedValue: number;
  evaluated: boolean | null;
  leaf: Extract<ConditionExpression, { kind: 'quantity' }>;
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
  leaf: Extract<ConditionExpression, { kind: 'quantity' }>,
  actor: string,
  permille: number | null,
  comparison: string,
  expectedValue: number,
  evaluated: boolean | null,
): void {
  conditionScopes.get(state)?.({ leaf, actor, permille, comparison, expectedValue, evaluated });
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
  observeDependency: (read: ConditionRead) => void,
): DamageResolutionInput {
  return applyNoblePhantasmDamage(
    input,
    operation,
    state,
    decisions,
    policy,
    audit && observeScalarNp(audit, operation, sequence, group),
    hp ? observeHpNp(hp, state, operation.operationId, sequence, group) : undefined,
    observeDependency,
  );
}

export type CandidateSourceRead = {
  read: ConditionRead;
  observations: readonly ConditionReadAudit[];
};

export function evaluateObservedCondition(
  operation: BattleOperation,
  state: ExecutableBattleState,
  audit: MutableCandidateStateAudit | undefined,
  sequence: number,
  group: number,
  sourceReads: Map<import('./executionBinding').SourceExecutionBinding, CandidateSourceRead>,
): ConditionRead {
  const binding = operation.runtimeBinding?.source;
  const cached = binding && sourceReads.get(binding);
  if (cached) {
    if (audit)
      for (const read of cached.observations)
        appendConditionReadAudit(audit, read, sequence, group, operation.operationId);
    return cached.read;
  }
  const observations: ConditionReadAudit[] = [];
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
    const outcome = evaluateConditionAgainstKnownFacts(operation, state, (read) => {
      observations.push(read);
      if (audit) appendConditionReadAudit(audit, read, sequence, group, operation.operationId);
    });
    if (binding) sourceReads.set(binding, { read: outcome, observations });
    if (hp && first !== undefined)
      for (let index = first; index < hp.reads.length; index++)
        hp.reads[index]!.conditionOutcome = operationConditionResult(outcome.truth);
    return outcome;
  } finally {
    if (hp) finishHpConditionCapture(state, previous);
  }
}
