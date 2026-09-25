import type { DamageResolutionInput } from '@fgo-lab/schema';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import { noblePhantasmVariantKey } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  ExecutableBattleState,
  OperationResult,
} from './contracts';
import { evaluateCondition } from './condition';
import { markerOperationDisposition, applyOrderedMarkerMutation } from './markerExecution';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import { createOperationProjection, resolveOperationProjectionEvaluation } from './projection';
import {
  applyActorFormTransition,
  applyInitialTraitSuppression,
  applyTraitAddition,
  applyTraitRemoval,
  cloneBattleState,
} from './state';
import type { TargetCandidate } from './targetContext';
import type {
  OrderedCandidateStateAudit,
  OrderedExecutionGroupAuditEvent,
  OrderedInputQuantityReadAuditEvent,
  OrderedMutationAuditEvent,
  OrderedScenarioExecution,
  PreparedOrderedScenario,
  ResolvedCanonicalInputSet,
  ContributionApplicationPolicy,
} from './executionTypes';
import { prepareCandidateExecution } from './candidatePreparation';
import type { OperationActivation } from './candidateSelection';
import { assembleCandidateResult } from './candidateResult';
import { assembleInvalidActivationResult } from './candidateFailure';
import { markOperationGroupUnsupported } from './candidateRollback';
import {
  applyOrderedCriticalStarsMutation,
  applyOrderedQuantityMutation,
  operationHasNoRuntimeDamageImpact,
} from './resourceSemantics';
import {
  applyRuntimeNoblePhantasmVariantSelection,
  needsMutationValidation,
} from './variantSelection';
import { validateActorFormWorldFacts } from './formConstraintValidation';
import { applyNoblePhantasmDamage } from './npDamageExecution';
import {
  includedByPolicy,
  modifierValue,
  operationEnabled,
  userConditionMet,
} from './candidateOperationContext';

function effectTransactionKey(operation: BattleOperation): string {
  const { source } = operation;
  return [
    source.origin,
    source.sourceInstanceId,
    source.transactionGroupId ?? `${source.skillId}:${source.effectOccurrenceId}`,
  ].join(':');
}

function applyOrderedActorFormTransition(
  state: ExecutableBattleState,
  operation: Extract<BattleOperation, { kind: 'transformActorForm' }>,
): ExecutionIssue | null {
  const issue = validateActorFormWorldFacts(state, operation);
  if (issue) return issue;
  const changed = applyActorFormTransition(state, operation);
  state.actorFormId = changed.actorFormId;
  state.traits = changed.traits;
  state.traitCounts = changed.traitCounts;
  return null;
}
function effectOperationGroups(operations: readonly BattleOperation[]): BattleOperation[][] {
  const groups: BattleOperation[][] = [];
  for (const operation of operations) {
    const current = groups.at(-1);
    if (!current || effectTransactionKey(current[0]!) !== effectTransactionKey(operation))
      groups.push([operation]);
    else current.push(operation);
  }
  return groups;
}
function evaluateConditionAgainstKnownFacts(
  operation: BattleOperation,
  state: ExecutableBattleState,
  onInputQuantityRead?: (inputKey: string, value: number | undefined) => void,
): boolean | null {
  const evaluated = evaluateCondition(operation.condition, state, onInputQuantityRead);
  if (evaluated !== null) return evaluated;
  const satisfiable = validateConstraintSet({
    fixedFacts: fixedConstraintFactsFromState(state, operation.operationId),
    expressions: [{ sourceKey: operation.operationId, expression: operation.condition }],
  });
  return satisfiable.status === 'conflict' ? false : null;
}

interface MutableCandidateStateAudit {
  preGroupContextResolution: OrderedCandidateStateAudit['preGroupContextResolution'];
  executionGroups: OrderedExecutionGroupAuditEvent[];
  inputQuantityReads: OrderedInputQuantityReadAuditEvent[];
}

type PendingMutationAuditEvent = Omit<OrderedMutationAuditEvent, 'afterTransaction'>;

interface CandidateExecutionWithAudit {
  execution: OrderedScenarioExecution;
  candidateState: OrderedCandidateStateAudit;
}

function createMutableCandidateStateAudit(): MutableCandidateStateAudit {
  return { preGroupContextResolution: null, executionGroups: [], inputQuantityReads: [] };
}

