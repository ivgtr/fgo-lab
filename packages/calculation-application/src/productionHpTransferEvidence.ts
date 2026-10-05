import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import type { MasterEffect } from '@fgo-lab/master-data';
import type { SourceEffect } from '@fgo-lab/battle-execution';
import {
  preparationHpActionsFor,
  hpCandidateObservationFor,
  type PreparationHpAction,
} from '@fgo-lab/battle-execution/preparation-audit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import { hpPreparationCanonicalFor } from './productionHpPreparationAudit';
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';
import type { HpCoverageSource } from './productionHpCoverage';

type Operation = MasterEffect['execution'][number];
type Transfer = Extract<Operation, { resource: 'hp' }>;
type Entry = NonNullable<PreparationHpAction['transferOperations']>[number];
export function isSelfHpTransfer(operation: Operation): operation is Transfer {
  return (
    operation.kind === 'resourceMutation' &&
    operation.resource === 'hp' &&
    operation.amount.kind === 'hpTransfer' &&
    operation.direction === 'gain' &&
    operation.unit === 'fixed' &&
    operation.recipient === 'sourceSelf' &&
    (operation.selection === undefined || operation.selection === 'direct')
  );
}
export interface HpTransferRequest {
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
}
export interface HpTransferObservation {
  requestIndex: number;
  actionIndex: number;
  action: PreparationHpAction;
  entry: Entry;
  source: SourceEffect;
  operation: Operation;
  operationIndex: number;
  step: number;
  before: Entry['before'];
  result: Entry['result'];
  receipts: Entry['receipts'];
  donorReceipts: Entry['donorReceipts'];
}

/** Borrow from the original selected preparation. No owner reexecution or expected HP arithmetic. */
export function hpTransferObservations(requests: readonly HpTransferRequest[]) {
  return requests.flatMap(({ prepared }, requestIndex) =>
    (battlePointPreparationRejectionObservationFor(prepared)?.transitions ?? []).flatMap(
      (transition, actionIndex) =>
        (preparationHpActionsFor(transition.result) ?? []).flatMap((action) =>
          (action.transferOperations ?? []).map((entry): HpTransferObservation => ({
            requestIndex,
            actionIndex,
            action,
            entry,
            source: entry.source,
            operation: entry.source.effect.execution[entry.operationIndex]!,
            operationIndex: entry.operationIndex,
            step: entry.step,
            before: entry.before,
            result: entry.result,
            receipts: entry.receipts,
            donorReceipts: entry.donorReceipts,
          })),
        ),
    ),
  );
}
export type HpTransferEvidenceReason =
  | 'duplicateDeclaration'
  | 'missingObservation'
  | 'duplicateObservation'
  | 'unmatchedObservation'
  | 'orderMismatch'
  | 'canonicalIdentityMismatch'
  | 'foreignReference'
  | 'nativeTraceMismatch'
  | 'retainedHpMismatch'
  | 'receiptAppendMismatch'
  | 'donorOrderMismatch';

interface TransferFailure {
  reason: HpTransferEvidenceReason;
  path: string;
  identity: string;
  expected: string;
  actual: string;
}
export interface HpTransferEvidence {
  declarations: {
    identity: string;
    operation: Operation;
    selectedExpectations: number;
    observedOperations: number;
    qualification: string;
  }[];
  expected: string[];
  rows: {
    identity: string;
    requestIndex: number;
    actionIndex: number;
    operationIndex: number;
    step: number;
    before: Entry['before'];
    result: Entry['result'];
    receipts: Entry['receipts'];
    donorReceipts: Entry['donorReceipts'];
    native: PreparationHpAction['native'];
    returnedHp: PreparationHpAction['start']['hp'];
    qualification: string;
  }[];
  consumers: {
    requestIndex: number;
    result: CalculationExecution['result'];
    hpObservation: ReturnType<typeof hpCandidateObservationFor>;
    retainedHp: PreparationHpAction['start']['hp'];
    qualification: string;
  }[];
  unobserved: string[];
  gate: { passed: boolean; failures: TransferFailure[]; firstDifference: TransferFailure | null };
}

const identity = (owner: string, skill: string, effect: MasterEffect, operationIndex: number) =>
  JSON.stringify({
    origin: 'attacker',
    owner,
    skill,
    variant: null,
    occurrence: effect.occurrenceId,
    operationIndex,
  });
