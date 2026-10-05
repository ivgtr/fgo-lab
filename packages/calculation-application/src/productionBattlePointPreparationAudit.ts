import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import {
  battlePointPreparationObservationFor,
  type BattlePointPreparationObservation,
} from './battlePointPreparationObservation';
import {
  getSkillsForActorForm,
  getNoblePhantasmVariants,
  getBaseNoblePhantasmVariantForForm,
  noblePhantasmVariantKey,
  canonicalRequirementLeaves,
  type MasterDataSnapshot,
  type MasterEffect,
} from '@fgo-lab/master-data';
import {
  npProgramEffects,
  resolveResourceTargetPolicy,
  type ConditionExpression,
  type BattleOperation,
} from '@fgo-lab/battle-execution';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import { type CalculationExecution, type PreparedCalculationScenario } from './scenario';
import { transactionIdentity } from './productionCriticalStarsAudit';
import { scalarQuantitySnapshot as snapshot } from './productionScalarQuantityAudit';

type Prepared = Extract<PreparedCalculationScenario, { status: 'executable' }>;
type Calculation = Extract<CalculationExecution, { status: 'executable' }>;
const equal = (a: unknown, b: unknown) =>
  firstCanonicalAuditDifference(
    [{ identity: 'domain-comparison', value: snapshot(a) }],
    [{ identity: 'domain-comparison', value: snapshot(b) }],
  ) === null;
type FixedWriter = Extract<MasterEffect['execution'][number], { kind: 'resourceMutation' }>;
type BattlePointWriter =
  FixedWriter | Extract<MasterEffect['execution'][number], { kind: 'battlePointCapacityModifier' }>;
function isWriter(operation: MasterEffect['execution'][number]): operation is FixedWriter {
  return (
    operation.kind === 'resourceMutation' &&
    operation.resource === 'battlePoint' &&
    operation.unit === 'fixed' &&
    operation.amount.kind === 'fixed' &&
    resolveResourceTargetPolicy('attacker', operation.recipient) === 'attacker'
  );
}
function domainLeaves(
  condition: ConditionExpression,
): Extract<ConditionExpression, { kind: 'quantity' }>[] {
  if (condition.kind === 'quantity')
    return condition.quantity === 'battlePointPhase' && condition.subjectId !== undefined
      ? [condition]
      : [];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(domainLeaves);
  return condition.kind === 'not' ? domainLeaves(condition.expression) : [];
}

export interface CanonicalProgram<Writer extends BattlePointWriter = FixedWriter> {
  scenario: Extract<Prepared['scenario'], { mode: 'resolved' }>;
  canonicalInputs: Prepared['canonicalInputs'];
  domains: MasterDataSnapshot['battlePointDomains'];
  actions: {
    index: number;
    actionId: string;
    command: CanonicalProgram['scenario']['preNoblePhantasmPlan'][number];
    skillId: string | null;
    effects: readonly MasterEffect[];
  }[];
  writers: {
    actionIndex: number;
    actionId: string;
    sourceInstanceId: string;
    sourceId: string;
    skillId: string;
    effect: MasterEffect;
    operation: Writer;
    operationIndex: number;
    identity: string;
    actor: string;
    domainId: string | null;
  }[];
  readers: {
    operation: BattleOperation;
    sequence: number;
    leaf: Extract<ConditionExpression, { kind: 'quantity' }>;
  }[];
  nps: { operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>; sequence: number }[];
  operations: readonly BattleOperation[];
  naturalReaders: {
    origin: 'attacker' | 'np';
    skillId: string;
    occurrenceId: string;
    subjectId: string;
    comparison: string;
    value: number;
  }[];
  naturalNpDomainIds: string[];
  naturalNpIds: string[];
  groups: {
    groupIndex: number;
    transactionIdentity: ReturnType<typeof transactionIdentity>;
    operationIds: string[];
  }[];
}