function mutationAuditAddress(
  operation: BattleOperation,
  state: ExecutableBattleState,
): { stateAddress: string; value: number | null } | null {
  if (operation.kind === 'resourceMutation' && operation.resource === 'criticalStars')
    return {
      stateAddress: 'battle:criticalStars',
      value: state.resolvedInputValues['battle:criticalStars'] ?? null,
    };
  if (operation.kind === 'addQuantity')
    return {
      stateAddress: `quantity:${operation.quantity}`,
      value: state.quantities[operation.quantity],
    };
  return null;
}

function contextSnapshot(state: ExecutableBattleState) {
  return {
    actorFormId: state.actorFormId,
    noblePhantasmVariantKey: noblePhantasmVariantKey(state.noblePhantasmVariant.ref),
    card: state.card,
  };
}

function canonicalAuditValue(value: unknown): unknown {
  if (value instanceof Map)
    return {
      kind: 'Map',
      entries: [...value.entries()]
        .map(([key, item]) => [canonicalAuditValue(key), canonicalAuditValue(item)])
        .sort((left, right) => JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0]))),
    };
  if (value instanceof Set)
    return {
      kind: 'Set',
      values: [...value]
        .map(canonicalAuditValue)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    };
  if (Array.isArray(value)) return value.map(canonicalAuditValue);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalAuditValue(item)]),
    );
  return value;
}

function auditValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalAuditValue(left)) === JSON.stringify(canonicalAuditValue(right));
}

function battleStateRestoredToGroupStart(
  initialState: ExecutableBattleState,
  restoredState: ExecutableBattleState,
): boolean {
  const initialSemanticState = Object.fromEntries(
    Object.entries(initialState).filter(([key]) => key !== 'unresolved'),
  );
  const restoredSemanticState = Object.fromEntries(
    Object.entries(restoredState).filter(([key]) => key !== 'unresolved'),
  );
  return auditValuesEqual(initialSemanticState, restoredSemanticState);
}
function conditionResult(value: boolean | null): OperationResult['condition'] {
  if (value === null) return 'unresolved';
  return value ? 'satisfied' : 'unsatisfied';
}

function quantityOperationIsNotRelevant(
  operation: BattleOperation,
  candidateInput: DamageResolutionInput,
  damage: PreparedOrderedScenario['damage'],
  baseInput: DamageResolutionInput,
): boolean {
  if (operation.kind !== 'addQuantity') return false;
  const targetId =
    damage?.kind === 'battlePointPhase'
      ? damage.parametersByOvercharge[baseInput.overcharge - 1]?.[baseInput.npLevel - 1]?.targetId
      : null;
  return (
    operation.applicationTiming === 'representedByCurrentInput' ||
    operation.subjectId !== candidateInput.attackerId ||
    damage?.kind !== 'battlePointPhase' ||
    String(targetId) !== operation.subjectId
  );
}

function operationTransactionKey(operation: BattleOperation): string {
  return (
    operation.source.transactionGroupId ??
    `${operation.source.skillId}:${operation.source.effectOccurrenceId}`
  );
}

interface OperationDispositionInput {
  operation: BattleOperation;
  invalidDecisionKeys: ReadonlySet<string>;
  activation: OperationActivation;
  enabled: boolean;
  markerDisposition: ReturnType<typeof markerOperationDisposition>;
  candidateInput: DamageResolutionInput;
  damage: PreparedOrderedScenario['damage'];
  baseInput: DamageResolutionInput;
  supersededVariantTransactionKeys: ReadonlySet<string>;
  resolvedModifierValue: number | null;
  decisionConditionSatisfied: boolean;
  choice: EffectDecision | undefined;
  condition: boolean | null;
  localConditionSatisfied: boolean;
}

interface OperationDisposition {
  outcome: OperationResult['outcome'];
  code: EffectProjection['explanation']['code'];
  issue: ExecutionIssue | null;
}

