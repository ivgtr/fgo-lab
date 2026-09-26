import { expect, it } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { ENGINE_VERSION, SCHEMA_VERSION } from '@fgo-lab/schema';
import {
  scalarQuantityRecoveryProgram,
  scalarQuantityRecoverySource,
  auditScalarQuantityRecoveryObservations,
} from './productionScalarQuantityRecoveryAudit';
import {
  auditScalarQuantityObservations,
  type ScalarQuantityFailureReason,
} from './productionScalarQuantityAudit';
import { fixtureMaster } from './scalarQuantityAudit.test-support';
import {
  createDefaultResolvedScenario,
  prepareCalculationScenarioWithPolicy,
  evaluatePreparedCalculationScenario,
  requireExecutableCalculation,
} from './scenario';
import {
  productionAuditTestOptions,
  writeProductionAuditArtifact,
} from './productionAuditArtifacts';

type RecoverySpec = {
  name: string;
  prior?: number;
  attempts: number[];
  post?: number;
  restored: number;
  final: number;
  consumed: number;
  maximum?: number;
  attempted: number[];
};
const specs: RecoverySpec[] = [
  {
    name: 'changed-restoration',
    attempts: [3],
    attempted: [5],
    restored: 2,
    final: 2,
    consumed: 2,
  },
  {
    name: 'group-start-after-commit',
    prior: 2,
    attempts: [3],
    attempted: [7],
    restored: 4,
    final: 4,
    consumed: 4,
  },
  {
    name: 'multiple-upper-clamp',
    prior: 2,
    attempts: [30, -3],
    attempted: [10, 7],
    restored: 4,
    final: 4,
    consumed: 4,
  },
  {
    name: 'multiple-lower-clamp',
    prior: 2,
    attempts: [-30, 3],
    attempted: [0, 3],
    restored: 4,
    final: 4,
    consumed: 4,
  },
  {
    name: 'intervening-commit-np-clamp',
    prior: 2,
    attempts: [30, -3],
    attempted: [10, 7],
    post: 5,
    restored: 4,
    final: 9,
    consumed: 4,
    maximum: 4,
  },
];
function recoveryMaster(spec: RecoverySpec) {
  const base = fixtureMaster({
    name: 'recovery',
    initial: 2,
    amounts: spec.attempts,
    sameGroup: true,
    final: spec.final,
    consumed: spec.consumed,
    ...(spec.maximum === undefined ? {} : { maximum: spec.maximum }),
  });
  const servant = base.servants[0]!;
  const skill = servant.skills[0]!;
  const template = skill.effects[0]!;
  const modifier = {
    kind: 'damageModifier',
    modifier: 'attackBuff',
    sign: 1,
    route: {
      target: 'sourceSelf',
      contributionScope: 'personal',
      eligibility: {
        kind: 'requiredRecipient',
        recipient: 'attacker',
        onMissing: 'ignore',
        onMismatch: 'unsupported',
      },
    },
    card: null,
    values: [Array(10).fill(500), [], [], [], []],
    valueExpressions: [[], [], [], [], []],
    semanticSupport: 'supported',
  };
  const failed = {
    ...template,
    id: 'failure',
    occurrenceId: 'failure:0',
    execution: [
      {
        kind: 'resourceMutation',
        resource: 'criticalStars',
        direction: 'gain',
        unit: 'percent',
        recipient: 'sourceSelf',
        amount: { kind: 'fixed', values: [Array(10).fill(100), [], [], [], []] },
        subjectId: null,
      },
    ],
  };
  const sibling = { ...template, id: 'sibling', occurrenceId: 'sibling:0', execution: [modifier] };
  const reader = {
    ...template,
    id: 'guard',
    occurrenceId: 'guard:0',
    execution: [
      { ...modifier, modifier: 'powerMod', values: [Array(10).fill(100), [], [], [], []] },
    ],
    inputDefinitions: [
      {
        key: 'battle:criticalStars',
        kind: 'criticalStars',
        owner: 'field',
        label: 'stars',
        description: 'fixture guard',
        minimum: 0,
        maximum: 99,
        step: 1,
        defaultValue: 20,
        defaultReason: 'fixture',
      },
    ],
    requirement: {
      recipient: 'sourceSelf',
      expression: {
        kind: 'inputQuantity',
        inputKey: 'battle:criticalStars',
        comparison: 'atLeast',
        value: 10,
      },
    },
  };
  const write = (id: string, amount: number) => ({
    ...template,
    id,
    occurrenceId: `${id}:0`,
    execution: [{ ...template.execution[0]!, amount }],
  });
  const skills = [
    ...(spec.prior === undefined
      ? []
      : [{ ...skill, id: 'prior-skill', slot: 1, effects: [write('prior', spec.prior)] }]),
    { ...skill, id: 'failed-skill', slot: 2, effects: [template, sibling, failed] },
    {
      ...skill,
      id: 'guard-skill',
      slot: 3,
      effects: [reader, ...(spec.post === undefined ? [] : [write('post', spec.post)])],
    },
  ];
  return masterSnapshotSchema.parse({
    ...base,
    servants: [
      {
        ...servant,
        skills,
        actorFormGraph: {
          ...servant.actorFormGraph,
          forms: servant.actorFormGraph.forms.map((form) => ({
            ...form,
            skillIds: skills.map((s) => s.id),
          })),
        },
      },
    ],
  });
}