/** The command/master population precedes all activation, receipt and value observations. */
export function battlePointPreparationCanonical(
  prepared: PreparedCalculationScenario,
): CanonicalProgram | null;
export function battlePointPreparationCanonical<Writer extends BattlePointWriter>(
  prepared: PreparedCalculationScenario,
  selectWriter: (operation: MasterEffect['execution'][number]) => operation is Writer,
): CanonicalProgram<Writer> | null;
export function battlePointPreparationCanonical(
  prepared: PreparedCalculationScenario,
  selectWriter: (operation: MasterEffect['execution'][number]) => boolean = isWriter,
): CanonicalProgram<BattlePointWriter> | null {
  const owner: Partial<PreparedCalculationScenario> = prepared;
  if (
    !owner.scenario ||
    owner.scenario.mode !== 'resolved' ||
    !owner.master ||
    !Array.isArray(owner.scenario.preNoblePhantasmPlan) ||
    (owner.scenario.preNoblePhantasmPlan as readonly unknown[]).some(
      (command) => command === null || typeof command !== 'object',
    )
  )
    return null;
  const scenario = owner.scenario;
  const servant = owner.master.servants.find(({ id }) => id === scenario.attacker.servantId);
  if (!servant) return null;
  const actions = scenario.preNoblePhantasmPlan.map((command, index) => {
    const skill =
      command.kind === 'useSkillSlot'
        ? getSkillsForActorForm(servant, scenario.attacker.initialActorFormId).find(
            ({ slot }) => slot === command.slot,
          )
        : undefined;
    const effects =
      skill && command.kind === 'useSkillSlot'
        ? npProgramEffects(skill.effects).filter(
            (effect) =>
              effect.selection?.kind !== 'playerChoice' ||
              (effect.selection.group.key === command.choice?.groupKey &&
                effect.selection.group.candidate === command.choice.candidateKey),
          )
        : [];
    return {
      index,
      actionId: `preparation:${index}:${command.kind}`,
      command,
      skillId: skill?.id ?? null,
      effects,
    };
  });
  const writers = actions.flatMap((action) =>
    action.effects.flatMap((effect) =>
      effect.execution.flatMap((operation, operationIndex) =>
        selectWriter(operation)
          ? [
              {
                actionIndex: action.index,
                actionId: action.actionId,
                sourceInstanceId: `attacker:${servant.id}`,
                sourceId: servant.id,
                skillId: action.skillId!,
                effect,
                operation: operation as BattlePointWriter,
                operationIndex,
                identity: JSON.stringify([
                  action.actionId,
                  `attacker:${servant.id}`,
                  effect.occurrenceId,
                  operationIndex,
                ]),
                actor: 'attacker',
                domainId: (operation as BattlePointWriter).subjectId,
              },
            ]
          : [],
      ),
    ),
  );
  const operations = prepared.orderedScenario?.operations ?? [];
  const groups: CanonicalProgram['groups'] = [];
  for (const operation of operations) {
    const identity = transactionIdentity(operation);
    if (!equal(groups.at(-1)?.transactionIdentity, identity))
      groups.push({ groupIndex: groups.length, transactionIdentity: identity, operationIds: [] });
    groups.at(-1)!.operationIds.push(operation.operationId);
  }
  const readers = operations.flatMap((operation, sequence) =>
    domainLeaves(operation.condition).map((leaf) => ({ operation, sequence, leaf })),
  );
  const nps = operations.flatMap((operation, sequence) =>
    operation.kind === 'executeNpDamage' && operation.damage.kind === 'battlePointPhase'
      ? [{ operation, sequence }]
      : [],
  );
  const variant = getBaseNoblePhantasmVariantForForm(servant, scenario.attacker.initialActorFormId);
  const naturalSources = [
    ...actions.flatMap((action) =>
      action.skillId
        ? [{ origin: 'attacker' as const, skillId: action.skillId, effects: action.effects }]
        : [],
    ),
    ...(variant
      ? [
          {
            origin: 'np' as const,
            skillId: `np:${noblePhantasmVariantKey(variant.ref)}`,
            effects: npProgramEffects(variant.effects),
          },
        ]
      : []),
  ];
  const naturalReaders = naturalSources.flatMap((source) =>
    source.effects.flatMap((effect) =>
      canonicalRequirementLeaves(effect.requirement.expression).flatMap((leaf) =>
        leaf.kind === 'quantity' &&
        leaf.quantity === 'battlePointPhase' &&
        leaf.subjectId !== undefined
          ? [
              {
                origin: source.origin,
                skillId: source.skillId,
                occurrenceId: effect.occurrenceId,
                subjectId: leaf.subjectId,
                comparison: leaf.comparison,
                value: leaf.value,
              },
            ]
          : [],
      ),
    ),
  );
  const naturalNpDomainIds =
    variant?.kind === 'attack'
      ? [
          ...new Set(
            variant.damage.flatMap((damage) =>
              damage.kind === 'battlePointPhase'
                ? damage.parametersByOvercharge.flatMap((row) =>
                    row.map((parameter) => String(parameter.targetId)),
                  )
                : [],
            ),
          ),
        ]
      : [];
  const naturalNpIds =
    variant?.kind === 'attack'
      ? variant.damage
          .filter((damage) => damage.kind === 'battlePointPhase')
          .map((damage) => `np:${noblePhantasmVariantKey(variant.ref)}:${damage.functionId}:damage`)
      : [];
  return {
    scenario,
    canonicalInputs: prepared.canonicalInputs,
    domains: prepared.master.battlePointDomains,
    actions,
    writers,
    readers,
    nps,
    operations,
    naturalReaders,
    naturalNpDomainIds,
    naturalNpIds,
    groups,
  };
}

