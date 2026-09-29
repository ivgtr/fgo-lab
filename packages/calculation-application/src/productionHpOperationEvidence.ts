import { isDeepStrictEqual } from 'node:util';
import { isHpOperation, type ConditionExpression, type HpState } from '@fgo-lab/battle-execution';
import {
  hpCandidateObservationFor,
  preparationHpActionsFor,
} from '@fgo-lab/battle-execution/preparation-audit';
import { firstCanonicalAuditDifference } from '@fgo-lab/master-data/production-audit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import { applyCanonicalInputCommand, type CanonicalInputCommand } from './canonicalInputs';
import { hpRequirementLeaves, type HpProofDeclaration } from './productionHpProofCoverage';
import {
  directScenarioOwnerIndex,
  type HpPublishedDependencyRequest,
} from './productionHpPublishedDependencyCoverage';
import { scalarQuantitySnapshot } from './productionScalarQuantityAudit';

function compiledHpLeaves(
  value: ConditionExpression,
  path: string,
): { path: string; comparison: string; value: number }[] {
  if (value.kind === 'all' || value.kind === 'any')
    return value.expressions.flatMap((child, index) =>
      compiledHpLeaves(child, `${path}.requirements.${index}`),
    );
  if (value.kind === 'not') return compiledHpLeaves(value.expression, `${path}.requirement`);
  return value.kind === 'quantity' && value.quantity === 'attackerHpPermille'
    ? [{ path, comparison: value.comparison, value: value.value }]
    : [];
}

/** Reconcile the original selected operation stream without reexecuting an HP owner. */
export interface HpAuditInputCommandEdge {
  fromRequestIndex: number;
  command: CanonicalInputCommand;
  toRequestIndex: number;
}