type Source = ReturnType<typeof scalarQuantityRecoverySource>;
type Mutable<T> = T extends
  Source['program'] | Source['scalar']['program'] | Source['scalar']['calculation']
  ? T
  : T extends ReadonlySet<infer U>
    ? Set<U>
    : T extends ReadonlyMap<infer K, infer V>
      ? Map<K, V>
      : T extends object
        ? { -readonly [K in keyof T]: Mutable<T[K]> }
        : T;
type Negative = {
  name: string;
  reason: ScalarQuantityFailureReason;
  path: string;
  gate: ReturnType<typeof auditScalarQuantityRecoveryObservations>;
  transport?: unknown;
};
function recoveryNegatives(name: string, source: Source): Negative[] {
  const program = source.program;
  const scalar = program.scalar;
  const failedIndex = program.recovery.failedGroupIndex;
  const writer = scalar.writers.find((item) => item.operationGroupIndex === failedIndex)!;
  const reader = scalar.readers[0]!;
  const writerPath = `writer.${writer.operationSequence}`;
  const readerPath = `reader.${reader.operationSequence}`;
  const target = (s: Mutable<Source>) => {
    const selected = s.scalar.observation!.targetExecution;
    if (selected?.selection !== 'selected') throw new Error('selected fixture required');
    return selected;
  };
  const state = (s: Mutable<Source>) => target(s).candidateState!;
  const group = (s: Mutable<Source>) => state(s).executionGroups[failedIndex]!;
  const mutation = (s: Mutable<Source>) =>
    group(s).mutations.find((item) => item.operationId === writer.operationId)!;
  const read = (s: Mutable<Source>) => state(s).scalarNpConsumptions[0]!;
  const result: Negative[] = [];
  const add = (
    label: string,
    reason: Negative['reason'],
    path: string,
    change: (s: Mutable<Source>) => void,
  ) => {
    const changed = structuredClone(source) as Mutable<Source>;
    changed.program = program;
    changed.scalar.program = scalar;
    change(changed);
    const transport = {
      calculationStatus: changed.scalar.calculation.status,
      observation: changed.scalar.observation,
      input: changed.scalar.input,
      effects: changed.scalar.effects,
      effectiveContributions: changed.scalar.effectiveContributions,
      result: changed.scalar.result,
      readerUses: changed.scalar.readerUses,
    };
    result.push({
      name: `${name}:${label}`,
      reason,
      path,
      gate: auditScalarQuantityRecoveryObservations({
        expected: [program],
        observations: [changed],
      }),
      transport,
    });
  };
  add('missing-trace', 'scalarTraceMissing', 'target.selection', (s) => {
    s.scalar.observation = undefined;
  });
  add('missing-state', 'scalarTraceMissing', 'state.present', (s) => {
    delete target(s).candidateState;
  });
  add('missing-groups', 'scalarTraceMissing', 'trace.shape', (s) => {
    delete (state(s) as Partial<ReturnType<typeof state>>).executionGroups;
  });
  add('missing-readers', 'scalarTraceMissing', 'trace.shape', (s) => {
    delete (state(s) as Partial<ReturnType<typeof state>>).scalarNpConsumptions;
  });
  add('missing-events', 'scalarTraceMissing', 'trace.shape', (s) => {
    delete (target(s) as Partial<ReturnType<typeof target>>).operationEvents;
  });
  add('missing-group', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    state(s).executionGroups.splice(failedIndex, 1);
  });
  add('missing-mutation', 'scalarTraceMissing', `${writerPath}.mutation.count`, (s) => {
    group(s).mutations = group(s).mutations.filter((m) => m.operationId !== writer.operationId);
  });
  add('duplicate-mutation', 'scalarTraceMissing', `${writerPath}.mutation.count`, (s) => {
    group(s).mutations.push(mutation(s));
  });
  add('missing-proof', 'scalarRollbackMismatch', `group.${failedIndex}.transaction`, (s) => {
    group(s).rollbackProof = null;
  });
  add('missing-reader', 'scalarIdentityMismatch', 'readers.identity', (s) => {
    state(s).scalarNpConsumptions = [];
  });
  add('missing-use', 'scalarUseMismatch', 'use.identity', (s) => {
    s.scalar.readerUses = [];
  });
  add('missing-contribution', 'scalarUseMismatch', 'use.0.components', (s) => {
    s.scalar.effectiveContributions.contributions =
      s.scalar.effectiveContributions.contributions.filter(
        (c) => c.operationId !== reader.operationId,
      );
  });
  add('missing-projection', 'scalarUseMismatch', 'use.0.projectionCount', (s) => {
    s.scalar.effects = s.scalar.effects.filter((e) => e.operationId !== reader.operationId);
  });
  add('missing-use-consumption', 'scalarSourceMismatch', 'use.0.references', (s) => {
    s.scalar.readerUses[0]!.consumption = undefined;
  });
  add('wrong-candidate', 'scalarIdentityMismatch', 'candidate.identity', (s) => {
    target(s).candidateIndex = 100;
  });
  add('wrong-candidate-target', 'scalarIdentityMismatch', 'candidate.identity', (s) => {
    target(s).targetCandidate = { ...target(s).targetCandidate, classId: 'saber' };
  });
  add('wrong-input-reference', 'scalarSourceMismatch', 'source.references', (s) => {
    s.scalar.input = structuredClone(s.scalar.input);
  });
  add('wrong-use-reference', 'scalarSourceMismatch', 'use.0.references', (s) => {
    s.scalar.readerUses[0]!.input = structuredClone(s.scalar.input);
  });
  add('wrong-source-program', 'scalarPopulationMismatch', 'population', (s) => {
    s.program = { ...program, canonicalIdentity: 'wrong' };
  });
  add('wrong-source-scalar', 'scalarSourceMismatch', 'source.references', (s) => {
    s.scalar.program = structuredClone(scalar);
  });
  add('wrong-transaction', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    group(s).transactionIdentity.transactionGroupId = 'wrong';
  });
  add('wrong-group-source', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    group(s).transactionIdentity.sourceInstanceId = 'wrong';
  });
  add('wrong-group-index', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    group(s).groupIndex++;
  });
  add('wrong-group-operation', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    group(s).operationIds[0] = 'wrong';
  });
  add('duplicate-group', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    state(s).executionGroups.push(group(s));
  });
  add('reverse-groups', 'scalarIdentityMismatch', 'groups.identity', (s) => {
    state(s).executionGroups.reverse();
  });
  add('reverse-events', 'scalarOrderMismatch', 'events.order', (s) => {
    target(s).operationEvents.reverse();
  });
  add('duplicate-event', 'scalarOrderMismatch', 'events.order', (s) => {
    target(s).operationEvents.push(target(s).operationEvents[0]!);
  });
  for (const field of [
    'operationId',
    'operationSequence',
    'operationKind',
    'stateAddress',
  ] as const)
    add(
      `wrong-mutation-${field}`,
      'scalarIdentityMismatch',
      field === 'operationId' ? `group.${failedIndex}.scalarMutations` : `${writerPath}.identity`,
      (s) => {
        if (field === 'operationSequence') mutation(s)[field]++;
        else if (field === 'operationKind') mutation(s)[field] = 'resourceMutation';
        else mutation(s)[field] = 'wrong';
      },
    );
  for (const field of [
    'operationId',
    'operationSequence',
    'operationGroupIndex',
    'stateAddress',
  ] as const)
    add(`wrong-reader-${field}`, 'scalarIdentityMismatch', 'readers.identity', (s) => {
      if (field === 'operationSequence' || field === 'operationGroupIndex') read(s)[field]++;
      else if (field === 'stateAddress') read(s)[field] = 'wrong' as 'quantity:battlePointPhase';
      else read(s)[field] = 'wrong';
    });
  add('duplicate-reader', 'scalarIdentityMismatch', 'readers.identity', (s) => {
    state(s).scalarNpConsumptions.push(read(s));
  });
  add('stale-before', 'scalarValueMismatch', `${writerPath}.before`, (s) => {
    mutation(s).before = -1;
  });
  add('wrong-group-start', 'scalarRollbackMismatch', `${writerPath}.after`, (s) => {
    mutation(s).afterTransaction = -1;
  });
  add('attempted-restore', 'scalarRollbackMismatch', `${writerPath}.after`, (s) => {
    mutation(s).afterTransaction = mutation(s).attemptedAfter;
  });
  add('initial-consumption', 'scalarValueMismatch', `${readerPath}.receipt`, (s) => {
    read(s).value = scalar.initialValue! - 1;
  });
  add('attempted-consumption', 'scalarValueMismatch', `${readerPath}.receipt`, (s) => {
    read(s).value = mutation(s).attemptedAfter;
  });
  add('uncommitted-consumed', 'scalarValueMismatch', `${readerPath}.receipt`, (s) => {
    read(s).consumedValue = -1;
  });
  add('coherent-receipt-proof', 'scalarValueMismatch', `${writerPath}.receipt`, (s) => {
    mutation(s).attemptedAfter = mutation(s).before;
    mutation(s).afterTransaction = mutation(s).before;
    group(s).rollbackProof = { battleStateRestored: true, damageInputRestored: true };
  });
  add('coherent-reader-input', 'scalarValueMismatch', `${readerPath}.receipt`, (s) => {
    read(s).value = -1;
    read(s).consumedValue = -1;
    read(s).input.npMultipliers[0] = -1;
    s.scalar.input.npMultipliers[0] = -1;
  });
  add('revive-failed-contribution', 'scalarUseMismatch', 'recovery.discardedContributions', (s) => {
    s.scalar.effectiveContributions.contributions.find(
      (c) => c.operationId && scalar.groups[failedIndex]!.operationIds.includes(c.operationId),
    )!.effective = true;
  });
  add('revive-failed-projection', 'scalarUseMismatch', 'recovery.discardedProjections', (s) => {
    s.scalar.effects.find(
      (e) => e.operationId && scalar.groups[failedIndex]!.operationIds.includes(e.operationId),
    )!.outcome = 'applied';
  });
  add('revive-failed-event', 'scalarOutcomeMismatch', 'recovery.failedEvents', (s) => {
    target(s).operationEvents.find((e) => e.operationId === writer.operationId)!.operationOutcome =
      'applied';
  });
  add('revive-failed-input', 'scalarUseMismatch', 'owner.input', (s) => {
    s.scalar.input.attackBuff = 0.5;
  });
  add('wrong-reader-event', 'scalarOutcomeMismatch', `${readerPath}.eventOutcome`, (s) => {
    target(s).operationEvents.find((e) => e.operationId === reader.operationId)!.operationOutcome =
      'notApplied';
  });
  add('wrong-reader-projection', 'scalarUseMismatch', 'use.0.projectionBinding', (s) => {
    s.scalar.effects.find((e) => e.operationId === reader.operationId)!.projectionKey = 'wrong';
  });
  add('ineffective-reader-contribution', 'scalarUseMismatch', 'use.0.effective', (s) => {
    s.scalar.effectiveContributions.contributions.find(
      (c) => c.operationId === reader.operationId,
    )!.effective = false;
  });
  add('wrong-contribution-source', 'scalarIdentityMismatch', 'use.0.contributionSource', (s) => {
    s.scalar.effectiveContributions.contributions.find(
      (c) => c.operationId === reader.operationId,
    )!.source.skillId = 'wrong';
  });
  add('wrong-reader-input', 'scalarUseMismatch', `${readerPath}.producedInput`, (s) => {
    s.scalar.input.damageFunction = { status: 'resolved', kind: 'standard', ignoreDefense: false };
  });
  add('wrong-reader-use-events', 'scalarUseMismatch', 'use.0.events', (s) => {
    s.scalar.readerUses[0]!.events = [];
  });
  add('wrong-reader-use-projections', 'scalarUseMismatch', 'use.0.projections', (s) => {
    s.scalar.readerUses[0]!.projections = [];
  });
  add('wrong-reader-use-contributions', 'scalarUseMismatch', 'use.0.contributions', (s) => {
    s.scalar.readerUses[0]!.contributions = [];
  });
  add('forged-commit', 'scalarRollbackMismatch', `group.${failedIndex}.transaction`, (s) => {
    group(s).outcome = 'committed';
    group(s).issues = [];
    group(s).rollbackProof = null;
  });
  for (const proof of ['battleStateRestored', 'damageInputRestored'] as const)
    add(
      `forged-proof-${proof}`,
      'scalarRollbackMismatch',
      `group.${failedIndex}.transaction`,
      (s) => {
        group(s).rollbackProof![proof] = false;
      },
    );
  add('missing-typed-issue', 'scalarRollbackMismatch', `group.${failedIndex}.transaction`, (s) => {
    group(s).issues = [];
  });
  add('wrong-typed-issue', 'scalarRollbackMismatch', `group.${failedIndex}.transaction`, (s) => {
    group(s).issues = [{ kind: 'unsupportedOperation', operationId: 'wrong', detail: 'wrong' }];
  });
  add('forged-applied-attempt', 'scalarRollbackMismatch', `${writerPath}.attemptApplied`, (s) => {
    group(s).appliedOperationIds = [];
  });
  add('reader-rollback', 'scalarCommitMismatch', `${readerPath}.commit`, (s) => {
    state(s).executionGroups[reader.operationGroupIndex]!.outcome = 'rolledBack';
  });
  add('forged-reader-disposition', 'scalarOutcomeMismatch', `${readerPath}.disposition`, (s) => {
    read(s).disposition = 'excluded';
  });
  add('forged-result-calculated', 'scalarOutcomeMismatch', 'result.status', (s) => {
    s.scalar.result = { ...s.scalar.result, status: 'calculated' } as typeof s.scalar.result;
  });
  add('forged-calculation-status', 'scalarOutcomeMismatch', 'calculation.status', (s) => {
    s.scalar.calculation = {
      ...s.scalar.calculation,
      status: 'rejected',
    } as unknown as typeof s.scalar.calculation;
  });
  for (const [label, changed, path] of [
    ['missing-source', { expected: [program], observations: [] }, 'population'],
    [
      'duplicate-population',
      { expected: [program, program], observations: [source, source] },
      'population.unique',
    ],
    ['unexpected-source', { expected: [], observations: [source] }, 'population'],
    ['empty-population', { expected: [], observations: [] }, 'population.unique'],
  ] as const)
    result.push({
      name: `${name}:${label}`,
      reason: 'scalarPopulationMismatch',
      path,
      gate: auditScalarQuantityRecoveryObservations(changed),
    });
  for (const field of ['writers', 'readers', 'groups'] as const) {
    const changedProgram = { ...program, scalar: { ...scalar, [field]: [] } };
    result.push({
      name: `${name}:missing-expected-${field}`,
      reason: 'scalarPopulationMismatch',
      path: 'program.contract',
      gate: auditScalarQuantityRecoveryObservations({
        expected: [changedProgram],
        observations: [
          { program: changedProgram, scalar: { ...source.scalar, program: changedProgram.scalar } },
        ],
      }),
    });
  }
  for (const field of ['failedGroupIndex', 'issue', 'failedOperation'] as const) {
    const changedRecovery = { ...program.recovery };
    if (field === 'failedGroupIndex') changedRecovery.failedGroupIndex++;
    else if (field === 'issue')
      changedRecovery.issue = { ...changedRecovery.issue, operationId: 'wrong' };
    else changedRecovery.failedOperation = structuredClone(changedRecovery.failedOperation);
    const changedProgram = { ...program, recovery: changedRecovery };
    result.push({
      name: `${name}:wrong-expected-${field}`,
      reason: field === 'failedOperation' ? 'scalarSourceMismatch' : 'scalarPopulationMismatch',
      path: field === 'failedOperation' ? 'recovery.operationReference' : 'recovery.contract',
      gate: auditScalarQuantityRecoveryObservations({
        expected: [changedProgram],
        observations: [{ program: changedProgram, scalar: source.scalar }],
      }),
    });
  }
  add(
    'reverse-mutations',
    'scalarIdentityMismatch',
    `group.${failedIndex}.scalarMutations`,
    (s) => {
      const scalarMutations = group(s).mutations.filter(
        (m) => m.stateAddress === 'quantity:battlePointPhase',
      );
      if (scalarMutations.length === 1)
        group(s).mutations.push({ ...scalarMutations[0]!, operationId: 'unexpected' });
      else
        group(s).mutations = [
          ...scalarMutations.reverse(),
          ...group(s).mutations.filter((m) => m.stateAddress !== 'quantity:battlePointPhase'),
        ];
    },
  );
  add('coherent-restored-reader', 'scalarRollbackMismatch', `${writerPath}.after`, (s) => {
    const forged = mutation(s).attemptedAfter;
    group(s)
      .mutations.filter((m) => m.stateAddress === 'quantity:battlePointPhase')
      .forEach((m) => {
        m.afterTransaction = forged;
      });
    read(s).value = forged;
    read(s).consumedValue = forged;
  });
  add('reader-projection-outcome', 'scalarUseMismatch', 'use.0.projectionBinding', (s) => {
    s.scalar.effects.find((e) => e.operationId === reader.operationId)!.outcome = 'notApplied';
  });
  add('reader-use-result-reference', 'scalarSourceMismatch', 'use.0.references', (s) => {
    s.scalar.readerUses[0]!.result = structuredClone(s.scalar.result);
  });
  add('proof-true-with-stale-consumption', 'scalarValueMismatch', `${readerPath}.receipt`, (s) => {
    read(s).value = -1;
    group(s).rollbackProof = { battleStateRestored: true, damageInputRestored: true };
  });
  add('value-unchanged-receipts', 'scalarValueMismatch', 'recovery.changed', (s) => {
    const original = group(s).mutations.find(
      (m) => m.stateAddress === 'quantity:battlePointPhase',
    )!.before;
    group(s)
      .mutations.filter((m) => m.stateAddress === 'quantity:battlePointPhase')
      .forEach((m) => {
        m.before = original;
        m.attemptedAfter = original;
        m.afterTransaction = original;
      });
  });
  if (source.scalar.readerUses[0]!.consumption!.value !== scalar.initialValue)
    add('actual-initial-consumption', 'scalarValueMismatch', `${readerPath}.value`, (s) => {
      read(s).value = scalar.initialValue;
    });
  if (
    source.scalar.readerUses[0]!.consumption!.value !==
    source.scalar.program.references.state?.executionGroups[failedIndex]?.mutations[0]
      ?.afterTransaction
  )
    add(
      'restored-but-stale-after-intervening-commit',
      'scalarValueMismatch',
      `${readerPath}.value`,
      (s) => {
        read(s).value = mutation(s).afterTransaction;
      },
    );
  add('forged-result-rows', 'scalarOutcomeMismatch', 'recovery.resultRows', (s) => {
    s.scalar.result = { ...s.scalar.result, rows: [{}] } as unknown as typeof s.scalar.result;
  });
  add('missing-use-input', 'scalarSourceMismatch', 'use.0.references', (s) => {
    delete (s.scalar.readerUses[0]! as Partial<(typeof s.scalar.readerUses)[number]>).input;
  });
  add('missing-use-result', 'scalarSourceMismatch', 'use.0.references', (s) => {
    delete (s.scalar.readerUses[0]! as Partial<(typeof s.scalar.readerUses)[number]>).result;
  });
  add(
    'duplicate-reader-contribution',
    'scalarIdentityMismatch',
    'use.0.contributionIdentity',
    (s) => {
      const contributions = s.scalar.effectiveContributions.contributions.filter(
        (c) => c.operationId === reader.operationId,
      );
      contributions[1]!.contributionId = contributions[0]!.contributionId;
    },
  );
  return result;
}

