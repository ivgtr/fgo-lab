import type { DamageResolutionInput } from '@fgo-lab/schema';
import type {
  BattleOperation,
  EffectDecision,
  EffectProjection,
  ExecutionIssue,
  ExecutableBattleState,
  OperationResult,
} from './contracts';
import type { markerOperationDisposition } from './markerExecution';
import { fixedConstraintFactsFromState, validateConstraintSet } from './constraints';
import { applyActorFormTransition } from './state';
import { validateActorFormWorldFacts } from './formConstraintValidation';
import { operationHasNoRuntimeDamageImpact } from './resourceSemantics';
import type { OperationActivation } from './candidateSelection';
import type { ContributionApplicationPolicy, PreparedOrderedScenario } from './executionTypes';
import {
  activationRequirementsSatisfied,
  readOperationCondition,
  type ConditionReadAudit,
} from './condition';
import { contributionIsIncluded } from './effectiveContributions';
import { resolveModifierValue, type ResolvedModifierValue } from './projection';
import type { ConditionRead } from './conditionRead';

export function operationEnabled(
  activation: OperationActivation,
  operation: BattleOperation,
  policy: ContributionApplicationPolicy,
  contributionIncluded: boolean,
): boolean {
  return (
    activation.stochasticOutcome.status === 'success' &&
    (activation.enabled ||
      (policy.kind === 'ranking' && operation.sourceEnabled && contributionIncluded))
  );
}

export function includedByPolicy(
  operation: BattleOperation,
  policy: ContributionApplicationPolicy,
  read: ConditionRead,
): boolean {
  return contributionIsIncluded(operation, read, policy);
}

export function modifierValue(
  operation: BattleOperation,
  state: ExecutableBattleState,
  observeHpRead?: (read: { permille: number | null; value: number | null }) => void,
): ResolvedModifierValue {
  return operation.kind === 'addModifier'
    ? resolveModifierValue(operation, state, observeHpRead)
    : { value: null, dependency: null };
}

export function userConditionMet(
  operation: BattleOperation,
  condition: boolean | null,
  choice: PreparedOrderedScenario['scenario']['effectDecisions'][number] | undefined,
  state: ExecutableBattleState,
): boolean {
  return (
    condition === null &&
    choice?.conditionSatisfaction === 'assumeSatisfied' &&
    operation.decisionPlan.condition === 'userMayAssume' &&
    activationRequirementsSatisfied(operation.condition, state)
  );
}

function effectTransactionKey(operation: BattleOperation): string {
  const { source } = operation;
  return [
    source.origin,
    source.sourceInstanceId,
    source.transactionGroupId ?? `${source.skillId}:${source.effectOccurrenceId}`,
  ].join(':');
}

export function applyOrderedActorFormTransition(
  state: ExecutableBattleState,
  operation: Extract<BattleOperation, { kind: 'transformActorForm' }>,
): ExecutionIssue | null {
  const issue = validateActorFormWorldFacts(state, operation);
  if (issue) return issue;
  const changed = applyActorFormTransition(state, operation);
  state.actorFormId = changed.actorFormId;
  state.traitFactLayers = changed.traitFactLayers;
  state.conditionFactProofs = changed.conditionFactProofs;
  state.conditionReadClock = { ...state.conditionReadClock, actorFormId: changed.actorFormId };
  return null;
}
export function effectOperationGroups(operations: readonly BattleOperation[]): BattleOperation[][] {
  const groups: BattleOperation[][] = [];
  for (const operation of operations) {
    const current = groups.at(-1);
    if (!current || effectTransactionKey(current[0]!) !== effectTransactionKey(operation))
      groups.push([operation]);
    else current.push(operation);
  }
  return groups;
}
export function evaluateConditionAgainstKnownFacts(
  operation: BattleOperation,
  state: ExecutableBattleState,
  onConditionRead?: (read: ConditionReadAudit) => void,
): ConditionRead {
  const evaluated = readOperationCondition(operation, state, onConditionRead);
  if (evaluated.truth !== null) return evaluated;
  const satisfiable = validateConstraintSet({
    fixedFacts: fixedConstraintFactsFromState(state, operation.operationId),
    expressions: [{ sourceKey: operation.operationId, expression: operation.condition }],
  });
  if (satisfiable.status !== 'conflict') return evaluated;
  return {
    ...evaluated,
    kind: 'known',
    truth: false,
    certainty: 'possible',
    support: [{ kind: 'externalAssumption', clock: evaluated.clock }],
  };
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

export function resolveOperationDisposition({
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
    operation.kind === 'preserveSemanticEffect' &&
    operation.semanticKind === 'unsupported'
  ) {
    outcome = 'unsupported';
    code = 'unresolved';
    issue = {
      kind: 'unsupportedOperation',
      operationId: operation.operationId,
      detail: operation.unsupportedReason,
    };
  } else if (
    operationHasNoRuntimeDamageImpact(operation) &&
    !(operation.kind === 'preserveSemanticEffect' && operation.buffMutation)
  ) {
    [outcome, code] = ['notRelevant', 'stateMutationOnly'];
  }
  return { outcome, code, issue };
}