function resolveOperationDisposition({
  operation,
  invalidDecisionKeys,
  activation,
  enabled,
  markerDisposition,
  candidateInput,
  damage,
  baseInput,
  supersededVariantTransactionKeys,
  resolvedModifierValue,
  decisionConditionSatisfied,
  choice,
  condition,
  localConditionSatisfied,
}: OperationDispositionInput): OperationDisposition {
  let outcome: OperationResult['outcome'] = 'applied';
  let code: EffectProjection['explanation']['code'] = 'applied';
  let issue: ExecutionIssue | null = null;
  if (
    (operation.decisionKey && invalidDecisionKeys.has(operation.decisionKey)) ||
    activation.activeDecisionKeys.some((key) => invalidDecisionKeys.has(key))
  ) {
    outcome = 'notApplied';
    code = 'conditionNotMet';
  } else if (!enabled) {
    outcome = 'notApplied';
    code = 'disabled';
  } else if (markerDisposition) {
    [outcome, code] = markerDisposition;
  } else if (quantityOperationIsNotRelevant(operation, candidateInput, damage, baseInput)) {
    outcome = 'notRelevant';
    code = 'disabled';
  } else if (supersededVariantTransactionKeys.has(operationTransactionKey(operation))) {
    outcome = 'notRelevant';
    code = 'disabled';
  } else if (operation.kind === 'addModifier' && resolvedModifierValue === null) {
    outcome = 'unsupported';
    code = 'unresolved';
    issue = {
      kind: 'unsupportedOperation',
      operationId: operation.operationId,
      detail: 'modifier_value_quantity_missing',
    };
  } else if (
    decisionConditionSatisfied &&
    (operation.kind === 'addTrait' ||
      operation.kind === 'removeTrait' ||
      operation.kind === 'suppressInitialTrait')
  ) {
    outcome = 'unsupported';
    code = 'unresolved';
    issue = {
      kind: 'unsafeLocalConditionDecision',
      operationId: operation.operationId,
      detail: 'condition_satisfaction_would_create_world_fact',
    };
  } else if (condition === null && localConditionSatisfied) {
    outcome = 'applied';
  } else if (
    condition === null &&
    operation.decisionKey &&
    choice?.conditionSatisfaction !== 'assumeSatisfied'
  ) {
    outcome = 'notApplied';
    code = 'unresolved';
  } else if (
    condition === null &&
    (operation.kind === 'addTrait' ||
      operation.kind === 'removeTrait' ||
      operation.kind === 'suppressInitialTrait' ||
      operation.kind === 'addQuantity')
  ) {
    outcome = 'notApplied';
    code = 'unresolved';
  } else if (condition === null) {
    outcome = 'unsupported';
    code = 'unresolved';
    issue = {
      kind: 'unsupportedCondition',
      operationId: operation.operationId,
      detail: 'quantity_missing',
    };
  } else if (!condition && !localConditionSatisfied) {
    outcome = 'notApplied';
    code = 'conditionNotMet';
  } else if (
    operationHasNoRuntimeDamageImpact(operation) &&
    !(operation.kind === 'preserveSemanticEffect' && operation.buffMutation)
  ) {
    [outcome, code] = ['notRelevant', 'stateMutationOnly'];
  }
  return { outcome, code, issue };
}

function collectAppliedOperationIds(
  results: readonly OperationResult[],
  startIndex: number,
): string[] {
  return results
    .slice(startIndex)
    .filter(({ outcome }) => outcome === 'applied')
    .map(({ operation }) => operation.operationId);
}

function appendExecutionGroupAudit({
  audit,
  groupIndex,
  operationGroup,
  operationIdsApplied,
  outcome,
  issues,
  pendingMutationEvents,
  restoredState,
  rollbackProof,
}: {
  audit: MutableCandidateStateAudit | undefined;
  groupIndex: number;
  operationGroup: readonly BattleOperation[];
  operationIdsApplied: readonly string[];
  outcome: 'committed' | 'rolledBack';
  issues: readonly ExecutionIssue[];
  pendingMutationEvents: readonly PendingMutationAuditEvent[];
  restoredState: ExecutableBattleState | null;
  rollbackProof: { battleStateRestored: boolean; damageInputRestored: boolean } | null;
}): void {
  if (!audit) return;
  const firstOperation = operationGroup[0]!;
  audit.executionGroups.push({
    groupIndex,
    transactionIdentity: {
      origin: firstOperation.source.origin,
      sourceInstanceId: firstOperation.source.sourceInstanceId,
      transactionGroupId: firstOperation.source.transactionGroupId ?? null,
      fallbackEffectIdentity: firstOperation.source.transactionGroupId
        ? null
        : {
            skillId: firstOperation.source.skillId,
            effectOccurrenceId: firstOperation.source.effectOccurrenceId,
          },
    },
    operationIds: operationGroup.map(({ operationId }) => operationId),
    appliedOperationIds: operationIdsApplied,
    outcome,
    issues,
    mutations: pendingMutationEvents.map((mutation) => ({
      ...mutation,
      afterTransaction:
        outcome === 'committed'
          ? mutation.attemptedAfter
          : (mutationAuditAddress(
              operationGroup.find(({ operationId }) => operationId === mutation.operationId)!,
              restoredState!,
            )?.value ?? null),
    })),
    rollbackProof,
  });
}