it(
  'connects scalar rollback, restored ordered NP consumption and use through the shared gate',
  productionAuditTestOptions(['tsk-08-scalar-quantity-recovery.json']),
  async ({ task }) => {
    const positives = [];
    const negatives: Negative[] = [];
    for (const spec of specs) {
      const master = recoveryMaster(spec);
      const scenario = {
        ...createDefaultResolvedScenario(master, undefined),
        battleState: { battlePointPhase: null },
        initialBattlePointPoints: { [master.battlePointDomains[0]!.id]: 2 },
        preNoblePhantasmPlan: [
          ...(spec.prior === undefined
            ? []
            : [{ kind: 'useSkillSlot' as const, slot: 1 as const, skillLevel: 10, choice: null }]),
          { kind: 'useSkillSlot' as const, slot: 2 as const, skillLevel: 10, choice: null },
          { kind: 'useSkillSlot' as const, slot: 3 as const, skillLevel: 10, choice: null },
          { kind: 'executeAttackNoblePhantasm' as const },
        ],
      };
      const versions = {
        schemaVersion: SCHEMA_VERSION,
        engineVersion: ENGINE_VERSION,
        masterDataVersion: master.version,
        appVersion: '0.1.0',
        gameRegion: 'JP',
        masterDataLocale: 'ja-JP',
      } as const;
      const prepared = prepareCalculationScenarioWithPolicy(
        scenario,
        master,
        { kind: 'calculator' },
        {},
        true,
      );
      const calculation = requireExecutableCalculation(
        evaluatePreparedCalculationScenario(prepared, versions),
      );
      const failed =
        prepared.status === 'executable'
          ? prepared.orderedScenario?.operations.find(
              (operation) =>
                operation.kind === 'resourceMutation' && operation.resource === 'criticalStars',
            )
          : undefined;
      if (!failed) throw new Error('canonical failure operation required');
      const program = scalarQuantityRecoveryProgram(prepared, calculation, failed);
      if (!program) throw new Error('recovery program required');
      const source = scalarQuantityRecoverySource(program);
      const gate = auditScalarQuantityRecoveryObservations({
        expected: [program],
        observations: [source],
      });
      const target = calculation.executionObservation?.targetExecution;
      const state = target?.selection === 'selected' ? target.candidateState : undefined;
      const ordinary = requireExecutableCalculation(
        evaluatePreparedCalculationScenario(
          prepareCalculationScenarioWithPolicy(scenario, master, { kind: 'calculator' }),
          versions,
        ),
      );
      const comparable = (value: typeof calculation) => ({
        input: value.input,
        effects: value.effects,
        contributions: value.effectiveContributions,
        result: value.result,
      });
      negatives.push(...recoveryNegatives(spec.name, source));
      const forwardGate = auditScalarQuantityObservations({
        expected: [program.scalar],
        observations: [source.scalar],
      });
      positives.push({
        forwardGate,
        spec,
        program,
        source,
        gate,
        parity: JSON.stringify(comparable(calculation)) === JSON.stringify(comparable(ordinary)),
        state,
      });
    }
    await writeProductionAuditArtifact(task.meta, 'tsk-08-scalar-quantity-recovery.json', {
      canonicalIdentity: 'tsk-08:scalar-quantity-recovery',
      population: 'schema-legal',
      positives,
      negatives,
    });
    for (const negative of negatives) {
      expect(negative.gate.status, negative.name).toBe('failed');
      expect(
        negative.gate.failures.some(
          (failure) => failure.reason === negative.reason && failure.checkPath === negative.path,
        ),
        `${negative.name}:${JSON.stringify(negative.gate.failures.map((f) => ({ reason: f.reason, path: f.checkPath, firstDifference: f.firstDifference })))}`,
      ).toBe(true);
      expect(negative.gate.firstDifference, negative.name).not.toBeNull();
    }
    for (const witness of positives) {
      expect(
        witness.gate.status,
        `${witness.spec.name}:${JSON.stringify(witness.gate.failures)}`,
      ).toBe('passed');
      expect(witness.parity).toBe(true);
      expect(
        witness.state?.executionGroups[witness.program.recovery.failedGroupIndex]?.mutations
          .filter((m) => m.stateAddress === 'quantity:battlePointPhase')
          .map((m) => m.attemptedAfter),
      ).toEqual(witness.spec.attempted);
      expect(witness.forwardGate.status).toBe('failed');
      expect(
        witness.forwardGate.failures.some(
          (f) => f.reason === 'scalarOutcomeMismatch' && f.checkPath === 'result.status',
        ),
      ).toBe(true);
      expect(witness.source.scalar.result.status).toBe('unsupported');
      expect(witness.source.scalar.input.attackBuff).toBe(0);
      expect(
        witness.state?.executionGroups[witness.program.recovery.failedGroupIndex]?.mutations
          .filter((m) => m.stateAddress === 'quantity:battlePointPhase')
          .map((m) => m.afterTransaction),
      ).toEqual(witness.spec.attempts.map(() => witness.spec.restored));
      expect(witness.state?.scalarNpConsumptions[0]).toMatchObject({
        value: witness.spec.final,
        consumedValue: witness.spec.consumed,
        disposition: 'consumed',
      });
    }
  },
);