export function reconcileHpOperationEvidence(
  declarations: readonly HpProofDeclaration[],
  requests: readonly HpPublishedDependencyRequest[],
  inputCommandEdges: readonly HpAuditInputCommandEdge[] = [],
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
    | 'nativeTransactionMismatch'
    | 'inputCommandEdgeMismatch'
    | 'preparationConditionReadMismatch';
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
  const preparationConditionReads: {
    requestIndex: number;
    actionIndex: number;
    evaluationIndex: number;
    declaration: HpProofDeclaration['identity'];
    sourceInstanceId: string;
    readerOperationIndex: number | null;
    modifierInstanceId: string | null;
    writerSourceInstanceId: string | null;
    writerOperationIndex: number | null;
    declaredOperationIndex: number | null;
    declaredOperationReached: boolean | null;
    step: number;
    readIndex: number;
    actor: string;
    permille: number | null;
    evaluated: boolean | null;
    conditionOutcome: boolean | null;
    transaction: 'committed' | 'rejected';
  }[] = [];
  const fail = (reason: FailureReason, path: string, expected: unknown, actual: unknown) => {
    const firstDifference = firstCanonicalAuditDifference(
      [{ identity: path, value: scalarQuantitySnapshot(expected) }],
      [{ identity: path, value: scalarQuantitySnapshot(actual) }],
    );
    if (firstDifference) failures.push({ reason, path, firstDifference });
  };
  const incoming = new Set<number>();
  for (const [edgeIndex, edge] of inputCommandEdges.entries()) {
    const path = `inputCommandEdges.${edgeIndex}`;
    const from = requests[edge.fromRequestIndex];
    const to = requests[edge.toRequestIndex];
    if (
      !Number.isInteger(edge.fromRequestIndex) ||
      !Number.isInteger(edge.toRequestIndex) ||
      edge.fromRequestIndex < 0 ||
      edge.toRequestIndex <= edge.fromRequestIndex ||
      !from ||
      !to ||
      incoming.has(edge.toRequestIndex)
    ) {
      fail('inputCommandEdgeMismatch', `${path}.indices`, 'unique ordered existing requests', [
        edge.fromRequestIndex,
        edge.toRequestIndex,
      ]);
      continue;
    }
    incoming.add(edge.toRequestIndex);
    if (
      from.prepared.scenario.mode !== 'resolved' ||
      to.prepared.scenario.mode !== 'resolved' ||
      from.calculation?.result.status !== 'inputRequired'
    ) {
      fail('inputCommandEdgeMismatch', `${path}.predecessor`, 'resolved inputRequired', [
        from.prepared.scenario.mode,
        from.calculation?.result.status ?? null,
        to.prepared.scenario.mode,
      ]);
      continue;
    }
    const definition = from.prepared.resolved.inputDefinitions.find(
      (item) => item.key === edge.command.key,
    );
    const required = from.calculation.result.requiredInputs.some(
      (item) => item.key === edge.command.key,
    );
    if (
      !definition ||
      !required ||
      edge.command.value === null ||
      !Number.isInteger(edge.command.value) ||
      edge.command.value < definition.minimum ||
      edge.command.value > definition.maximum ||
      (edge.command.value - definition.minimum) % definition.step !== 0
    ) {
      fail(
        'inputCommandEdgeMismatch',
        `${path}.command`,
        'required valid input command',
        edge.command,
      );
      continue;
    }
    if (
      from.prepared.master !== to.prepared.master ||
      !isDeepStrictEqual(from.prepared.contributionPolicy, to.prepared.contributionPolicy) ||
      !isDeepStrictEqual(from.prepared.preparation, to.prepared.preparation)
    ) {
      fail(
        'inputCommandEdgeMismatch',
        `${path}.owner`,
        'same master, policy and preparation',
        false,
      );
      continue;
    }
    let expected: typeof to.prepared.scenario;
    try {
      expected = applyCanonicalInputCommand(from.prepared.scenario, edge.command);
    } catch {
      fail('inputCommandEdgeMismatch', `${path}.command`, 'applicable command', edge.command);
      continue;
    }
    if (!isDeepStrictEqual(expected, to.prepared.scenario))
      fail('inputCommandEdgeMismatch', `${path}.scenario`, expected, to.prepared.scenario);
  }
  requests.forEach((request, index) => {
    if (request.requestPhase === 'repairAttempt' && !incoming.has(index))
      fail(
        'inputCommandEdgeMismatch',
        `requests.${index}.recovery`,
        'one input command edge',
        null,
      );
  });
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
        if (action.conditionAttempts.length !== action.conditionReads.length)
          fail(
            'preparationConditionReadMismatch',
            `requests.${requestIndex}.actions.${actionIndex}.conditionCount`,
            action.conditionAttempts.length,
            action.conditionReads.length,
          );
        action.conditionAttempts.forEach((entered, evaluationIndex) => {
          const captured = action.conditionReads[evaluationIndex];
          if (
            !captured ||
            captured.kind !== entered.kind ||
            captured.source !== entered.source ||
            captured.operation !== entered.operation ||
            captured.operationIndex !== entered.operationIndex ||
            captured.instance !== entered.instance ||
            captured.step !== entered.step
          )
            fail(
              'preparationConditionReadMismatch',
              `requests.${requestIndex}.actions.${actionIndex}.conditionAttempts.${evaluationIndex}`,
              [
                entered.kind,
                entered.source.sourceInstanceId,
                entered.operationIndex,
                entered.instance?.id ?? null,
                entered.step,
              ],
              captured
                ? [
                    captured.kind,
                    captured.source.sourceInstanceId,
                    captured.operationIndex,
                    captured.instance?.id ?? null,
                    captured.step,
                  ]
                : null,
            );
        });
        action.conditionReads.forEach((event, evaluationIndex) => {
          const path = `requests.${requestIndex}.actions.${actionIndex}.conditionReads.${evaluationIndex}`;
          const root =
            event.kind === 'source'
              ? event.source.effect.requirement.expression
              : event.operation?.useCondition;
          const modifierOwners =
            event.kind === 'modifierUse'
              ? declarations.filter(
                  (item) =>
                    item.identity.kind === 'modifierUseCondition' &&
                    item.operation === event.operation,
                )
              : [];
          const modifierOwner = modifierOwners[0];
          const rootPath =
            event.kind === 'source'
              ? 'requirement.expression'
              : (modifierOwner?.identity.path.match(/^execution\.\d+\.useCondition/)?.[0] ?? '');
          const original = root ? hpRequirementLeaves(root, rootPath) : [];
          const compiled = compiledHpLeaves(event.condition, rootPath);
          const native = action.native;
          const reached = attempt.reached.some((item) =>
            attempt.stepOrigins.some(
              (origin) =>
                origin.index === item.index &&
                origin.index === event.step &&
                origin.source === event.source &&
                (event.kind === 'source'
                  ? origin.operationIndex === null
                  : origin.operationIndex === event.operationIndex),
            ),
          );
          const reader =
            event.kind === 'modifierUse'
              ? action.operations.find(
                  (entry) =>
                    entry.source === event.source &&
                    entry.operationIndex === event.operationIndex &&
                    entry.step === event.step,
                )
              : null;
          const currentWriters = event.instance
            ? action.operations.filter(
                (entry) =>
                  entry.step < event.step &&
                  entry.operation === event.operation &&
                  entry.result.status === 'applied' &&
                  !(entry.before.modifiers ?? []).includes(event.instance!) &&
                  entry.result.state.modifiers?.includes(event.instance!) === true,
              )
            : [];
          if (
            currentWriters.length > 1 ||
            (event.instance && currentWriters.length && instanceWriters.has(event.instance))
          )
            fail(
              'preparationConditionReadMismatch',
              `${path}.writer`,
              'one original writer',
              currentWriters.length,
            );
          const writer = event.instance ? instanceWriters.get(event.instance) : undefined;
          const currentWriter = currentWriters[0];
          if (
            !action.sources.includes(event.source) ||
            !native ||
            !reached ||
            !root ||
            (event.kind === 'source'
              ? event.operation !== null || event.instance !== null || event.operationIndex !== null
              : !event.instance ||
                event.instance.operation !== event.operation ||
                !reader?.before.modifiers?.includes(event.instance) ||
                event.source.effect.execution[event.operationIndex!] !== reader.operation ||
                !modifierOwner ||
                new Set(modifierOwners.map((item) => item.effect)).size !== 1)
          )
            fail('preparationConditionReadMismatch', `${path}.owner`, true, false);
          if (compiled.length !== event.reads.length)
            fail(
              'preparationConditionReadMismatch',
              `${path}.count`,
              compiled.length,
              event.reads.length,
            );
          compiled.forEach((leaf, readIndex) => {
            const raw = original.find((item) => item.path === leaf.path);
            const read = event.reads[readIndex];
            if (
              !raw ||
              !read ||
              read.comparison !== leaf.comparison ||
              read.expectedValue !== leaf.value ||
              (raw.value.kind === 'quantity' &&
                (raw.value.comparison !== leaf.comparison || raw.value.value !== leaf.value))
            ) {
              fail(
                'preparationConditionReadMismatch',
                `${path}.reads.${readIndex}`,
                leaf,
                read ?? null,
              );
              return;
            }
            const kinds =
              event.kind === 'modifierUse'
                ? (['modifierUseCondition'] as const)
                : (['condition', 'hpConditionedNpGauge'] as const);
            for (const kind of kinds) {
              const gaugeOperations =
                kind === 'hpConditionedNpGauge'
                  ? event.source.effect.execution.flatMap((operation, index) =>
                      operation.kind === 'resourceMutation' && operation.resource === 'npGauge'
                        ? [{ operation, index }]
                        : [],
                    )
                  : [{ operation: null, index: -1 }];
              for (const gauge of gaugeOperations) {
                const matched = declarations.filter(
                  (declaration) =>
                    declaration.identity.kind === kind &&
                    declaration.effect ===
                      (kind === 'modifierUseCondition'
                        ? modifierOwner?.effect
                        : event.source.effect) &&
                    declaration.value === raw.value &&
                    declaration.identity.path ===
                      (kind === 'hpConditionedNpGauge'
                        ? `execution.${gauge.index}:${leaf.path}`
                        : leaf.path) &&
                    (kind === 'hpConditionedNpGauge'
                      ? declaration.operation === gauge.operation
                      : kind === 'modifierUseCondition'
                        ? declaration.operation === event.operation
                        : declaration.operation === null),
                );
                if (matched.length !== 1) {
                  fail(
                    'preparationConditionReadMismatch',
                    `${path}.declaration.${kind}.${readIndex}`,
                    1,
                    matched.length,
                  );
                  continue;
                }
                preparationConditionReads.push({
                  requestIndex,
                  actionIndex,
                  evaluationIndex,
                  declaration: matched[0]!.identity,
                  sourceInstanceId: event.source.sourceInstanceId,
                  readerOperationIndex: event.operationIndex,
                  modifierInstanceId: event.instance?.id ?? null,
                  writerSourceInstanceId:
                    writer?.sourceInstanceId ?? currentWriter?.source.sourceInstanceId ?? null,
                  writerOperationIndex:
                    writer?.operationIndex ?? currentWriter?.operationIndex ?? null,
                  declaredOperationIndex: gauge.index < 0 ? null : gauge.index,
                  declaredOperationReached:
                    gauge.index < 0
                      ? null
                      : attempt.reached.some((item) =>
                          attempt.stepOrigins.some(
                            (origin) =>
                              origin.index === item.index &&
                              origin.source === event.source &&
                              origin.operationIndex === gauge.index,
                          ),
                        ),
                  step: event.step,
                  readIndex,
                  actor: read.actor,
                  permille: read.permille,
                  evaluated: read.evaluated,
                  conditionOutcome: event.outcome,
                  transaction: native?.status === 'committed' ? 'committed' : 'rejected',
                });
              }
            }
          });
        });
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
    const preflight = target?.selection === 'selected' ? target.candidateState?.preflight : null;
    const aborted = preflight?.status === 'aborted';
    if (target?.selection === 'selected' && !preflight)
      fail(
        'candidateReadMismatch',
        `requests.${requestIndex}.candidatePreflight`,
        'ready-or-aborted',
        null,
      );
    if (
      aborted &&
      (!preflight.issues.some((issue) => issue.kind === 'invalidActivationContext') ||
        candidate ||
        (target?.selection === 'selected' &&
          (target.operationEvents.length !== 0 ||
            target.candidateState?.executionGroups.length !== 0)))
    )
      fail('candidateReadMismatch', `requests.${requestIndex}.candidatePreflight`, true, false);
    if (target?.selection === 'selected' && !candidate && !aborted)
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
    preparationConditionReads,
    candidateReads,
    declarationRows,
    ...(inputCommandEdges.length ? { inputCommandEdges } : {}),
    gate: { failures, firstDifference: failures[0]?.firstDifference ?? null },
  };
}
