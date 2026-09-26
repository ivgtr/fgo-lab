import type {
  BattleOperation,
  ConditionExpression,
  OrderedExecutionGroupAuditEvent,
  OrderedExecutionAuditEvent,
  OrderedMutationAuditEvent,
  TargetCandidate,
} from '@fgo-lab/battle-execution';
import type { CalculationExecution, PreparedCalculationScenario } from './scenario';
import { userControlSideObservation } from './productionUserControlObservation';
import type {
  ProductionUserControlIdentity,
  ProductionUserControlSideObservation,
} from './productionParityDiagnostics';

const starAddress = 'battle:criticalStars';
type ExecutableCalculation = Extract<CalculationExecution, { status: 'executable' }>;
type Prepared = Extract<PreparedCalculationScenario, { status: 'executable' }>;

export interface CriticalStarsForwardProgram {
  operations: readonly BattleOperation[];
  targetCandidates: readonly TargetCandidate[];
  initialValue: number | null;
  scenario: Prepared['scenario'];
  observation: Prepared['executionObservation'];
  calculation: ExecutableCalculation;
  selectedCandidateIndex: number | null;
  ownerEvents: readonly OrderedExecutionAuditEvent[];
  ownerMutations: readonly {
    groupIndex: number;
    outcome: OrderedExecutionGroupAuditEvent['outcome'];
    mutation: OrderedMutationAuditEvent;
  }[];
}

export interface CriticalStarsForwardSource {
  program: CriticalStarsForwardProgram;
  calculation: ExecutableCalculation;
  observation: Prepared['executionObservation'];
  input: ExecutableCalculation['input'];
  effects: ExecutableCalculation['effects'];
  effectiveContributions: ExecutableCalculation['effectiveContributions'];
  result: ExecutableCalculation['result'];
}

export interface CriticalStarsForwardExpectation {
  identity: ProductionUserControlIdentity;
  enabled: CriticalStarsForwardProgram | null;
  excluded: CriticalStarsForwardProgram | null;
}

function inputQuantityLeaves(
  condition: ConditionExpression,
): readonly Extract<ConditionExpression, { kind: 'inputQuantity' }>[] {
  if (condition.kind === 'inputQuantity') return [condition];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(inputQuantityLeaves);
  return condition.kind === 'not' ? inputQuantityLeaves(condition.expression) : [];
}

export function criticalStarsReadRequirements(condition: ConditionExpression) {
  return inputQuantityLeaves(condition).filter(({ inputKey }) => inputKey === starAddress);
}

function isStarMutation(operation: BattleOperation): boolean {
  return operation.kind === 'resourceMutation' && operation.resource === 'criticalStars';
}

/** The population comes from the prepared canonical program, never from successful traces. */
export function criticalStarsForwardProgram(
  prepared: PreparedCalculationScenario,
  calculation: ExecutableCalculation,
): CriticalStarsForwardProgram | null {
  if (prepared.status !== 'executable' || !prepared.orderedScenario) return null;
  const ordered = prepared.orderedScenario;
  const firstMutation = ordered.operations.findIndex(isStarMutation);
  if (
    firstMutation < 0 ||
    !ordered.operations.some(
      (operation, index) =>
        index > firstMutation && criticalStarsReadRequirements(operation.condition).length > 0,
    )
  )
    return null;
  const target = prepared.executionObservation?.targetExecution;
  const selected = target?.selection === 'selected' ? target : null;
  return {
    operations: ordered.operations,
    targetCandidates:
      ordered.targetResolution.kind === 'candidates' ? ordered.targetResolution.candidates : [],
    initialValue: prepared.canonicalInputs?.values[starAddress] ?? null,
    scenario: prepared.scenario,
    observation: prepared.executionObservation,
    calculation,
    selectedCandidateIndex: selected?.candidateIndex ?? null,
    ownerEvents: selected?.operationEvents.map((event) => ({ ...event })) ?? [],
    ownerMutations:
      selected?.candidateState?.executionGroups.flatMap((group) =>
        group.mutations.map((mutation) => ({
          groupIndex: group.groupIndex,
          outcome: group.outcome,
          mutation: { ...mutation },
        })),
      ) ?? [],
  };
}

