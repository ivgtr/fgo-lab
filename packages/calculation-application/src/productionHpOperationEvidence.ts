import { isHpOperation, type HpState } from '@fgo-lab/battle-execution';
import {
  hpCandidateObservationFor,
  preparationHpActionsFor,
} from '@fgo-lab/battle-execution/preparation-audit';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type { HpProofDeclaration } from './productionHpProofCoverage';
import {
  directScenarioOwnerIndex,
  type HpPublishedDependencyRequest,
} from './productionHpPublishedDependencyCoverage';
import { scalarQuantitySnapshot } from './productionScalarQuantityAudit';

/** Reconcile the original selected operation stream without reexecuting an HP owner. */
export function reconcileHpOperationEvidence(
  declarations: readonly HpProofDeclaration[],
  requests: readonly HpPublishedDependencyRequest[],
) {
  type FailureReason =
    | 'requestOwnerMismatch'
    | 'missingCapture'
    | 'foreignDeclaration'
    | 'duplicateOperation'
    | 'unmatchedOperation'
    | 'stepDecisionMismatch'
    | 'operationOrderMismatch'
    | 'modifierReadMismatch'
    | 'modifierReadOrderMismatch'
    | 'candidateReadMismatch'
    | 'ownerSelectionMismatch'
    | 'nativeTransactionMismatch';
  const failures: {
    reason: FailureReason;
    path: string;
    firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
  }[] = [];
  const modifierReads: {
    requestIndex: number;
    actionIndex: number;
    sourceInstanceId: string;
    readerDeclaration: HpProofDeclaration['identity'];
    readerOperationIndex: number;
    step: number;
    action: 'receive' | 'give' | 'noHealing';
    actor: string;
    value: number;
    instanceIds: string[];
    writerOperations: Writer[];
    transaction: 'committed' | 'rejected' | 'unobserved';
    consumed: boolean;
  }[] = [];
  const candidateReads: {
    requestIndex: number;
    kind: 'condition' | 'value' | 'np';
    operationId: string;
    sequence: number;
    group: number;
    actor: string;
    physicalValue: number | null;
    consumed: boolean;
    writerOperations: Writer[];
  }[] = [];
  const fail = (reason: FailureReason, path: string, expected: unknown, actual: unknown) => {
    const firstDifference = firstCanonicalAuditDifference(
      [{ identity: path, value: scalarQuantitySnapshot(expected) }],
      [{ identity: path, value: scalarQuantitySnapshot(actual) }],
    );
    if (firstDifference) failures.push({ reason, path, firstDifference });
  };
  const writers = declarations.filter((item) => item.identity.kind === 'writer');
  type Writer = {
    actionIndex: number;
    step: number;
    operationIndex: number;
    sourceInstanceId: string;
    declaration: HpProofDeclaration['identity'];
  };
  const rows: {
    requestIndex: number;
    actionIndex: number;
    actionId: string;
    declaration: HpProofDeclaration['identity'];
    sourceInstanceId: string;
    operationIndex: number;
    recipientPolicy: string;
    actorsTouched: string[];
    step: number | null;
    reached: boolean;
    decision: 'skipped' | 'missingHpState' | 'attempted' | null;
    attempted: boolean;
    operationStatus: 'applied' | 'inputRequired' | 'unsupported' | 'invalid' | null;
    nativeStatus: string | null;
    transaction: 'committed' | 'rejected' | 'unobserved';
  }[] = [];
  let available = 0;
  let selected = 0;
  for (const [requestIndex, request] of requests.entries()) {
    const instanceWriters = new Map<object, Writer>();
    const receiptWriters = new Map<object, Writer>();
    const { prepared, calculation } = request;
    const observation =
      'executionObservation' in prepared ? prepared.executionObservation : undefined;
    if (!calculation || calculation.executionObservation !== observation) {
      fail('requestOwnerMismatch', `requests.${requestIndex}.calculation`, true, false);
      continue;
    }
    const transport = battlePointPreparationRejectionObservationFor(prepared);
    if (prepared.scenario.mode === 'resolved' && prepared.status !== 'invalid' && !transport)
      fail('missingCapture', `requests.${requestIndex}.preparation`, true, false);
    if (transport && transport !== battlePointPreparationRejectionObservationFor(calculation))
      fail('requestOwnerMismatch', `requests.${requestIndex}.preparationOwner`, true, false);
    for (const [actionIndex, transition] of (transport?.transitions ?? []).entries()) {
      const actions = preparationHpActionsFor(transition.result) ?? [];
      for (const action of actions) {
        const attempt = transition.attempts?.find((item) => item.actionId === action.actionId);
        if (!attempt || attempt.sources !== action.sources) {
          fail('missingCapture', `requests.${requestIndex}.actions.${actionIndex}`, true, false);
          continue;
        }
        const matched = new Set<number>();
        const matchedDecisions = new Set<number>();
        for (const source of action.sources)
          for (const [operationIndex, operation] of source.effect.execution.entries()) {
            if (!isHpOperation(operation)) continue;
            available++;
            const declaration = writers.filter(
              (item) =>
                item.effect === source.effect &&
                item.operation === operation &&
                item.identity.path === `execution.${operationIndex}`,
            );
            if (declaration.length !== 1) {
              fail(
                'foreignDeclaration',
                `requests.${requestIndex}.actions.${actionIndex}.declaration.${operationIndex}`,
                1,
                declaration.length,
              );
              continue;
            }
            const origins = attempt.stepOrigins.filter(
              (item) => item.source === source && item.operationIndex === operationIndex,
            );
            const steps = [...new Set(origins.map((item) => item.index))];
            const reached = steps.some((step) =>
              attempt.reached.some((item) => item.index === step),
            );
            const decisions = action.steps.flatMap((decision, index) =>
              decision.source === source && decision.operationIndex === operationIndex
                ? [{ decision, index }]
                : [],
            );
            const entries = action.operations.flatMap((entry, index) =>
              entry.source === source && entry.operationIndex === operationIndex
                ? [{ entry, index }]
                : [],
            );
            if (steps.length > 0) selected++;
            if (
              decisions.length !== (reached ? 1 : 0) ||
              decisions.some(
                ({ decision }) => decision.operation !== operation || decision.step !== steps[0],
              )
            )
              fail(
                'stepDecisionMismatch',
                `requests.${requestIndex}.actions.${actionIndex}.decision.${operationIndex}`,
                [reached ? 1 : 0, operation, steps[0] ?? null],
                decisions.map(({ decision }) => [decision.operation, decision.step]),
              );
            for (const { index } of decisions) matchedDecisions.add(index);
            if (entries.length > 1)
              fail(
                'duplicateOperation',
                `requests.${requestIndex}.actions.${actionIndex}.operation.${operationIndex}`,
                1,
                entries.length,
              );
            const found = entries[0];
            if (entries.length !== (decisions[0]?.decision.decision === 'attempted' ? 1 : 0))
              fail(
                'stepDecisionMismatch',
                `requests.${requestIndex}.actions.${actionIndex}.attempt.${operationIndex}`,
                decisions[0]?.decision.decision === 'attempted' ? 1 : 0,
                entries.length,
              );
            if (found) {
              matched.add(found.index);
              if (
                found.entry.operation !== operation ||
                found.entry.step !== steps[0] ||
                !attempt.reached.some((item) => item.index === found.entry.step)
              )
                fail(
                  'operationOrderMismatch',
                  `requests.${requestIndex}.actions.${actionIndex}.steps.${operationIndex}`,
                  [operation, steps[0] ?? null, true],
                  [
                    found.entry.operation,
                    found.entry.step,
                    attempt.reached.some((r) => r.index === found.entry.step),
                  ],
                );
            }
            const transaction =
              action.native?.status === 'committed' &&
              transition.result.status === 'applied' &&
              action.returned === action.attempted
                ? 'committed'
                : action.native &&
                    action.native.status !== 'committed' &&
                    action.returned === action.start
                  ? 'rejected'
                  : 'unobserved';
            if (found && transaction === 'unobserved')
              fail(
                'nativeTransactionMismatch',
                `requests.${requestIndex}.actions.${actionIndex}.transaction`,
                'committed-or-rejected',
                [action.native?.status ?? null, transition.result.status],
              );
            const appliedState =
              found?.entry.result.status === 'applied' ? found.entry.result.state : null;
            const before = found?.entry.before;
            rows.push({
              requestIndex,
              actionIndex,
              actionId: action.actionId,
              declaration: declaration[0]!.identity,
              sourceInstanceId: source.sourceInstanceId,
              operationIndex,
              recipientPolicy:
                operation.kind === 'resourceMutation'
                  ? operation.recipient
                  : operation.route.target,
              actorsTouched:
                appliedState && before
                  ? [
                      ...new Set([
                        ...appliedState.receipts
                          .filter((receipt) => !before.receipts.includes(receipt))
                          .map((receipt) => receipt.actor),
                        ...(appliedState.modifiers ?? [])
                          .filter((instance) => !(before.modifiers ?? []).includes(instance))
                          .map((instance) => instance.actor),
                        ...(before.modifiers ?? [])
                          .filter((instance) => !(appliedState.modifiers ?? []).includes(instance))
                          .map((instance) => instance.actor),
                      ]),
                    ]
                  : [],
              step: steps[0] ?? null,
              reached,
              decision: decisions[0]?.decision.decision ?? null,
              attempted: !!found,
              operationStatus: found?.entry.result.status ?? null,
              nativeStatus: action.native?.status ?? null,
              transaction,
            });
          }
        action.operations.forEach((entry, index) => {
          if (!matched.has(index))
            fail(
              'unmatchedOperation',
              `requests.${requestIndex}.actions.${actionIndex}.operations.${index}`,
              true,
              [entry.source.sourceInstanceId, entry.operationIndex, entry.step],
            );
        });
        action.steps.forEach((decision, index) => {
          if (!matchedDecisions.has(index))
            fail(
              'stepDecisionMismatch',
              `requests.${requestIndex}.actions.${actionIndex}.decisions.${index}`,
              true,
              [decision.source.sourceInstanceId, decision.operationIndex, decision.step],
            );
        });
        const committed =
          action.native?.status === 'committed' &&
          transition.result.status === 'applied' &&
          action.returned === action.attempted;
        for (const entry of action.operations) {
          if (!committed || entry.result.status !== 'applied') continue;
          const declaration = writers.find(
            (item) =>
              item.effect === entry.source.effect &&
              item.operation === entry.operation &&
              item.identity.path === `execution.${entry.operationIndex}`,
          );
          if (!declaration) continue;
          const writer = {
            actionIndex,
            step: entry.step,
            operationIndex: entry.operationIndex,
            sourceInstanceId: entry.source.sourceInstanceId,
            declaration: declaration.identity,
          };
          for (const instance of entry.result.state.modifiers ?? [])
            if (!(entry.before.modifiers ?? []).includes(instance))
              instanceWriters.set(instance, writer);
          for (const receipt of entry.result.state.receipts)
            if (!entry.before.receipts.includes(receipt)) receiptWriters.set(receipt, writer);
        }
        const previousReadRank = new Map<number, number>();
        for (const [readIndex, entry] of action.modifierReads.entries()) {
          const rank = entry.read.action === 'receive' ? 0 : entry.read.action === 'give' ? 1 : 2;
          const previous = previousReadRank.get(entry.step);
          if (previous !== undefined && rank <= previous && !(previous === 2 && rank !== 1))
            fail(
              'modifierReadOrderMismatch',
              `requests.${requestIndex}.actions.${actionIndex}.modifierReads.${readIndex}.order`,
              'receive-then-give-then-noHealing',
              [previous, rank],
            );
          previousReadRank.set(entry.step, rank);
          const operation = entry.source.effect.execution[entry.operationIndex];
          const readerDeclaration = writers.find(
            (item) =>
              item.effect === entry.source.effect &&
              item.operation === operation &&
              item.identity.path === `execution.${entry.operationIndex}`,
          );
          const reader = action.operations.find(
            (item) =>
              item.source === entry.source &&
              item.operationIndex === entry.operationIndex &&
              item.step === entry.step,
          );
          const valid =
            operation !== undefined &&
            isHpOperation(operation) &&
            operation.kind === 'resourceMutation' &&
            operation.direction === 'gain' &&
            reader !== undefined &&
            readerDeclaration !== undefined &&
            entry.read.instances.every(
              (instance) =>
                entry.read.state.modifiers?.includes(instance) === true &&
                instance.actor === entry.read.actor &&
                instance.operation.action === entry.read.action,
            );
          if (!valid)
            fail(
              'modifierReadMismatch',
              `requests.${requestIndex}.actions.${actionIndex}.modifierReads.${readIndex}`,
              true,
              false,
            );
          if (!readerDeclaration) continue;
          const linkedWriters = entry.read.instances.flatMap((instance) => {
            const writer = instanceWriters.get(instance);
            return writer && (writer.actionIndex < actionIndex || writer.step < entry.step)
              ? [writer]
              : [];
          });
          modifierReads.push({
            requestIndex,
            actionIndex,
            sourceInstanceId: entry.source.sourceInstanceId,
            readerDeclaration: readerDeclaration.identity,
            readerOperationIndex: entry.operationIndex,
            step: entry.step,
            action: entry.read.action,
            actor: entry.read.actor,
            value: entry.read.value,
            instanceIds: entry.read.instances.map((instance) => instance.id),
            writerOperations: linkedWriters,
            transaction: committed ? 'committed' : action.native ? 'rejected' : 'unobserved',
            consumed: committed && reader?.result.status === 'applied',
          });
        }
      }
    }
    const target = observation?.targetExecution;
    const candidate =
      target?.selection === 'selected' && target.candidateState
        ? hpCandidateObservationFor(target.candidateState)
        : undefined;
    if (target?.selection === 'selected' && !candidate)
      fail('missingCapture', `requests.${requestIndex}.candidate`, true, false);
    const operations = prepared.orderedScenario?.operations ?? [];
    const groups =
      target?.selection === 'selected' && target.candidateState
        ? target.candidateState.executionGroups
        : [];
    const writerOperations = (hp: HpState | undefined, actor: string): Writer[] => {
      if (!hp) return [];
      const seen = new Set<Writer>();
      for (const item of [
        ...(hp.modifiers ?? []).filter((instance) => instance.actor === actor),
        ...hp.receipts.filter((receipt) => receipt.actor === actor),
      ]) {
        const writer = instanceWriters.get(item) ?? receiptWriters.get(item);
        if (writer) seen.add(writer);
      }
      return [...seen].sort(
        (left, right) =>
          left.actionIndex - right.actionIndex ||
          left.step - right.step ||
          left.operationIndex - right.operationIndex,
      );
    };
    const appendCandidateRead = (
      kind: 'condition' | 'value' | 'np',
      operationId: string,
      sequence: number,
      group: number,
      actor: string,
      physicalValue: number | null,
      consumed: boolean,
      hp: HpState | undefined,
    ) => {
      const operation = operations[sequence];
      const executionGroup = groups[group];
      if (
        !operation ||
        operation.operationId !== operationId ||
        !executionGroup?.operationIds.includes(operationId)
      )
        fail(
          'candidateReadMismatch',
          `requests.${requestIndex}.candidateReads.${candidateReads.length}`,
          true,
          false,
        );
      candidateReads.push({
        requestIndex,
        kind,
        operationId,
        sequence,
        group,
        actor,
        physicalValue,
        consumed,
        writerOperations: writerOperations(hp, actor),
      });
    };
    candidate?.reads.forEach((read) =>
      appendCandidateRead(
        'condition',
        read.operationId,
        read.operationSequence,
        read.operationGroupIndex,
        read.actor,
        read.permille,
        groups[read.operationGroupIndex]?.outcome !== 'rolledBack' &&
          (read.conditionOutcome === 'satisfied' || read.conditionOutcome === 'unsatisfied'),
        read.state.hp,
      ),
    );
    candidate?.valueReads.forEach((read) =>
      appendCandidateRead(
        'value',
        read.operation.operationId,
        read.operationSequence,
        read.operationGroupIndex,
        'attacker',
        read.value,
        groups[read.operationGroupIndex]?.outcome !== 'rolledBack' &&
          read.result.outcome === 'applied' &&
          read.contributionIncluded &&
          read.modifierAppended,
        read.state.hp,
      ),
    );
    candidate?.nps.forEach((read) =>
      appendCandidateRead(
        'np',
        read.operationId,
        read.operationSequence,
        read.operationGroupIndex,
        'attacker',
        read.ratio,
        groups[read.operationGroupIndex]?.outcome !== 'rolledBack' &&
          read.disposition === 'consumed',
        read.state.hp,
      ),
    );
  }
  candidateReads.sort(
    (left, right) =>
      left.requestIndex - right.requestIndex ||
      left.sequence - right.sequence ||
      left.group - right.group,
  );
  const owners = directScenarioOwnerIndex(requests);
  const declarationRows = writers.map((declaration) => {
    const direct =
      owners.owners.get(
        JSON.stringify([declaration.identity.origin, declaration.identity.owner]),
      ) ?? [];
    const support =
      owners.supportOwners.get(
        JSON.stringify([declaration.identity.owner, declaration.identity.skill]),
      ) ?? [];
    const ownerRequests = [...new Set([...direct, ...support])].sort((a, b) => a - b);
    const selectedRequests = new Set(
      rows.flatMap((row) => (row.declaration === declaration.identity ? [row.requestIndex] : [])),
    );
    for (const selectedRequest of selectedRequests)
      if (!ownerRequests.includes(selectedRequest))
        fail(
          'ownerSelectionMismatch',
          `declarations.${JSON.stringify(declaration.identity)}.request.${selectedRequest}`,
          true,
          false,
        );
    const ownerContextNotSelected = ownerRequests.filter((index) => !selectedRequests.has(index));
    return {
      identity: declaration.identity,
      ownerRequests,
      selectedRequests: [...selectedRequests],
      ownerContextNotSelected,
      normalNonselection: ownerContextNotSelected.filter(
        (index) => requests[index]?.prepared.status === 'executable',
      ),
      unresolvedOwnerContext: ownerContextNotSelected.filter(
        (index) => requests[index]?.prepared.status !== 'executable',
      ),
    };
  });
  return {
    qualification:
      'Original control requests only. Owner context, selected step, attempt, native commit, physical read and consumption are separate. Writer-to-read links require retained instance or receipt references; a request without a downstream consumer has no read or recovery obligation.',
    requestCount: requests.length,
    declarationCount: writers.length,
    available,
    selected,
    rows,
    modifierReads,
    candidateReads,
    declarationRows,
    gate: { failures, firstDifference: failures[0]?.firstDifference ?? null },
  };
}