function createOperationResult({
  operation,
  outcome,
  code,
  condition,
  choice,
  state,
  decisions,
  resolvedModifierValue,
  activeDecisionSource,
  attackerClass,
  issue,
}: {
  operation: BattleOperation;
  outcome: OperationResult['outcome'];
  code: EffectProjection['explanation']['code'];
  condition: boolean | null;
  choice: EffectDecision | undefined;
  state: ExecutableBattleState;
  decisions: ReadonlyMap<string, EffectDecision>;
  resolvedModifierValue: number | null;
  activeDecisionSource: boolean;
  attackerClass: string;
  issue: ExecutionIssue | null;
}): OperationResult {
  const projected = resolveOperationProjectionEvaluation(
    operation,
    outcome,
    code,
    condition,
    choice,
    state,
    decisions,
  );
  return {
    operation,
    outcome,
    condition: conditionResult(condition),
    state: cloneBattleState(state),
    projection: createOperationProjection(
      operation,
      projected.outcome,
      projected.code,
      projected.condition,
      projected.choice,
      resolvedModifierValue,
      activeDecisionSource,
      {
        kind: 'relative',
        relation: defaultTargetClassRelation(attackerClass),
      },
      { kind: 'relative', relation: 'neutral' },
    ),
    issue,
  };
}

function recordPreGroupContextResolution(
  audit: MutableCandidateStateAudit | undefined,
  candidate: Extract<ReturnType<typeof prepareCandidateExecution>, { status: 'ready' }>,
): void {
  if (!audit) return;
  audit.preGroupContextResolution = {
    appliedOperationIds: [...candidate.preappliedOperationIds],
    before: contextSnapshot(candidate.selectionBaseState),
    resolved: contextSnapshot(candidate.state),
  };
}

export function executeOrderedScenarioCandidates(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): readonly OrderedScenarioExecution[] {
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidate(prepared, resolvedInputs, candidate, contributionPolicy),
      )
    : [];
}

export function executeOrderedScenarioCandidatesWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): readonly CandidateExecutionWithAudit[] {
  return prepared.targetResolution.kind === 'candidates'
    ? prepared.targetResolution.candidates.map((candidate) =>
        executeOrderedScenarioCandidateWithAudit(
          prepared,
          resolvedInputs,
          candidate,
          contributionPolicy,
        ),
      )
    : [];
}

export function executeOrderedScenarioCandidateWithAudit(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): CandidateExecutionWithAudit {
  const mutableAudit = createMutableCandidateStateAudit();
  const execution = executeOrderedScenarioCandidateInternal(
    prepared,
    resolvedInputs,
    targetCandidate,
    contributionPolicy,
    mutableAudit,
  );
  return { execution, candidateState: mutableAudit };
}

export function executeOrderedScenarioCandidate(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy = { kind: 'calculator' },
): OrderedScenarioExecution {
  return executeOrderedScenarioCandidateInternal(
    prepared,
    resolvedInputs,
    targetCandidate,
    contributionPolicy,
  );
}