export interface BattlePointPreparationProgram<Writer extends BattlePointWriter = FixedWriter> {
  canonicalIdentity: string;
  prepared: Prepared;
  calculation: Calculation;
  expected: CanonicalProgram<Writer>;
  contract: CanonicalAuditValue;
  owner: CanonicalAuditValue;
  npReceipts: CanonicalAuditValue;
  references: {
    observation: Calculation['executionObservation'];
    input: Calculation['input'];
    effects: Calculation['effects'];
    contributions: Calculation['effectiveContributions'];
    result: Calculation['result'];
    state: Prepared['orderedScenario'];
  };
}
export interface BattlePointPreparationSource<Writer extends BattlePointWriter = FixedWriter> {
  program: BattlePointPreparationProgram<Writer>;
  calculation: Calculation;
  observation: Calculation['executionObservation'];
  preparation: BattlePointPreparationObservation | undefined;
  input: Calculation['input'];
  effects: Calculation['effects'];
  contributions: Calculation['effectiveContributions'];
  result: Calculation['result'];
  readerUses: readonly {
    operationId: string;
    events: readonly unknown[];
    projections: readonly unknown[];
    contributions: readonly unknown[];
  }[];
}
function owner(
  source: Omit<BattlePointPreparationSource<BattlePointWriter>, 'program' | 'readerUses'>,
) {
  return {
    observation: source.observation,
    preparation: source.preparation,
    input: source.input,
    effects: source.effects,
    contributions: source.contributions,
    result: source.result,
  };
}
export function battlePointPreparationSource<Writer extends BattlePointWriter>(
  program: BattlePointPreparationProgram<Writer>,
): BattlePointPreparationSource<Writer> {
  const calculation = program.calculation;
  const target = calculation.executionObservation?.targetExecution;
  const ids = [
    ...new Set([
      ...program.expected.readers.map(({ operation }) => operation.operationId),
      ...program.expected.nps.map(({ operation }) => operation.operationId),
    ]),
  ];
  return {
    program,
    calculation,
    observation: calculation.executionObservation,
    preparation: battlePointPreparationObservationFor(calculation.executionObservation),
    input: calculation.input,
    effects: calculation.effects,
    contributions: calculation.effectiveContributions,
    result: calculation.result,
    readerUses: ids.map((operationId) => ({
      operationId,
      events:
        target?.selection === 'selected'
          ? target.operationEvents.filter((event) => event.operationId === operationId)
          : [],
      projections: calculation.effects.filter((effect) => effect.operationId === operationId),
      contributions: calculation.effectiveContributions.contributions.filter(
        (item) => item.operationId === operationId,
      ),
    })),
  };
}
export function battlePointPreparationProgram(
  prepared: PreparedCalculationScenario,
  calculation: Calculation,
): BattlePointPreparationProgram | null {
  if (prepared.status !== 'executable' || !prepared.orderedScenario) return null;
  const expected = battlePointPreparationCanonical(prepared);
  if (!expected?.writers.length || !expected.nps.length) return null;
  return battlePointPreparationProgramFromCanonical(prepared, calculation, expected);
}
export function battlePointPreparationProgramFromCanonical<Writer extends BattlePointWriter>(
  prepared: Prepared,
  calculation: Calculation,
  expected: CanonicalProgram<Writer>,
): BattlePointPreparationProgram<Writer> {
  const canonicalIdentity = `tsk-08:preparation-battle-point:${JSON.stringify(expected.writers.map(({ identity }) => identity))}`;
  const program: BattlePointPreparationProgram<Writer> = {
    canonicalIdentity,
    prepared,
    calculation,
    expected,
    contract: snapshot(expected),
    owner: null,
    npReceipts: snapshot(
      calculation.executionObservation?.targetExecution?.selection === 'selected'
        ? calculation.executionObservation.targetExecution.candidateState?.scalarNpConsumptions
        : undefined,
    ),
    references: {
      observation: calculation.executionObservation,
      input: calculation.input,
      effects: calculation.effects,
      contributions: calculation.effectiveContributions,
      result: calculation.result,
      state: prepared.orderedScenario,
    },
  };
  program.owner = snapshot(owner(battlePointPreparationSource(program)));
  return program;
}
export type BattlePointPreparationFailureReason =
  | 'domainPopulationMismatch'
  | 'domainSourceMismatch'
  | 'domainTraceMissing'
  | 'domainIdentityMismatch'
  | 'domainCommitMismatch'
  | 'domainOrderMismatch'
  | 'domainValueMismatch'
  | 'domainUseMismatch'
  | 'domainOutcomeMismatch';
