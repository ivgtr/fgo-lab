import { noblePhantasmVariantKey } from '@fgo-lab/master-data';
import type {
  BattleOperation,
  ExecutableBattleState,
  ExecutionIssue,
  OperationResult,
} from './contracts';
import type { ConditionReadAudit } from './condition';
import type { ReadyCandidateExecution } from './candidatePreparation';
import type {
  OrderedCandidateStateAudit,
  OrderedExecutionGroupAuditEvent,
  OrderedInputQuantityReadAuditEvent,
  OrderedBattlePointPhaseReadAuditEvent,
  OrderedMutationAuditEvent,
  OrderedScenarioExecution,
} from './executionTypes';

export interface MutableCandidateStateAudit {
  preGroupContextResolution: OrderedCandidateStateAudit['preGroupContextResolution'];
  executionGroups: OrderedExecutionGroupAuditEvent[];
  inputQuantityReads: OrderedInputQuantityReadAuditEvent[];
  battlePointPhaseReads: OrderedBattlePointPhaseReadAuditEvent[];
}

export function appendConditionReadAudit(
  audit: MutableCandidateStateAudit,
  read: ConditionReadAudit,
  operationSequence: number,
  operationGroupIndex: number,
  operationId: string,
): void {
  if (read.kind === 'inputQuantity')
    audit.inputQuantityReads.push({
      operationSequence,
      operationGroupIndex,
      operationId,
      inputKey: read.inputKey,
      value: read.value ?? null,
    });
  else
    audit.battlePointPhaseReads.push({
      operationSequence,
      operationGroupIndex,
      operationId,
      subjectId: read.subjectId,
      actor: read.actor,
      point: read.point,
      phase: read.phase,
      comparison: read.comparison,
      expectedValue: read.expectedValue,
      evaluated: read.evaluated,
    });
}

export type PendingMutationAuditEvent = Omit<OrderedMutationAuditEvent, 'afterTransaction'>;

export interface CandidateExecutionWithAudit {
  execution: OrderedScenarioExecution;
  candidateState: OrderedCandidateStateAudit;
}

export function createMutableCandidateStateAudit(): MutableCandidateStateAudit {
  return {
    preGroupContextResolution: null,
    executionGroups: [],
    inputQuantityReads: [],
    battlePointPhaseReads: [],
  };
}

export function mutationAuditAddress(
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

export function auditValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalAuditValue(left)) === JSON.stringify(canonicalAuditValue(right));
}

export function battleStateRestoredToGroupStart(
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
export function collectAppliedOperationIds(
  results: readonly OperationResult[],
  startIndex: number,
): string[] {
  return results
    .slice(startIndex)
    .filter(({ outcome }) => outcome === 'applied')
    .map(({ operation }) => operation.operationId);
}

export function appendExecutionGroupAudit({
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

export function recordPreGroupContextResolution(
  audit: MutableCandidateStateAudit | undefined,
  candidate: ReadyCandidateExecution,
): void {
  if (!audit) return;
  audit.preGroupContextResolution = {
    appliedOperationIds: [...candidate.preappliedOperationIds],
    before: contextSnapshot(candidate.selectionBaseState),
    resolved: contextSnapshot(candidate.state),
  };
}