function executeOrderedScenarioCandidateInternal(
  prepared: PreparedOrderedScenario,
  resolvedInputs: ResolvedCanonicalInputSet,
  targetCandidate: TargetCandidate | null,
  contributionPolicy: ContributionApplicationPolicy,
  audit?: MutableCandidateStateAudit,
): OrderedScenarioExecution {
  const { baseInput, damage, operations, attackerClass } = prepared;
  const candidate = prepareCandidateExecution(prepared, resolvedInputs, targetCandidate);
  if (candidate.status === 'invalidActivationContext')
    return assembleInvalidActivationResult({ prepared, resolvedInputs, candidate });
  const {
    candidateInput,
    decisions,
    activeDecisionSourceInstances,
    activeConditionConstraints,
    activeMutationConstraints,
    preappliedOperationIds,
    supersededVariantTransactionKeys,
    invalidDecisionKeys,
  } = candidate;
  let { state } = candidate;
  const results: OperationResult[] = [];
  let input = candidateInput;
  recordPreGroupContextResolution(audit, candidate);
  const operationGroups = effectOperationGroups(operations);
  for (const [groupIndex, operationGroup] of operationGroups.entries()) {
    const initialGroupState = cloneBattleState(state);
    const initialGroupInput = input;
    const initialGroupResultIndex = results.length;
    const groupIssues: ExecutionIssue[] = [];
    const pendingMutationEvents: PendingMutationAuditEvent[] | null = audit ? [] : null;
    for (const operation of operationGroup) {
      const operationSequence = results.length;
      const choice = operation.decisionKey ? decisions.get(operation.decisionKey) : undefined;
      const activation = candidate.activations.get(operation.operationId)!;
      const contributionIncluded = includedByPolicy(operation, contributionPolicy, state);
      const enabled = operationEnabled(
        activation,
        operation,
        contributionPolicy,
        contributionIncluded,
      );
      const condition = evaluateConditionAgainstKnownFacts(
        operation,
        state,
        audit
          ? (inputKey, value) => {
              audit.inputQuantityReads.push({
                operationSequence,
                operationGroupIndex: groupIndex,
                operationId: operation.operationId,
                inputKey,
                value: value ?? null,
              });
            }
          : undefined,
      );
      const resolvedModifierValue = modifierValue(operation, state);
      const decisionConditionSatisfied = userConditionMet(operation, condition, choice, state);
      const localConditionSatisfied =
        decisionConditionSatisfied || activation.assumesLocalCondition;
      const markerDisposition = markerOperationDisposition(operation, state, condition);
      let { outcome, code, issue } = resolveOperationDisposition({
        operation,
        invalidDecisionKeys,
        activation,
        enabled,
        markerDisposition,
        candidateInput,
        damage,
        baseInput,
        supersededVariantTransactionKeys,
        resolvedModifierValue,
        decisionConditionSatisfied,
        choice,
        condition,
        localConditionSatisfied,
      });
      if (outcome === 'applied') {
        const candidateState = cloneBattleState(state);
        if (preappliedOperationIds.has(operation.operationId)) {
          // Preparation already committed this canonical form/variant mutation.
        } else if (operation.kind === 'preserveSemanticEffect' && operation.buffMutation) {
          issue = applyOrderedMarkerMutation(
            operation,
            candidateState,
            condition,
            prepared.inputDefinitions,
          );
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'resourceMutation') {
          const mutationBefore = audit ? mutationAuditAddress(operation, state) : null;
          issue = applyOrderedCriticalStarsMutation(operation, candidateState);
          if (audit && mutationBefore && pendingMutationEvents)
            pendingMutationEvents.push({
              operationSequence,
              operationId: operation.operationId,
              operationKind: operation.kind,
              stateAddress: mutationBefore.stateAddress,
              before: mutationBefore.value,
              attemptedAfter: mutationAuditAddress(operation, candidateState)?.value ?? null,
            });
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'addTrait') {
          const changed = applyTraitAddition(candidateState, operation.scope, operation.trait);
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'removeTrait') {
          const changed = applyTraitRemoval(candidateState, operation.scope, operation.trait);
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'suppressInitialTrait') {
          const changed = applyInitialTraitSuppression(
            candidateState,
            operation.scope,
            operation.trait,
          );
          candidateState.initialTraitSuppressions = changed.initialTraitSuppressions;
          candidateState.traits = changed.traits;
          candidateState.traitCounts = changed.traitCounts;
        } else if (operation.kind === 'addQuantity') {
          const mutationBefore = audit ? mutationAuditAddress(operation, state) : null;
          issue = applyOrderedQuantityMutation(operation, candidateState);
          if (audit && mutationBefore && pendingMutationEvents)
            pendingMutationEvents.push({
              operationSequence,
              operationId: operation.operationId,
              operationKind: operation.kind,
              stateAddress: mutationBefore.stateAddress,
              before: mutationBefore.value,
              attemptedAfter: mutationAuditAddress(operation, candidateState)?.value ?? null,
            });
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'addModifier' && contributionIncluded)
          candidateState.modifiers = [
            ...candidateState.modifiers,
            {
              operationId: operation.operationId,
              source: operation.source,
              modifier: operation.modifier,
              valuePermille: resolvedModifierValue!,
              card: operation.card,
              order: operation.order,
            },
          ];
        else if (operation.kind === 'changeModifierRate' && contributionIncluded)
          candidateState.modifierRates = {
            ...candidateState.modifierRates,
            [operation.modifier]: Math.max(
              candidateState.modifierRates[operation.modifier] ?? 0,
              operation.ratePermille,
            ),
          };
        else if (operation.kind === 'transformActorForm') {
          issue = applyOrderedActorFormTransition(candidateState, operation);
          if (issue) [outcome, code] = ['unsupported', 'unresolved'];
        } else if (operation.kind === 'selectNoblePhantasmVariant') {
          const selection = applyRuntimeNoblePhantasmVariantSelection(
            candidateState,
            operation,
            prepared.noblePhantasmVariants,
          );
          if (selection.issue) {
            outcome = 'unsupported';
            code = 'unresolved';
            issue = selection.issue;
          } else {
            candidateState.card = selection.state.card;
            candidateState.noblePhantasmVariant = selection.state.noblePhantasmVariant;
          }
        } else if (operation.kind === 'ignoreDefense') {
          if (contributionIncluded) candidateState.ignoreDefense = true;
        } else if (operation.kind === 'ignoreDamageCut') {
          if (contributionIncluded) candidateState.ignoreDamageCut = true;
        } else if (operation.kind === 'executeNpDamage') {
          if (contributionIncluded)
            input = applyNoblePhantasmDamage(
              input,
              operation,
              state,
              decisions,
              contributionPolicy,
            );
        }
        const mutationValidation = needsMutationValidation(operation)
          ? validateConstraintSet({
              fixedFacts: fixedConstraintFactsFromState(candidateState, operation.operationId),
              expressions: activeConditionConstraints
                .filter((constraint) => !invalidDecisionKeys.has(constraint.sourceKey))
                .concat(activeMutationConstraints),
            })
          : { status: 'satisfied' as const, alternativeCount: 1 };
        if (issue) {
          // The enclosing effect group rolls back every state and input mutation.
        } else if (mutationValidation.status !== 'satisfied') {
          outcome = 'unsupported';
          code = 'unresolved';
          issue = mutationValidation.issue;
          mutationValidation.issue.sourceKeys.forEach((key) => invalidDecisionKeys.add(key));
          activation.activeDecisionKeys.forEach((key) => invalidDecisionKeys.add(key));
        } else {
          state = candidateState;
          state.evidence = [...state.evidence, operation.evidence];
        }
      }
      if (issue) groupIssues.push(issue);
      results.push(
        createOperationResult({
          operation,
          outcome,
          code,
          condition,
          choice,
          state,
          decisions,
          resolvedModifierValue,
          activeDecisionSource: activeDecisionSourceInstances.has(
            operation.source.sourceInstanceId,
          ),
          attackerClass,
          issue,
        }),
      );
    }
    if (groupIssues.length === 0) {
      if (audit && pendingMutationEvents)
        appendExecutionGroupAudit({
          audit,
          groupIndex,
          operationGroup,
          operationIdsApplied: collectAppliedOperationIds(results, initialGroupResultIndex),
          outcome: 'committed',
          issues: [],
          pendingMutationEvents,
          restoredState: null,
          rollbackProof: null,
        });
      continue;
    }
    const attemptedAppliedOperationIds = audit
      ? collectAppliedOperationIds(results, initialGroupResultIndex)
      : null;
    state = {
      ...initialGroupState,
      unresolved: [...initialGroupState.unresolved, ...groupIssues],
    };
    input = initialGroupInput;
    markOperationGroupUnsupported(results, initialGroupResultIndex, state, groupIssues);
    if (audit && pendingMutationEvents && attemptedAppliedOperationIds)
      appendExecutionGroupAudit({
        audit,
        groupIndex,
        operationGroup,
        operationIdsApplied: attemptedAppliedOperationIds,
        outcome: 'rolledBack',
        issues: [...groupIssues],
        pendingMutationEvents,
        restoredState: initialGroupState,
        rollbackProof: {
          battleStateRestored: battleStateRestoredToGroupStart(initialGroupState, state),
          damageInputRestored: auditValuesEqual(initialGroupInput, input),
        },
      });
  }
  return assembleCandidateResult({
    prepared,
    resolvedInputs,
    candidate,
    state,
    input,
    results,
    contributionPolicy,
  });
}