export interface BattlePointPreparationFailure {
  reason: BattlePointPreparationFailureReason;
  canonicalIdentity: string;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: CanonicalAuditDifference;
}
export function auditBattlePointPreparationObservations(input: {
  expected: readonly BattlePointPreparationProgram[];
  observations: readonly BattlePointPreparationSource[];
}) {
  const failures: BattlePointPreparationFailure[] = [];
  let changedWrites = 0;
  let npConsumptions = 0;
  const check = (
    identity: string,
    reason: BattlePointPreparationFailureReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const wanted = snapshot(expected);
    const observed = snapshot(actual);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: wanted }],
      [{ identity, value: observed }],
    );
    if (!difference) return;
    failures.push({
      reason,
      canonicalIdentity: identity,
      checkPath,
      expected: wanted,
      actual: observed,
      firstDifference: {
        ...difference,
        path: difference.path ? `${checkPath}.${difference.path}` : checkPath,
      },
    });
  };
  const expectedIds = input.expected.map(({ canonicalIdentity }) => canonicalIdentity);
  const actualIds = input.observations.map(({ program }) => program.canonicalIdentity);
  check(
    'tsk-08:preparation-battle-point',
    'domainPopulationMismatch',
    'population',
    expectedIds,
    actualIds,
  );
  check(
    'tsk-08:preparation-battle-point',
    'domainPopulationMismatch',
    'population.unique',
    expectedIds.length,
    new Set(expectedIds).size,
  );
  for (const program of input.expected) {
    const c = (
      reason: BattlePointPreparationFailureReason,
      path: string,
      expected: unknown,
      actual: unknown,
    ) => check(program.canonicalIdentity, reason, path, expected, actual);
    const source = input.observations.find(
      (item) => item.program.canonicalIdentity === program.canonicalIdentity,
    );
    c('domainSourceMismatch', 'source.present', true, !!source);
    if (!source) continue;
    c(
      'domainIdentityMismatch',
      'source.reference',
      true,
      source.program === program && source.calculation === program.calculation,
    );
    c('domainSourceMismatch', 'canonical.contract', program.contract, program.expected);
    c(
      'domainSourceMismatch',
      'canonical.owner',
      program.contract,
      battlePointPreparationCanonical(program.prepared),
    );
    const { expected, prepared, references: refs } = program;
    c(
      'domainPopulationMismatch',
      'canonical.npPopulation',
      expected.naturalNpIds,
      expected.nps.map(({ operation }) => operation.operationId),
    );
    const ordered = prepared.orderedScenario;
    c('domainTraceMissing', 'preparation.state', true, !!preparationExecutionStateFor(ordered)?.battlePoints);
    c(
      'domainIdentityMismatch',
      'preparation.actor',
      expected.scenario.attacker.servantId,
      preparationExecutionStateFor(ordered)?.battlePoints?.actors.attacker?.actorId,
    );
    c('domainIdentityMismatch', 'preparation.stateReference', true, ordered === refs.state);
    c('domainPopulationMismatch', 'canonical.writers', true, expected.writers.length > 0);
    c(
      'domainPopulationMismatch',
      'canonical.readers',
      true,
      expected.readers.length > 0 && expected.nps.length > 0,
    );
    const observation = source.observation;
    c('domainTraceMissing', 'observation.present', true, !!observation);
    c(
      'domainIdentityMismatch',
      'observation.reference',
      true,
      observation === refs.observation && observation === prepared.executionObservation,
    );
    const preparation = source.preparation;
    c(
      'domainIdentityMismatch',
      'preparation.reference',
      true,
      preparation === battlePointPreparationObservationFor(refs.observation),
    );
    const target = observation?.targetExecution;
    c('domainTraceMissing', 'preparation.capture', true, !!preparation);
    c('domainIdentityMismatch', 'candidate.selection', 'selected', target?.selection);
    if (!ordered || !preparation || target?.selection !== 'selected' || !preparationExecutionStateFor(ordered)?.battlePoints) continue;
    const state = target.candidateState;
    c('domainTraceMissing', 'candidate.state', true, !!state);
    if (!state) continue;
    c(
      'domainIdentityMismatch',
      'execution.groups',
      expected.groups,
      state.executionGroups.map(({ groupIndex, transactionIdentity, operationIds }) => ({
        groupIndex,
        transactionIdentity,
        operationIds,
      })),
    );
    c(
      'domainCommitMismatch',
      'execution.commits',
      expected.groups.map(() => ['committed', [], null]),
      state.executionGroups.map(({ outcome, issues, rollbackProof }) => [
        outcome,
        issues,
        rollbackProof,
      ]),
    );
    c(
      'domainSourceMismatch',
      'preparation.commands',
      expected.actions.map(({ command }) => command),
      preparation.transitions.map(({ command }) => command),
    );
    c(
      'domainCommitMismatch',
      'preparation.actions',
      expected.actions.map(({ command }) => command),
      ordered.appliedPreparationActions.map(({ command }) => command),
    );
    const cursor = new Map<string, unknown>();
    for (const [index, action] of expected.actions.entries()) {
      const transition = preparation.transitions[index];
      c('domainTraceMissing', `action.${index}.transition`, true, !!transition);
      if (!transition) continue;
      c('domainCommitMismatch', `action.${index}.status`, 'applied', transition.result.status);
      c(
        'domainOrderMismatch',
        `action.${index}.index`,
        index,
        transition.before.appliedActionCount,
      );
      if (transition.result.status !== 'applied') continue;
      const committed = transition.result.state;
      c(
        'domainCommitMismatch',
        `action.${index}.reference`,
        true,
        committed.appliedActions[index] === ordered.appliedPreparationActions[index],
      );
      if (index > 0)
        c(
          'domainOrderMismatch',
          `action.${index}.continuity`,
          preparation.transitions[index - 1]?.result.state.battlePoints,
          transition.before.battlePoints,
        );
      if (action.skillId) {
        const applied = committed.appliedActions[index];
        c(
          'domainIdentityMismatch',
          `action.${index}.form`,
          expected.scenario.attacker.initialActorFormId,
          applied?.actorFormId,
        );
        c('domainSourceMismatch', `action.${index}.source`, action.skillId, applied?.sourceId);
        c(
          'domainSourceMismatch',
          `action.${index}.effects`,
          action.effects,
          applied?.selectedEffects.map(({ effect }) => effect),
        );
      }
      const writers = expected.writers.filter(({ actionIndex }) => actionIndex === index);
      for (const [actor, actorState] of Object.entries(transition.before.battlePoints.actors))
        for (const [domainId, value] of Object.entries(actorState.domains))
          if (!writers.some((writer) => writer.actor === actor && writer.domainId === domainId))
            c(
              'domainValueMismatch',
              `action.${index}.unwritten.${JSON.stringify([actor, domainId])}`,
              value,
              committed.battlePoints.actors[actor]?.domains[domainId],
            );
      const prior = transition.before.battlePoints.receipts;
      const receipts = committed.battlePoints.receipts.slice(prior.length);
      // Other resource families cannot satisfy this domain writer population.
      c(
        'domainPopulationMismatch',
        `action.${index}.receipts`,
        writers.map(({ identity }) => identity),
        receipts.map(({ identity }) => identity),
      );
      for (const [writerIndex, writer] of writers.entries()) {
        const path = `writer.${writer.actionIndex}.${writer.operationIndex}.${writerIndex}`;
        const receipt = receipts[writerIndex];
        c('domainTraceMissing', `${path}.receipt`, true, !!receipt);
        if (!receipt) continue;
        c(
          'domainIdentityMismatch',
          `${path}.identity`,
          [writer.identity, writer.actor, writer.domainId],
          [receipt.identity, receipt.actor, receipt.domainId],
        );
        const key = JSON.stringify([writer.actor, writer.domainId]);
        const before = cursor.has(key)
          ? cursor.get(key)
          : transition.before.battlePoints.actors[writer.actor]?.domains[writer.domainId!];
        c('domainOrderMismatch', `${path}.before`, before, receipt.before);
        c('domainValueMismatch', `${path}.changed`, true, !equal(receipt.before, receipt.after));
        if (!equal(receipt.before, receipt.after)) changedWrites++;
        cursor.set(key, receipt.after);
        c(
          'domainCommitMismatch',
          `${path}.executed`,
          true,
          committed.battlePoints.executedEffects.includes(
            JSON.stringify([
              'attacker',
              writer.sourceInstanceId,
              writer.skillId,
              writer.effect.occurrenceId,
            ]),
          ),
        );
        c(
          'domainSourceMismatch',
          `${path}.domain`,
          true,
          ordered.battlePointDomains.some(({ id }) => id === writer.domainId),
        );
        const retained = expected.operations.filter(
          (operation) =>
            operation.source.origin === 'attacker' &&
            operation.source.sourceInstanceId === writer.sourceInstanceId &&
            operation.source.skillId === writer.skillId &&
            operation.source.effectOccurrenceId === writer.effect.occurrenceId,
        );
        const projections = ordered.retainedProjections.filter(
          (projection) =>
            projection.source.origin === 'attacker' &&
            projection.source.sourceInstanceId === writer.sourceInstanceId &&
            projection.source.skillId === writer.skillId &&
            projection.source.effectOccurrenceId === writer.effect.occurrenceId,
        );
        c(
          'domainCommitMismatch',
          `${path}.retained`,
          true,
          projections.some((projection) => projection.explanation.code === 'stateMutationOnly') ||
            retained.some(
              (operation) =>
                operation.kind === 'preserveSemanticEffect' &&
                operation.semanticKind === 'resourceMutation',
            ),
        );
        c(
          'domainCommitMismatch',
          `${path}.doubleApplication`,
          [],
          retained.filter(
            (operation) =>
              operation.kind === 'resourceMutation' || operation.kind === 'addQuantity',
          ),
        );
        c(
          'domainUseMismatch',
          `${path}.damageContribution`,
          [],
          source.contributions.contributions.filter((item) =>
            projections.some((projection) => projection.operationId === item.operationId),
          ),
        );
        c(
          'domainUseMismatch',
          `${path}.retainedUse`,
          projections,
          source.effects.filter((projection) =>
            projections.some((retained) => retained.projectionKey === projection.projectionKey),
          ),
        );
      }
      for (const [key, value] of cursor) {
        const [actor, domainId] = JSON.parse(key) as [string, string];
        c(
          'domainValueMismatch',
          `action.${index}.live.${key}`,
          value,
          committed.battlePoints.actors[actor]?.domains[domainId],
        );
      }
    }
    npConsumptions += auditBattlePointPreparationUse(program, source, c);
  }
  return {
    canonicalIdentity: 'tsk-08:preparation-battle-point',
    status: failures.length ? ('failed' as const) : ('passed' as const),
    expected: expectedIds,
    actual: actualIds,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
    changedWrites,
    npConsumptions,
  };
}