export function criticalStarsForwardSource(
  program: CriticalStarsForwardProgram,
  prepared: PreparedCalculationScenario,
  calculation: ExecutableCalculation,
): CriticalStarsForwardSource {
  return {
    program,
    calculation,
    observation: prepared.status === 'executable' ? prepared.executionObservation : undefined,
    input: calculation.input,
    effects: calculation.effects,
    effectiveContributions: calculation.effectiveContributions,
    result: calculation.result,
  };
}

type TransactionIdentity = OrderedExecutionGroupAuditEvent['transactionIdentity'];
function transactionIdentity(operation: BattleOperation): TransactionIdentity {
  const { source } = operation;
  return {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    transactionGroupId: source.transactionGroupId ?? null,
    fallbackEffectIdentity: source.transactionGroupId
      ? null
      : { skillId: source.skillId, effectOccurrenceId: source.effectOccurrenceId },
  };
}
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const isArray = (value: unknown): boolean => Array.isArray(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !isArray(value);

export interface CriticalStarsForwardCheck {
  path: string;
  expected: unknown;
  actual: unknown;
}

/** Checks owner-generated receipts and their use; it does not compute gain/loss or damage. */
export function auditCriticalStarsForwardSide(
  expected: CriticalStarsForwardProgram,
  source: CriticalStarsForwardSource | undefined,
  side: ProductionUserControlSideObservation,
  identity: ProductionUserControlIdentity,
): { differences: CriticalStarsForwardCheck[]; committedMutations: number; forwardReads: number } {
  const differences: CriticalStarsForwardCheck[] = [];
  const check = (path: string, wanted: unknown, actual: unknown) => {
    if (!equal(wanted, actual)) differences.push({ path, expected: wanted, actual });
  };
  const rawSide: unknown = side;
  const rawObservation = record(rawSide) ? rawSide.executionObservation : null;
  const target = record(rawObservation) ? side.executionObservation.targetExecution : null;
  check('source.present', true, source != null);
  check('selection', 'selected', target?.selection ?? null);
  if (!target || target.selection !== 'selected')
    return { differences, committedMutations: 0, forwardReads: 0 };
  check(
    'candidate',
    expected.targetCandidates[target.candidateIndex] ?? null,
    target.targetCandidate,
  );
  check('candidateIndex', expected.selectedCandidateIndex, target.candidateIndex);
  const calculation = expected.calculation;
  check(
    'source.references',
    true,
    source != null &&
      source.program === expected &&
      source.calculation === expected.calculation &&
      source.observation === expected.observation &&
      source.observation === side.executionObservation &&
      calculation.executionObservation === side.executionObservation &&
      calculation.scenario === expected.scenario &&
      calculation.input === source.input &&
      calculation.effects === source.effects &&
      calculation.effectiveContributions === source.effectiveContributions &&
      calculation.result === source.result,
  );
  check(
    'owner',
    identity.ownerId,
    expected.scenario.mode === 'resolved' ? expected.scenario.attacker.servantId : null,
  );
  check(
    'profile',
    identity.profileKey,
    calculation.profileContinuity && 'intendedProfileKey' in calculation.profileContinuity
      ? calculation.profileContinuity.intendedProfileKey
      : null,
  );
  check('result.status', 'calculated', calculation.result.status);
  const projection = calculation.effects.filter(
    (item) =>
      item.operationId === identity.operationId &&
      item.projectionKey === identity.projectionKey &&
      item.contributionId === identity.contributionId,
  );
  check('projection.count', 1, projection.length);
  if (projection.length === 1 && calculation.executionObservation) {
    const actualSide = userControlSideObservation(
      projection[0]!,
      calculation,
      calculation.executionObservation,
    );
    for (const key of [
      'operationEvents',
      'projections',
      'inputBinding',
      'effectiveContributions',
      'damageResult',
      'profileContinuity',
    ] as const)
      check(`use.${key}`, actualSide[key] ?? null, side[key] ?? null);
  }
  const state = target.candidateState;
  check('candidateState.present', true, state !== undefined);
  if (!state || !isArray(state.executionGroups) || !isArray(state.inputQuantityReads)) {
    check('candidateState.collections', true, false);
    return { differences, committedMutations: 0, forwardReads: 0 };
  }
  const traceShape =
    isArray(target.operationEvents) &&
    target.operationEvents.every(record) &&
    state.inputQuantityReads.every(record) &&
    state.executionGroups.every(
      (group) =>
        record(group) &&
        isArray(group.mutations) &&
        group.mutations.every(record) &&
        isArray(group.appliedOperationIds) &&
        isArray(group.issues),
    );
  check('trace.shape', true, traceShape);
  if (!traceShape) return { differences, committedMutations: 0, forwardReads: 0 };
  const groups: { transactionIdentity: TransactionIdentity; operationIds: string[] }[] = [];
  const groupIndexes: number[] = [];
  for (const operation of expected.operations) {
    const transaction = transactionIdentity(operation);
    if (!equal(groups.at(-1)?.transactionIdentity, transaction))
      groups.push({ transactionIdentity: transaction, operationIds: [] });
    groups.at(-1)!.operationIds.push(operation.operationId);
    groupIndexes.push(groups.length - 1);
  }
  check(
    'groups',
    groups.map((group, groupIndex) => ({ groupIndex, ...group })),
    state.executionGroups.map(({ groupIndex, transactionIdentity, operationIds }) => ({
      groupIndex,
      transactionIdentity,
      operationIds,
    })),
  );
  check(
    'events',
    expected.operations.map((operation, sequence) => ({
      sequence,
      operationId: operation.operationId,
      operationKind: operation.kind,
    })),
    target.operationEvents.map(({ sequence, operationId, operationKind }) => ({
      sequence,
      operationId,
      operationKind,
    })),
  );
  check('events.ownerReceipts', expected.ownerEvents, target.operationEvents);
  check(
    'operationIds.unique',
    expected.operations.length,
    new Set(expected.operations.map(({ operationId }) => operationId)).size,
  );
  const expectedAllReads = expected.operations.flatMap((operation, operationSequence) =>
    inputQuantityLeaves(operation.condition).map(({ inputKey }) => ({
      operationId: operation.operationId,
      operationSequence,
      operationGroupIndex: groupIndexes[operationSequence],
      inputKey,
    })),
  );
  const expectedReads = expectedAllReads.filter(({ inputKey }) => inputKey === starAddress);
  const reads = state.inputQuantityReads.filter(({ inputKey }) => inputKey === starAddress);
  check(
    'reads.identity',
    expectedAllReads,
    state.inputQuantityReads.map(
      ({ operationId, operationSequence, operationGroupIndex, inputKey }) => ({
        operationId,
        operationSequence,
        operationGroupIndex,
        inputKey,
      }),
    ),
  );
  for (const sequence of new Set(expectedReads.map(({ operationSequence }) => operationSequence))) {
    const operation = expected.operations[sequence]!;
    const event = target.operationEvents[sequence];
    const ownerEvent = expected.ownerEvents[sequence];
    check(`reader:${sequence}:ownerReceipt`, ownerEvent ?? null, event ?? null);
    const used = calculation.effects.filter(
      ({ operationId }) => operationId === operation.operationId,
    );
    check(`reader:${sequence}:projectionCount`, 1, used.length);
    const use = used[0];
    check(
      `reader:${sequence}:eventUse`,
      use
        ? {
            projectionKey: use.projectionKey,
            contributionId: use.contributionId,
            outcome: use.outcome,
            value: use.valuePermille,
          }
        : null,
      event
        ? {
            projectionKey: event.projectionKey,
            contributionId: event.contributionId,
            outcome: event.projectionOutcome,
            value: event.projectionValuePermille,
          }
        : null,
    );
    if (use?.contributionId !== null && use?.contributionId !== undefined) {
      const contributions = calculation.effectiveContributions.contributions.filter(
        (item) =>
          item.operationId === use.operationId && item.contributionId === use.contributionId,
      );
      check(`reader:${sequence}:effectiveCount`, 1, contributions.length);
      check(
        `reader:${sequence}:effectiveOutcome`,
        use.outcome,
        contributions[0]?.executionOutcome ?? null,
      );
    }
  }
  const mutations = state.executionGroups.flatMap((group: OrderedExecutionGroupAuditEvent) =>
    group.mutations
      .filter(
        ({ stateAddress, operationKind, operationId }) =>
          stateAddress === starAddress ||
          operationKind === 'resourceMutation' ||
          expected.operations.some(
            (operation) => isStarMutation(operation) && operation.operationId === operationId,
          ),
      )
      .map((mutation) => ({ group, mutation })),
  );
  const expectedMutations = expected.operations.flatMap((operation, sequence) =>
    isStarMutation(operation) && expected.ownerEvents[sequence]?.operationOutcome === 'applied'
      ? [
          {
            operationId: operation.operationId,
            operationSequence: sequence,
            groupIndex: groupIndexes[sequence],
            operationKind: operation.kind,
            stateAddress: starAddress,
          },
        ]
      : [],
  );
  check(
    'mutations.identity',
    expectedMutations,
    mutations.map(({ group, mutation }) => ({
      operationId: mutation.operationId,
      operationSequence: mutation.operationSequence,
      groupIndex: group.groupIndex,
      operationKind: mutation.operationKind,
      stateAddress: mutation.stateAddress,
    })),
  );
  check(
    'mutations.ownerReceipts',
    expected.ownerMutations.filter(
      ({ mutation }) =>
        mutation.stateAddress === starAddress || mutation.operationKind === 'resourceMutation',
    ),
    mutations.map(({ group, mutation }) => ({
      groupIndex: group.groupIndex,
      outcome: group.outcome,
      mutation,
    })),
  );
  let current = expected.initialValue;
  let committedMutations = 0;
  let forwardReads = 0;
  let latestWriter: string | null = null;
  for (const [sequence, operation] of expected.operations.entries()) {
    const groupIndex = groupIndexes[sequence]!;
    for (const [index, read] of reads
      .filter(({ operationSequence }) => operationSequence === sequence)
      .entries()) {
      check(`read:${sequence}:${index}:value`, current, read.value);
      check(
        `read:${sequence}:${index}:known`,
        true,
        current !== null &&
          Number.isSafeInteger(read.value) &&
          read.value! >= 0 &&
          read.value! <= 99,
      );
      if (latestWriter !== null) {
        check(
          `read:${sequence}:${index}:committed`,
          'committed',
          state.executionGroups[groupIndex]?.outcome ?? null,
        );
        forwardReads += 1;
      }
    }
    if (!isStarMutation(operation)) continue;
    const records = mutations.filter(({ mutation }) => mutation.operationSequence === sequence);
    for (const { group, mutation } of records) {
      check(`mutation:${sequence}:committed`, 'committed', group.outcome);
      check(`mutation:${sequence}:issues`, [], group.issues);
      check(`mutation:${sequence}:rollbackProof`, null, group.rollbackProof);
      check(
        `mutation:${sequence}:applied`,
        1,
        group.appliedOperationIds.filter((id) => id === operation.operationId).length,
      );
      check(`mutation:${sequence}:before`, current, mutation.before);
      check(
        `mutation:${sequence}:beforeKnown`,
        true,
        current !== null &&
          Number.isSafeInteger(mutation.before) &&
          mutation.before! >= 0 &&
          mutation.before! <= 99,
      );
      check(`mutation:${sequence}:receipt`, mutation.attemptedAfter, mutation.afterTransaction);
      check(
        `mutation:${sequence}:known`,
        true,
        Number.isSafeInteger(mutation.afterTransaction) &&
          mutation.afterTransaction! >= 0 &&
          mutation.afterTransaction! <= 99,
      );
      if (group.outcome !== 'committed') {
        current = null;
        latestWriter = null;
        continue;
      }
      current = mutation.afterTransaction;
      latestWriter = operation.operationId;
      committedMutations += 1;
    }
  }
  check('committedForwardRead', true, committedMutations === 0 || forwardReads > 0);
  return { differences, committedMutations, forwardReads };
}