const sameReferences = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Coverage and original-owner correspondence only; this is not a transfer damage/recovery oracle. */
export function reconcileHpTransferEvidence(
  sources: readonly HpCoverageSource[],
  requests: readonly HpTransferRequest[],
  observations: readonly HpTransferObservation[],
): HpTransferEvidence {
  const failures: TransferFailure[] = [];
  const check = (
    ok: boolean,
    reason: HpTransferEvidenceReason,
    path: string,
    key: string,
    expected = 'originalOwnerCorrespondence',
    actual = 'mismatch',
  ) => {
    if (!ok) failures.push({ reason, path, identity: key, expected, actual });
  };
  const declarations = sources.flatMap((source) =>
    source.effect.execution.flatMap((operation, operationIndex) =>
      source.origin === 'attacker' && isSelfHpTransfer(operation)
        ? [
            {
              source,
              operation,
              operationIndex,
              identity: identity(source.owner, source.skill, source.effect, operationIndex),
            },
          ]
        : [],
    ),
  );
  const declared = new Set<string>();
  for (const declaration of declarations) {
    check(
      !declared.has(declaration.identity),
      'duplicateDeclaration',
      'declarations',
      declaration.identity,
    );
    declared.add(declaration.identity);
  }
  // Command/master-derived expectation is independent of reached operations and successful receipts.
  const expected = requests.flatMap(({ prepared }, requestIndex) =>
    (
      hpPreparationCanonicalFor(
        prepared,
        isSelfHpTransfer,
        () => false,
        () => true,
      )?.writers ?? []
    ).map((writer) => ({
      requestIndex,
      writer,
      key: `${requestIndex}:${writer.actionId}:${identity(writer.sourceId, writer.skillId, writer.effect, writer.operationIndex)}`,
    })),
  );
  const seen = new Set<string>();
  const rows = observations.map((observation, index) => {
    const {
      requestIndex,
      actionIndex,
      action,
      entry,
      source,
      operation,
      operationIndex,
      step,
      before,
      result,
      receipts,
      donorReceipts,
    } = observation;
    const key = `${requestIndex}:${action.actionId}:${identity(source.sourceId, source.skillId, source.effect, operationIndex)}`;
    const match = expected.find((item) => item.key === key);
    const path = `observations.${index}`;
    check(!!match, 'unmatchedObservation', path, key);
    check(!seen.has(key), 'duplicateObservation', path, key);
    seen.add(key);
    check(
      expected[index]?.key === key,
      'orderMismatch',
      path,
      key,
      expected[index]?.key ?? 'none',
      key,
    );
    const declaration = declarations.find(
      (item) =>
        item.identity === identity(source.sourceId, source.skillId, source.effect, operationIndex),
    );
    check(
      !!declaration &&
        declaration.source.effect === source.effect &&
        declaration.operation === operation &&
        isSelfHpTransfer(operation) &&
        source.origin === 'attacker' &&
        source.sourceInstanceId === `attacker:${source.sourceId}` &&
        match?.writer.actionIndex === actionIndex &&
        match.writer.effect === source.effect &&
        match.writer.operation === operation &&
        source.valueSetIndex === match.writer.valueSetIndex &&
        source.valueIndex === match.writer.valueIndex,
      'canonicalIdentityMismatch',
      path,
      key,
    );
    const request = requests[requestIndex];
    const transition =
      request &&
      battlePointPreparationRejectionObservationFor(request.prepared)?.transitions[actionIndex];
    const originalActions = transition && preparationHpActionsFor(transition.result);
    check(
      !!originalActions?.includes(action) &&
        !!action.transferOperations?.includes(entry) &&
        action.sources.includes(source) &&
        entry.source === source &&
        entry.operationIndex === operationIndex &&
        entry.step === step &&
        entry.before === before &&
        entry.result === result &&
        entry.receipts === receipts &&
        entry.donorReceipts === donorReceipts,
      'foreignReference',
      path,
      key,
    );
    const attempt = transition?.attempts?.find((item) => item.actionId === action.actionId);
    const origin = attempt?.stepOrigins.find((item) => item.index === step);
    const reached = attempt?.reached.find((item) => item.index === step);
    check(
      !!transition &&
        action.start.hp === transition.before.hp &&
        action.start.appliedActions === transition.before.appliedActions &&
        action.returned?.hp === transition.result.state.hp &&
        action.native === attempt?.native &&
        !!action.native &&
        origin?.source === source &&
        origin.operationIndex === operationIndex &&
        !!reached &&
        (result.status !== 'applied' || reached.step.kind === 'skip'),
      'nativeTraceMismatch',
      path,
      key,
    );
    if (result.status === 'applied') {
      const after = result.state;
      check(
        sameReferences(after.receipts.slice(0, before.receipts.length), before.receipts) &&
          sameReferences(after.receipts.slice(before.receipts.length), receipts) &&
          sameReferences(
            (after.donorReceipts ?? []).slice(0, before.donorReceipts?.length ?? 0),
            before.donorReceipts ?? [],
          ) &&
          sameReferences(
            (after.donorReceipts ?? []).slice(before.donorReceipts?.length ?? 0),
            donorReceipts,
          ) &&
          receipts.length === 1 &&
          receipts.every(
            (receipt) =>
              receipt.actor === 'attacker' &&
              receipt.actionId === action.actionId &&
              receipt.occurrenceId === source.effect.occurrenceId,
          ),
        'receiptAppendMismatch',
        path,
        key,
      );
      if (operation.kind === 'resourceMutation' && operation.amount.kind === 'hpTransfer') {
        const actors =
          operation.amount.donors === 'selectedEnemy'
            ? ['enemy:0']
            : operation.amount.donors === 'otherEnemy'
              ? ['enemy:1']
              : ['enemy:0', 'enemy:1', 'enemy:2'];
        check(
          donorReceipts.length === actors.length &&
            donorReceipts.every((receipt, i) => {
              const actor = after.actors[receipt.actor];
              const prior = before.actors[receipt.actor];
              return (
                receipt.actor === actors[i] &&
                !!actor &&
                'current' in actor &&
                actor.current === receipt.remaining &&
                (!prior || ('current' in prior && prior.current === receipt.snapshot))
              );
            }),
          'donorOrderMismatch',
          path,
          key,
        );
      }
      if (action.native?.status === 'committed' && transition) {
        const appended = transition.result.state.appliedActions.slice(
          transition.before.appliedActions.length,
        );
        check(
          sameReferences(
            transition.result.state.appliedActions.slice(
              0,
              transition.before.appliedActions.length,
            ),
            transition.before.appliedActions,
          ) &&
            appended.length === 1 &&
            appended[0]?.hpBefore === transition.before.hp &&
            appended[0]?.hpAfter === transition.result.state.hp &&
            !!appended[0]?.selectedEffects.some((effect) => effect.effect === source.effect),
          'nativeTraceMismatch',
          `${path}.committedAppend`,
          key,
        );
      }
    } else
      check(
        receipts.length === 0 && donorReceipts.length === 0,
        'receiptAppendMismatch',
        path,
        key,
      );
    return {
      identity: key,
      requestIndex,
      actionIndex,
      operationIndex,
      step,
      before,
      result,
      receipts,
      donorReceipts,
      native: action.native,
      returnedHp: action.returned?.hp,
      qualification:
        'Borrowed native operation/transaction and append evidence; no inferred modifier read, NP causality or recovery closure.',
    };
  });
  for (const item of expected)
    check(seen.has(item.key), 'missingObservation', 'expected', item.key);
  const consumers = requests.map(({ prepared, calculation }, requestIndex) => {
    const target =
      'executionObservation' in calculation
        ? calculation.executionObservation.targetExecution
        : undefined;
    const hp =
      target?.selection === 'selected'
        ? hpCandidateObservationFor(target.candidateState)
        : undefined;
    const final =
      battlePointPreparationRejectionObservationFor(prepared)?.transitions.at(-1)?.result.state.hp;
    const retainedHp = preparationExecutionStateFor(prepared.orderedScenario)?.hp;
    if (
      expected.some((item) => item.requestIndex === requestIndex) &&
      (target?.selection === 'selected' || calculation.result.status === 'calculated')
    )
      check(
        !!hp && !!retainedHp && final === retainedHp && hp.seed.hp === retainedHp,
        'retainedHpMismatch',
        `consumers.${requestIndex}.seed`,
        String(requestIndex),
      );
    return {
      requestIndex,
      result: calculation.result,
      hpObservation: hp,
      retainedHp,
      qualification:
        'Original selected consumer observation only; empty/missing observations remain unobserved and are not zero, unsupported or product exclusion.',
    };
  });
  return {
    declarations: declarations.map(({ identity, operation, source, operationIndex }) => ({
      identity,
      operation,
      selectedExpectations: expected.filter(
        ({ writer }) => writer.effect === source.effect && writer.operationIndex === operationIndex,
      ).length,
      observedOperations: observations.filter(
        (item) => item.source.effect === source.effect && item.operationIndex === operationIndex,
      ).length,
      qualification:
        'Declaration and command-selection counts only; zero selected expectations is unselected in these requests, not normal exclusion or native success.',
    })),
    expected: expected.map(({ key }) => key),
    rows,
    consumers,
    unobserved: [
      'availableActionInventory',
      'transferModifierRead',
      'transferToNpCausality',
      'nativeNoncommitCoverage',
      'successfulRecoveryCoverage',
    ],
    gate: { passed: failures.length === 0, failures, firstDifference: failures[0] ?? null },
  };
}