export function auditBattlePointPreparationUse(
  program: BattlePointPreparationProgram<BattlePointWriter>,
  source: BattlePointPreparationSource<BattlePointWriter>,
  c: (
    reason: BattlePointPreparationFailureReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => void,
): number {
  const { expected, prepared, references: refs } = program;
  const ordered = prepared.orderedScenario;
  const preparation = source.preparation;
  const target = source.observation?.targetExecution;
  if (
    !ordered ||
    !preparation ||
    target?.selection !== 'selected' ||
    !preparationExecutionStateFor(ordered)?.battlePoints ||
    !target.candidateState
  )
    return 0;
  const state = target.candidateState;
  const groupIndex = (operationId: string) =>
    expected.groups.find((group) => group.operationIds.includes(operationId))?.groupIndex;
  let npConsumptions = 0;
  c(
    'domainCommitMismatch',
    'preparation.terminal',
    preparation.transitions.at(-1)?.result.state.battlePoints,
    preparationExecutionStateFor(ordered)?.battlePoints,
  );
  const conversion = preparation.conversion;
  c('domainTraceMissing', 'conversion.present', true, !!conversion);
  if (!conversion) return 0;
  c(
    'domainIdentityMismatch',
    'conversion.references',
    true,
    conversion.state === preparationExecutionStateFor(ordered)?.battlePoints &&
      conversion.input === ordered.baseInput &&
      conversion.input === prepared.scenarioInput,
  );
  c(
    'domainSourceMismatch',
    'conversion.domain',
    true,
    !!conversion.domain && ordered.battlePointDomains.includes(conversion.domain),
  );
  if (!conversion.domain) return 0;
  c(
    'domainIdentityMismatch',
    'conversion.parameterDomain',
    conversion.domain.id,
    String(conversion.parameter.targetId),
  );
  c(
    'domainValueMismatch',
    'conversion.value',
    preparationExecutionStateFor(ordered)?.battlePoints.actors.attacker?.domains[conversion.domain.id],
    conversion.value,
  );
  c(
    'domainValueMismatch',
    'conversion.scalar',
    conversion.phase,
    ordered.baseInput.battlePointPhase,
  );
  c(
    'domainPopulationMismatch',
    'conversion.writerDomain',
    true,
    expected.writers.some(({ domainId }) => domainId === conversion.domain?.id),
  );
  c(
    'domainPopulationMismatch',
    'canonical.npDomain',
    true,
    expected.naturalNpDomainIds.includes(conversion.domain.id),
  );
  for (const [index, natural] of expected.naturalReaders.entries()) {
    c(
      'domainPopulationMismatch',
      `canonical.reader.${index}`,
      true,
      expected.readers.some(
        ({ operation, leaf }) =>
          operation.source.origin === natural.origin &&
          operation.source.skillId === natural.skillId &&
          operation.source.effectOccurrenceId === natural.occurrenceId &&
          leaf.subjectId === natural.subjectId &&
          leaf.comparison === natural.comparison &&
          leaf.value === natural.value,
      ),
    );
  }
  c(
    'domainPopulationMismatch',
    'canonical.naturalReaders',
    true,
    expected.naturalReaders.length > 0,
  );
  const expectedReads = expected.readers.filter(
    ({ leaf }) => leaf.subjectId === conversion.domain?.id,
  );
  c('domainPopulationMismatch', 'terminal.readers', true, expectedReads.length > 0);
  const reads = state.battlePointPhaseReads.filter(
    ({ subjectId }) => subjectId === conversion.domain?.id,
  );
  c(
    'domainPopulationMismatch',
    'terminal.readPopulation',
    expectedReads.map(({ operation, sequence, leaf }) => [
      operation.operationId,
      sequence,
      leaf.subjectId,
      leaf.comparison,
      leaf.value,
    ]),
    reads.map((read) => [
      read.operationId,
      read.operationSequence,
      read.subjectId,
      read.comparison,
      read.expectedValue,
    ]),
  );
  for (const [index, read] of reads.entries()) {
    c(
      'domainIdentityMismatch',
      `read.${index}.group`,
      groupIndex(read.operationId),
      read.operationGroupIndex,
    );
    c('domainIdentityMismatch', `read.${index}.actor`, 'attacker', read.actor);
    c(
      'domainValueMismatch',
      `read.${index}.pointPhase`,
      [conversion.value?.kind === 'present' ? conversion.value.point : null, conversion.phase],
      [read.point, read.phase],
    );
    c('domainUseMismatch', `read.${index}.evaluation`, true, read.evaluated);
  }
  c(
    'domainPopulationMismatch',
    'np.population',
    expected.nps.map(({ operation, sequence }) => [operation.operationId, sequence]),
    state.scalarNpConsumptions.map((read) => [read.operationId, read.operationSequence]),
  );
  for (const [index, np] of expected.nps.entries()) {
    const read = state.scalarNpConsumptions[index];
    c('domainTraceMissing', `np.${index}.receipt`, true, !!read);
    if (!read) continue;
    c(
      'domainIdentityMismatch',
      `np.${index}.group`,
      groupIndex(read.operationId),
      read.operationGroupIndex,
    );
    c(
      'domainIdentityMismatch',
      `np.${index}.parameter`,
      true,
      np.operation.damage.kind === 'battlePointPhase' &&
        np.operation.damage.parametersByOvercharge[ordered.baseInput.overcharge - 1]?.[
          ordered.baseInput.npLevel - 1
        ] === conversion.parameter,
    );
    c('domainValueMismatch', `np.${index}.raw`, conversion.phase, read.value);
    c('domainUseMismatch', `np.${index}.disposition`, 'consumed', read.disposition);
    c('domainUseMismatch', `np.${index}.evaluation`, 'resolved', read.evaluation.status);
    c(
      'domainValueMismatch',
      `np.${index}.consumed`,
      (program.npReceipts as Record<string, CanonicalAuditValue>[])[index]?.consumedValue,
      read.consumedValue,
    );
    c('domainValueMismatch', `np.${index}.inputScalar`, read.value, read.input.battlePointPhase);
    const npFields = (input: Calculation['input']) => ({
      battlePointPhase: input.battlePointPhase,
      npMultipliers: input.npMultipliers,
      npSpecialMultipliers: input.npSpecialMultipliers,
      damageFunction: input.damageFunction,
    });
    c('domainUseMismatch', `np.${index}.input`, npFields(read.input), npFields(source.input));
    if (read.evaluation.status === 'resolved') {
      c(
        'domainUseMismatch',
        `np.${index}.multipliers`,
        read.evaluation.npSpecialMultipliers,
        source.input.npSpecialMultipliers,
      );
    }
    npConsumptions++;
  }
  const wantedUses = battlePointPreparationSource(program).readerUses;
  c(
    'domainPopulationMismatch',
    'use.population',
    wantedUses.map(({ operationId }) => operationId),
    source.readerUses.map(({ operationId }) => operationId),
  );
  for (const [index, wanted] of wantedUses.entries()) {
    const actual = source.readerUses[index];
    c('domainUseMismatch', `use.${index}.evidence`, wanted, actual);
    const operation = expected.operations.find(
      (operation) => operation.operationId === wanted.operationId,
    );
    c('domainTraceMissing', `use.${index}.operation`, true, !!operation);
    if (!operation) continue;
    const events = target.operationEvents.filter(
      (event) => event.operationId === wanted.operationId,
    );
    const projections = source.effects.filter(
      (projection) => projection.operationId === wanted.operationId,
    );
    const contributions = source.contributions.contributions.filter(
      (contribution) => contribution.operationId === wanted.operationId,
    );
    c(
      'domainUseMismatch',
      `use.${index}.binding`,
      {
        count: 1,
        sequence: expected.operations.indexOf(operation),
        kind: operation.kind,
        projectionKey: projections[0]?.projectionKey,
        contributionId: projections[0]?.contributionId,
        outcome: projections[0]?.outcome,
        value: projections[0]?.valuePermille,
      },
      {
        count: events.length,
        sequence: events[0]?.sequence,
        kind: events[0]?.operationKind,
        projectionKey: events[0]?.projectionKey,
        contributionId: events[0]?.contributionId,
        outcome: events[0]?.projectionOutcome,
        value: events[0]?.projectionValuePermille,
      },
    );
    c('domainUseMismatch', `use.${index}.projectionCount`, 1, projections.length);
    c('domainUseMismatch', `use.${index}.applied`, 'applied', events[0]?.operationOutcome);
    c(
      'domainIdentityMismatch',
      `use.${index}.contributionSources`,
      contributions.map(() => operation.source),
      contributions.map(({ source }) => source),
    );
    c(
      'domainUseMismatch',
      `use.${index}.contributionEffective`,
      contributions.map(() => true),
      contributions.map(({ effective }) => effective),
    );
    c(
      'domainUseMismatch',
      `use.${index}.components`,
      operation.kind === 'executeNpDamage' ? ['npBase', 'npSpecial'] : ['modifier'],
      contributions.map(({ component }) => component),
    );

    c('domainUseMismatch', `use.${index}.eventPresent`, true, wanted.events.length > 0);
    c('domainUseMismatch', `use.${index}.projectionPresent`, true, wanted.projections.length > 0);
    c(
      'domainUseMismatch',
      `use.${index}.contributionPresent`,
      true,
      wanted.contributions.length > 0,
    );
  }
  c(
    'domainIdentityMismatch',
    'use.canonicalInput',
    true,
    source.input === prepared.resolved.input &&
      source.effects === prepared.resolved.effects &&
      source.contributions === prepared.resolved.effectiveContributions,
  );
  c(
    'domainIdentityMismatch',
    'use.references',
    true,
    source.input === refs.input &&
      source.effects === refs.effects &&
      source.contributions === refs.contributions &&
      source.result === refs.result,
  );
  for (const key of [
    'observation',
    'preparation',
    'input',
    'effects',
    'contributions',
    'result',
  ] as const)
    c(
      key === 'result' ? 'domainOutcomeMismatch' : 'domainUseMismatch',
      `owner.${key}`,
      (program.owner as Record<string, CanonicalAuditValue>)[key],
      owner(source)[key],
    );
  c('domainOutcomeMismatch', 'result.status', 'calculated', source.result.status);
  return npConsumptions;
}

/** All published declarations and natural NP reader contracts are separate populations. */
export function battlePointPreparationCanonicalInventory(master: MasterDataSnapshot) {
  const writers = master.servants.flatMap((servant) =>
    servant.skills.flatMap((skill) =>
      npProgramEffects(skill.effects).flatMap((effect) =>
        effect.execution.flatMap((operation, operationIndex) =>
          isWriter(operation)
            ? [
                {
                  ownerId: servant.id,
                  skillId: skill.id,
                  occurrenceId: effect.occurrenceId,
                  operationIndex,
                  domainId: (operation as BattlePointWriter).subjectId,
                  operation,
                },
              ]
            : [],
        ),
      ),
    ),
  );
  const contracts = writers.filter((writer) => {
    const servant = master.servants.find(({ id }) => id === writer.ownerId)!;
    return getNoblePhantasmVariants(servant).some(
      (variant) =>
        variant.kind === 'attack' &&
        variant.damage.some(
          (damage) =>
            damage.kind === 'battlePointPhase' &&
            damage.parametersByOvercharge.some((row) =>
              row.some((parameter) => String(parameter.targetId) === writer.domainId),
            ),
        ),
    );
  });
  return { writers, contracts };
}
export function auditPublishedBattlePointPreparationObservations(
  inventory: ReturnType<typeof battlePointPreparationCanonicalInventory>,
  programs: readonly BattlePointPreparationProgram[],
  observations: readonly BattlePointPreparationSource[],
) {
  const gate = auditBattlePointPreparationObservations({ expected: programs, observations });
  const member = (writer: {
    ownerId: string;
    skillId: string;
    occurrenceId: string;
    operationIndex: number;
  }) =>
    JSON.stringify([writer.ownerId, writer.skillId, writer.occurrenceId, writer.operationIndex]);
  const expected = [...new Set(inventory.contracts.map(member))].sort();
  const actual = [
    ...new Set(
      programs.flatMap((program) =>
        program.expected.writers.map((writer) =>
          member({
            ownerId: writer.sourceId,
            skillId: writer.skillId,
            occurrenceId: writer.effect.occurrenceId,
            operationIndex: writer.operationIndex,
          }),
        ),
      ),
    ),
  ].sort();
  const difference = firstCanonicalAuditDifference(
    [{ identity: 'tsk-08:published-preparation-battle-point', value: expected }],
    [{ identity: 'tsk-08:published-preparation-battle-point', value: actual }],
  );
  const failures: readonly BattlePointPreparationFailure[] = difference
    ? [
        {
          canonicalIdentity: difference.identity,
          reason: 'domainPopulationMismatch',
          checkPath: 'published.population',
          expected,
          actual,
          firstDifference: {
            ...difference,
            path: difference.path
              ? `published.population.${difference.path}`
              : 'published.population',
          },
        },
        ...gate.failures,
      ]
    : gate.failures;
  return {
    canonicalIdentity: 'tsk-08:published-preparation-battle-point',
    population: 'published-master',
    inventory,
    expected,
    actual,
    gate,
    failures,
    status:
      gate.status === 'passed' && difference === null ? ('passed' as const) : ('failed' as const),
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
