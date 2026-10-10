import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import {
  preparationBattlePointStepsFor,
  type PreparationBattlePointStep,
} from '@fgo-lab/battle-execution/preparation-audit';
import { resolveResourceTargetPolicy, npProgramEffects } from '@fgo-lab/battle-execution';
import { type MasterDataSnapshot, type MasterEffect } from '@fgo-lab/master-data';
import {
  canonicalAuditDigest,
  firstCanonicalAuditDifference,
  createCanonicalAuditValueComparison,
  assertCanonicalAuditRecords,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  battlePointPreparationCanonical,
  battlePointPreparationProgramFromCanonical,
  battlePointPreparationSource,
  auditBattlePointPreparationUse,
  type BattlePointPreparationProgram,
  type BattlePointPreparationSource,
} from './productionBattlePointPreparationAudit';
import {
  battlePointPreparationRejectionObservationFor,
  type BattlePointPreparationRejectionObservation,
} from './battlePointPreparationObservation';
import { scalarQuantitySnapshot as snapshot } from './productionScalarQuantityAudit';
import {
  captureBattlePointCapacityValue,
  battlePointCapacityCanonicalSnapshotter,
} from './productionBattlePointCapacityProof';
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';

type Operation = MasterEffect['execution'][number];
type Capacity = Extract<Operation, { kind: 'battlePointCapacityModifier' }>;
type Fixed = Extract<Operation, { kind: 'resourceMutation' }>;
const capacityWriter = (operation: Operation): operation is Capacity =>
  operation.kind === 'battlePointCapacityModifier' &&
  resolveResourceTargetPolicy('attacker', operation.recipient) === 'attacker';
const fixedWriter = (operation: Operation): operation is Fixed =>
  operation.kind === 'resourceMutation' &&
  operation.resource === 'battlePoint' &&
  operation.unit === 'fixed' &&
  operation.amount.kind === 'fixed' &&
  resolveResourceTargetPolicy('attacker', operation.recipient) === 'attacker';
/** Evidence may be incomplete even though its original producer has a complete typed contract. */
const proofFields = (value: unknown, keys: readonly string[]) =>
  value !== null &&
  typeof value === 'object' &&
  keys.every(
    (key) =>
      Reflect.has(value, key) &&
      Reflect.get(value, key) !== undefined &&
      Reflect.get(value, key) !== null,
  );

export type BattlePointCapacityFailureReason =
  | 'capacityPopulationMismatch'
  | 'capacityCanonicalMismatch'
  | 'capacityTransportMissing'
  | 'capacityIdentityMismatch'
  | 'capacityOrderMismatch'
  | 'capacityCommitMismatch'
  | 'capacityStateMismatch'
  | 'capacityUseMismatch';
export interface BattlePointCapacityFailure {
  canonicalIdentity: string;
  reason: BattlePointCapacityFailureReason;
  checkPath: string;
  expected: CanonicalAuditValue;
  actual: CanonicalAuditValue;
  firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
}
export interface BattlePointCapacityProgram {
  canonicalIdentity: string;
  downstream: BattlePointPreparationProgram<Capacity>;
}
export interface BattlePointCapacitySource {
  program: BattlePointCapacityProgram;
  downstream: BattlePointPreparationSource<Capacity>;
  capture: BattlePointPreparationRejectionObservation | undefined;
  steps: readonly (readonly PreparationBattlePointStep[] | undefined)[];
}
function view(source: BattlePointCapacitySource) {
  const d = source.downstream;
  return {
    downstream: {
      observation: d.observation,
      preparation: d.preparation,
      input: d.input,
      effects: d.effects,
      contributions: d.contributions,
      result: d.result,
      readerUses: d.readerUses,
    },
    capture: source.capture,
    steps: source.steps,
  };
}
/** Complete bounded proof: selected canonical contract and all actual consumer evidence. */
function diagnosticValue(source: BattlePointCapacitySource) {
  return {
    canonicalIdentity: source.program.canonicalIdentity,
    canonical: source.program.downstream.expected,
    ...view(source),
  };
}
/** Fresh complete observed values, including the mutable canonical contract. */
export function battlePointCapacityDiagnosticProof(source: BattlePointCapacitySource) {
  return captureBattlePointCapacityValue(diagnosticValue(source));
}

function originalReferences(source: BattlePointCapacitySource) {
  const conversion = source.downstream.preparation?.conversion;
  const target = source.downstream.observation?.targetExecution;
  const state = target?.selection === 'selected' ? target.candidateState : undefined;
  return {
    use: {
      conversion,
      value: conversion?.value,
      domain: conversion?.domain,
      parameter: conversion?.parameter,
      state: conversion?.state,
      target,
      reads: state?.battlePointPhaseReads.map((read) => ({ read })),
      nps: state?.scalarNpConsumptions.map((np) => ({
        np,
        input: np.input,
        evaluation: np.evaluation,
      })),
      events: target?.selection === 'selected' ? [...target.operationEvents] : undefined,
      effects: [...source.downstream.effects],
      contributions: [...source.downstream.contributions.contributions],
      input: source.downstream.input,
      result: source.downstream.result,
    },
    capture: source.capture,
    transitions: source.capture?.transitions.map((t) => ({
      before: t.before,
      result: t.result,
      beforePoints: t.before.battlePoints,
      resultPoints: t.result.state.battlePoints,
      attempts: t.attempts?.map((a) => ({
        attempt: a,
        start: a.start,
        native: a.native,
        returned: a.returned,
        attempted: a.attempted,
        sources: a.sources,
        writes: a.writes.map((w) => ({
          write: w,
          status: w.status,
          step: w.step,
          operationIndex: w.operationIndex,
          source: w.source,
          before: w.before,
          after: w.after,
          receipts: [...w.receipts],
        })),
      })),
    })),
    steps: source.steps.map((steps) =>
      steps?.map((step) =>
        step.kind === 'write'
          ? { step, write: step.write }
          : step.kind === 'commit'
            ? { step, before: step.before, after: step.after }
            : step.kind === 'sourceEnd'
              ? { step, source: step.source, state: step.state }
              : {
                  step,
                  before: step.before,
                  after: step.after,
                  domains: step.domains,
                  source: step.source,
                },
      ),
    ),
  };
}
const authorities = new WeakMap<
  BattlePointCapacityProgram,
  {
    identity: string;
    canonical: CanonicalAuditValue;
    owner: CanonicalAuditValue;
    references: ReturnType<typeof originalReferences>;
    downstream: BattlePointPreparationProgram<Capacity>;
    master: MasterDataSnapshot;
    scenario: PreparedCalculationScenario['scenario'];
    prepared: PreparedCalculationScenario;
    calculation: CalculationExecution;
  }
>();

export interface BattlePointCapacitySelection {
  canonicalIdentity: string;
  writers: readonly string[];
}
/** Published selected population is collected even when the product execution is not executable. */
export function battlePointCapacitySelection(
  prepared: PreparedCalculationScenario,
  evaluationIndex = 0,
): BattlePointCapacitySelection | null {
  const expected = battlePointPreparationCanonical(prepared, capacityWriter);
  if (!expected?.writers.length) return null;
  return {
    canonicalIdentity: `tsk-08:preparation-bp-capacity:${canonicalAuditDigest([{ identity: 'selected-execution', value: snapshot([expected.scenario, expected.domains, expected.actions, expected.writers, prepared.contributionPolicy, prepared.preparation, evaluationIndex]) }])}`,
    writers: expected.writers.map((w) =>
      JSON.stringify([w.sourceId, w.skillId, w.effect.occurrenceId, w.operationIndex]),
    ),
  };
}

/** Select commands/master writers before inspecting activation, receipts or successful use. */
export function battlePointCapacityPreparationProgram(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  evaluationIndex = 0,
): BattlePointCapacityProgram | null {
  if (
    prepared.scenario.mode !== 'resolved' ||
    prepared.status !== 'executable' ||
    calculation.status !== 'executable'
  )
    return null;
  const expected = battlePointPreparationCanonical(prepared, capacityWriter);
  if (!expected?.writers.length) return null;
  const downstream = battlePointPreparationProgramFromCanonical(prepared, calculation, expected);
  const selection = battlePointCapacitySelection(prepared, evaluationIndex);
  if (!selection) throw new TypeError('capacity_selection_missing');
  const canonicalIdentity = selection.canonicalIdentity;
  downstream.canonicalIdentity = canonicalIdentity;
  const program = { canonicalIdentity, downstream };
  const source = battlePointCapacityPreparationSource(program);
  const canonicalSnapshot = battlePointCapacityCanonicalSnapshotter();
  authorities.set(program, {
    identity: canonicalIdentity,
    canonical: canonicalSnapshot(expected),
    owner: canonicalSnapshot(view(source)),
    references: originalReferences(source),
    downstream,
    master: prepared.master,
    scenario: prepared.scenario,
    prepared,
    calculation,
  });
  return program;
}
export function battlePointCapacityPreparationSource(
  program: BattlePointCapacityProgram,
): BattlePointCapacitySource {
  const downstream = battlePointPreparationSource(program.downstream);
  const capture = battlePointPreparationRejectionObservationFor(program.downstream.prepared);
  return {
    program,
    downstream,
    capture,
    steps: capture?.transitions.map((t) => preparationBattlePointStepsFor(t.result)) ?? [],
  };
}

export function auditBattlePointCapacityPreparation(input: {
  expected: readonly BattlePointCapacityProgram[];
  observations: readonly BattlePointCapacitySource[];
  evidence: 'diagnostics' | 'population';
}) {
  const evidence: unknown = input.evidence;
  if (evidence !== 'population' && evidence !== 'diagnostics')
    throw new TypeError('invalid_capacity_proof_evidence');
  // Capture all observations before filtering, including unmatched and duplicate population.
  const valueProof = captureBattlePointCapacityValue(
    evidence === 'population'
      ? { expected: input.expected, observations: input.observations }
      : input.observations.map(diagnosticValue),
  );
  const snapshot = battlePointCapacityCanonicalSnapshotter();
  const compare = createCanonicalAuditValueComparison();
  const failures: BattlePointCapacityFailure[] = [];
  const check = (
    identity: string,
    reason: BattlePointCapacityFailureReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const wanted = snapshot(expected),
      observed = snapshot(actual);
    assertCanonicalAuditRecords([{ identity, value: wanted }], 'expected');
    const relative = compare(wanted, observed);
    const difference = relative ? { identity, ...relative } : null;
    if (difference)
      failures.push({
        canonicalIdentity: identity,
        reason,
        checkPath,
        expected: wanted,
        actual: observed,
        firstDifference: {
          ...difference,
          path: difference.path ? `${checkPath}.${difference.path}` : checkPath,
        },
      });
  };
  const identity = 'tsk-08:preparation-bp-capacity';
  const expectedIds = input.expected.map((p) => p.canonicalIdentity),
    actualIds = input.observations.map(
      (s) => (s as Partial<BattlePointCapacitySource>).program?.canonicalIdentity,
    );
  check(identity, 'capacityPopulationMismatch', 'population', expectedIds, actualIds);
  check(
    identity,
    'capacityPopulationMismatch',
    'population.unique',
    expectedIds.length,
    new Set(expectedIds).size,
  );
  let changedCapacityWrites = 0,
    fixedConsumers = 0,
    npConsumptions = 0;
  const boundaries: {
    canonicalIdentity: string;
    identity: string;
    kind: 'changedCapacity' | 'modifierOnly' | 'notApplicable';
  }[] = [];
  for (const program of input.expected) {
    const capacityCountAtStart = changedCapacityWrites;
    const fixedCountAtStart = fixedConsumers;
    const c = (
      reason: BattlePointCapacityFailureReason,
      path: string,
      wanted: unknown,
      actual: unknown,
    ) => check(program.canonicalIdentity, reason, path, wanted, actual);
    const authority = authorities.get(program);
    c('capacityTransportMissing', 'canonical.authority', true, !!authority);
    if (!authority) continue;
    const source = input.observations.find(
      (s) =>
        (s as Partial<BattlePointCapacitySource>).program?.canonicalIdentity ===
        program.canonicalIdentity,
    );
    c('capacityTransportMissing', 'source.present', true, !!source);
    if (!source) continue;
    c(
      'capacityIdentityMismatch',
      'canonical.program',
      true,
      source.program === program && program.downstream === authority.downstream,
    );
    c(
      'capacityCanonicalMismatch',
      'canonical.identity',
      authority.identity,
      program.canonicalIdentity,
    );
    const p = program.downstream;
    c(
      'capacityIdentityMismatch',
      'canonical.original',
      true,
      p.prepared === authority.prepared &&
        p.calculation === authority.calculation &&
        p.prepared.master === authority.master &&
        p.prepared.scenario === authority.scenario,
    );
    c(
      'capacityTransportMissing',
      'canonical.fields',
      true,
      proofFields(p.expected, ['actions', 'writers', 'domains']) &&
        Array.isArray(p.expected.actions) &&
        Array.isArray(p.expected.writers) &&
        Array.isArray(p.expected.domains),
    );
    if (
      !proofFields(p.expected, ['actions', 'writers', 'domains']) ||
      !Array.isArray(p.expected.actions) ||
      !Array.isArray(p.expected.writers) ||
      !Array.isArray(p.expected.domains)
    )
      continue;

    c(
      'capacityTransportMissing',
      'transport.use',
      true,
      proofFields(source.downstream, ['input', 'effects', 'contributions', 'result']) &&
        proofFields(source.downstream.contributions, ['contributions']),
    );
    if (
      !proofFields(source.downstream, ['input', 'effects', 'contributions', 'result']) ||
      !proofFields(source.downstream.contributions, ['contributions'])
    )
      continue;

    c('capacityCanonicalMismatch', 'canonical.contract', authority.canonical, p.expected);
    c(
      'capacityCanonicalMismatch',
      'canonical.owner',
      authority.canonical,
      battlePointPreparationCanonical(p.prepared, capacityWriter),
    );
    c(
      'capacityIdentityMismatch',
      'downstream.owner',
      true,
      source.downstream.program === p && source.downstream.calculation === p.calculation,
    );
    const capture = source.capture;
    c('capacityTransportMissing', 'transport.capture', true, !!capture);
    c(
      'capacityIdentityMismatch',
      'transport.references',
      true,
      capture === authority.references.capture &&
        capture === battlePointPreparationRejectionObservationFor(p.prepared) &&
        capture === battlePointPreparationRejectionObservationFor(p.calculation) &&
        capture === battlePointPreparationRejectionObservationFor(source.downstream.result),
    );
    const ordered = p.prepared.orderedScenario;
    c(
      'capacityTransportMissing',
      'transport.ordered',
      true,
      proofFields(preparationExecutionStateFor(ordered), ['battlePoints']) &&
        capture?.orderedScenario === ordered &&
        proofFields(capture, ['orderedExecution']),
    );
    c(
      'capacityTransportMissing',
      'transport.observation',
      true,
      !!source.downstream.observation && !!source.downstream.preparation,
    );
    c(
      'capacityIdentityMismatch',
      'transport.execution',
      true,
      source.downstream.observation === p.prepared.executionObservation &&
        source.downstream.observation === p.calculation.executionObservation,
    );
    const target = source.downstream.observation?.targetExecution;
    const original = authority.references.use;
    const conversion = source.downstream.preparation?.conversion;
    c(
      'capacityIdentityMismatch',
      'conversion.original',
      true,
      conversion === original.conversion &&
        conversion?.value === original.value &&
        conversion?.domain === original.domain &&
        conversion?.parameter === original.parameter &&
        conversion?.state === original.state,
    );
    c(
      'capacityIdentityMismatch',
      'use.original',
      true,
      source.downstream.input === original.input &&
        source.downstream.result === original.result &&
        target === original.target &&
        source.downstream.effects.every((e, i) => e === original.effects[i]) &&
        source.downstream.contributions.contributions.every(
          (e, i) => e === original.contributions[i],
        ),
    );
    if (target?.selection === 'selected') {
      c(
        'capacityIdentityMismatch',
        'events.original',
        true,
        target.operationEvents.every((e, i) => e === original.events?.[i]),
      );
      for (const [i, read] of (target.candidateState?.battlePointPhaseReads ?? []).entries())
        c(
          'capacityIdentityMismatch',
          `read.${i}.original`,
          true,
          read === original.reads?.[i]?.read,
        );
      for (const [i, np] of (target.candidateState?.scalarNpConsumptions ?? []).entries()) {
        const saved = original.nps?.[i];
        c(
          'capacityIdentityMismatch',
          `np.${i}.original`,
          true,
          !!saved &&
            np === saved.np &&
            np.input === saved.input &&
            np.evaluation === saved.evaluation,
        );
      }
    }

    c('capacityUseMismatch', 'execution.selection', 'selected', target?.selection);
    c(
      'capacityTransportMissing',
      'execution.state',
      true,
      target?.selection === 'selected' && !!target.candidateState,
    );
    c(
      'capacityTransportMissing',
      'execution.evidence',
      true,
      target?.selection === 'selected' &&
        proofFields(target.candidateState, [
          'executionGroups',
          'battlePointPhaseReads',
          'scalarNpConsumptions',
        ]) &&
        target.candidateState?.scalarNpConsumptions.every((np) =>
          proofFields(np, ['input', 'evaluation']),
        ),
    );
    if (
      target?.selection === 'selected' &&
      (!proofFields(target.candidateState, [
        'executionGroups',
        'battlePointPhaseReads',
        'scalarNpConsumptions',
      ]) ||
        !target.candidateState?.scalarNpConsumptions.every((np) =>
          proofFields(np, ['input', 'evaluation']),
        ))
    )
      continue;
    if (target?.selection === 'selected' && target.candidateState) {
      c(
        'capacityOrderMismatch',
        'execution.groups',
        p.expected.groups,
        target.candidateState.executionGroups.map(
          ({ groupIndex, transactionIdentity, operationIds }) => ({
            groupIndex,
            transactionIdentity,
            operationIds,
          }),
        ),
      );
      c(
        'capacityCommitMismatch',
        'execution.commits',
        p.expected.groups.map(() => ['committed', [], null]),
        target.candidateState.executionGroups.map((g) => [g.outcome, g.issues, g.rollbackProof]),
      );
    }
    c(
      'capacityPopulationMismatch',
      'canonical.writerPopulation',
      true,
      p.expected.writers.length > 0,
    );
    c(
      'capacityCanonicalMismatch',
      'preparation.commands',
      p.expected.actions.map((a) => a.command),
      capture?.transitions.map((t) => (proofFields(t, ['command']) ? t.command : undefined)),
    );
    c(
      'capacityCommitMismatch',
      'preparation.actions',
      p.expected.actions.map((a) => a.command),
      ordered?.appliedPreparationActions.map((a) => a.command),
    );
    c(
      'capacityPopulationMismatch',
      'transport.stepPopulation',
      p.expected.actions.length,
      source.steps.length,
    );
    if (!capture || !ordered) continue;
    for (const [index, action] of p.expected.actions.entries()) {
      const path = `action.${index}`,
        t = capture.transitions[index],
        saved = authority.references.transitions?.[index];
      c('capacityTransportMissing', `${path}.transition`, true, !!t);
      if (!t) continue;
      c(
        'capacityTransportMissing',
        `${path}.state`,
        true,
        proofFields(t, ['before', 'result']) &&
          proofFields(t.before, ['battlePoints', 'appliedActions']) &&
          proofFields(t.result, ['state']) &&
          proofFields(t.result.state, ['battlePoints', 'appliedActions']),
      );
      if (
        !proofFields(t, ['before', 'result']) ||
        !proofFields(t.before, ['battlePoints', 'appliedActions']) ||
        !proofFields(t.result, ['state']) ||
        !proofFields(t.result.state, ['battlePoints', 'appliedActions'])
      )
        continue;
      c(
        'capacityIdentityMismatch',
        `${path}.references`,
        true,
        t.before === saved?.before &&
          t.result === saved.result &&
          t.before.battlePoints === saved.beforePoints &&
          t.result.state.battlePoints === saved.resultPoints,
      );
      c('capacityCommitMismatch', `${path}.status`, 'applied', t.result.status);
      c('capacityOrderMismatch', `${path}.index`, index, t.before.appliedActions.length);
      if (index > 0)
        c(
          'capacityIdentityMismatch',
          `${path}.start`,
          true,
          t.before.battlePoints === capture.transitions[index - 1]?.result.state.battlePoints,
        );
      c(
        'capacityCommitMismatch',
        `${path}.appliedReference`,
        true,
        t.result.state.appliedActions[index] === ordered.appliedPreparationActions[index],
      );
      const expectedWrites = action.effects.flatMap((effect) =>
        effect.execution.flatMap((operation, operationIndex) =>
          capacityWriter(operation) || fixedWriter(operation)
            ? [{ effect, operation, operationIndex }]
            : [],
        ),
      );
      const skillAttempt = action.skillId
        ? t.attempts?.find((a) => a.actionId === action.actionId)
        : undefined;
      if (action.skillId) {
        c('capacityTransportMissing', `${path}.attempt`, true, !!skillAttempt);
        c(
          'capacityCanonicalMismatch',
          `${path}.sources`,
          action.effects,
          skillAttempt?.sources.map((s) => s.effect),
        );
        c(
          'capacityCanonicalMismatch',
          `${path}.skill`,
          action.skillId,
          t.result.state.appliedActions[index]?.sourceId,
        );
      }
      if (skillAttempt) {
        const a = skillAttempt,
          aSaved = saved?.attempts?.find((x) => x.attempt === a);
        c(
          'capacityIdentityMismatch',
          `${path}.attemptReferences`,
          true,
          !!aSaved &&
            a.start === aSaved.start &&
            a.native === aSaved.native &&
            a.returned === aSaved.returned &&
            a.attempted === aSaved.attempted &&
            a.sources === aSaved.sources,
        );
        c(
          'capacityIdentityMismatch',
          `${path}.actionStart`,
          true,
          a.start.battlePoints === t.before.battlePoints,
        );
        c('capacityCommitMismatch', `${path}.native`, 'committed', a.native?.status);
        c(
          'capacityCommitMismatch',
          `${path}.returned`,
          true,
          !!a.returned && a.returned.battlePoints === a.attempted,
        );
        c(
          'capacityPopulationMismatch',
          `${path}.writes`,
          expectedWrites.map((w) => [w.effect.occurrenceId, w.operationIndex]),
          a.writes.map((w) => [w.source.effect.occurrenceId, w.operationIndex]),
        );
        for (const [i, wanted] of expectedWrites.entries()) {
          const wp = `${path}.write.${i}`,
            w = a.writes[i];
          c('capacityTransportMissing', `${wp}.present`, true, !!w);
          if (!w) continue;
          const original = aSaved?.writes[i];
          c('capacityCommitMismatch', `${wp}.originalStatus`, original?.status, w.status);
          c(
            'capacityTransportMissing',
            `${wp}.states`,
            true,
            proofFields(w, ['before', 'after', 'receipts']) &&
              proofFields(w.before, ['actors']) &&
              proofFields(w.after, ['actors']),
          );
          if (
            !proofFields(w, ['before', 'after', 'receipts']) ||
            !proofFields(w.before, ['actors']) ||
            !proofFields(w.after, ['actors'])
          )
            continue;

          c(
            'capacityIdentityMismatch',
            `${wp}.references`,
            true,
            w === original?.write &&
              w.source === original.source &&
              w.before === original.before &&
              w.after === original.after &&
              w.receipts.every((r, j) => r === original.receipts[j]),
          );
          c(
            'capacityCanonicalMismatch',
            `${wp}.source`,
            [
              'attacker',
              `attacker:${p.expected.scenario.attacker.servantId}`,
              p.expected.scenario.attacker.servantId,
              action.skillId,
              wanted.effect,
            ],
            [
              w.source.origin,
              w.source.sourceInstanceId,
              w.source.sourceId,
              w.source.skillId,
              w.source.effect,
            ],
          );
          c(
            'capacityCanonicalMismatch',
            `${wp}.indexes`,
            [0, action.command.kind === 'useSkillSlot' ? action.command.skillLevel - 1 : null],
            [w.source.valueSetIndex, w.source.valueIndex],
          );
          c(
            'capacityCanonicalMismatch',
            `${wp}.operation`,
            wanted.operation,
            w.source.effect.execution[w.operationIndex],
          );
          c(
            'capacityOrderMismatch',
            `${wp}.step`,
            true,
            a.stepOrigins.some(
              (o) =>
                o.index === w.step &&
                o.source === w.source &&
                o.operationIndex === w.operationIndex,
            ) && a.reached.some((r) => r.index === w.step),
          );
          c(
            'capacityCommitMismatch',
            `${wp}.status`,
            true,
            w.status === 'applied' || w.status === 'notApplicable',
          );
          c(
            'capacityStateMismatch',
            `${wp}.receiptAppend`,
            [...w.before.receipts, ...w.receipts],
            w.after.receipts,
          );
          const before = w.before.actors.attacker?.domains[wanted.operation.subjectId!];
          const receipt = w.receipts[0];
          const applies =
            w.status === 'applied' &&
            (before?.kind === 'present' ||
              (wanted.operation.kind === 'resourceMutation' &&
                before?.kind === 'absent' &&
                before.eligible));
          c('capacityPopulationMismatch', `${wp}.receiptCount`, applies ? 1 : 0, w.receipts.length);
          const receiptId = JSON.stringify([
            action.actionId,
            w.source.sourceInstanceId,
            wanted.effect.occurrenceId,
            wanted.operationIndex,
          ]);
          if (receipt) {
            c(
              'capacityCanonicalMismatch',
              `${wp}.identity`,
              [receiptId, 'attacker', wanted.operation.subjectId],
              [receipt.identity, receipt.actor, receipt.domainId],
            );
            c(
              'capacityIdentityMismatch',
              `${wp}.receiptState`,
              true,
              receipt.before === before &&
                receipt.after === w.after.actors.attacker?.domains[wanted.operation.subjectId!],
            );
          }
          if (wanted.operation.kind === 'battlePointCapacityModifier') {
            const after = receipt?.after;
            if (before?.kind === 'present' && after?.kind === 'present' && w.status === 'applied') {
              const amount = wanted.operation.values[w.source.valueSetIndex]?.[w.source.valueIndex];
              c(
                'capacityStateMismatch',
                `${wp}.modifiers`,
                [
                  ...before.capacityModifiers,
                  {
                    identity: receiptId,
                    amount,
                    lifetime: wanted.operation.lifetime,
                    traits: wanted.operation.traits,
                  },
                ],
                after.capacityModifiers,
              );
              const changed = before.capacity !== after.capacity;
              if (changed) changedCapacityWrites++;
              boundaries.push({
                canonicalIdentity: program.canonicalIdentity,
                identity: receiptId,
                kind: changed ? 'changedCapacity' : 'modifierOnly',
              });
            } else
              boundaries.push({
                canonicalIdentity: program.canonicalIdentity,
                identity: receiptId,
                kind: 'notApplicable',
              });
          } else {
            if (receipt && before?.kind === 'present' && receipt.after.kind === 'present') {
              c(
                'capacityStateMismatch',
                `${wp}.fixedCapacity`,
                [before.capacity, before.capacityModifiers],
                [receipt.after.capacity, receipt.after.capacityModifiers],
              );
              const preceding = p.expected.writers.filter(
                (writer) =>
                  writer.domainId === wanted.operation.subjectId &&
                  (writer.actionIndex < index ||
                    (writer.actionIndex === index &&
                      (action.effects.indexOf(writer.effect) <
                        action.effects.indexOf(wanted.effect) ||
                        (writer.effect === wanted.effect &&
                          writer.operationIndex < wanted.operationIndex)))),
              );
              if (
                before.capacityModifiers.some((modifier) =>
                  preceding.some((writer) => writer.identity === modifier.identity),
                )
              )
                fixedConsumers++;
            }
          }
          if (receipt)
            c(
              'capacityCommitMismatch',
              `${wp}.executed`,
              true,
              (
                a.returned?.battlePoints as { executedEffects?: readonly string[] } | undefined
              )?.executedEffects?.includes(
                JSON.stringify([
                  'attacker',
                  w.source.sourceInstanceId,
                  action.skillId,
                  wanted.effect.occurrenceId,
                ]),
              ),
            );
        }
      }
      const steps = source.steps[index],
        savedSteps = authority.references.steps[index];
      c('capacityTransportMissing', `${path}.steps`, true, !!steps);
      if (!steps) continue;
      c(
        'capacityIdentityMismatch',
        `${path}.stepTransport`,
        true,
        steps === preparationBattlePointStepsFor(t.result),
      );
      let cursor = t.before.battlePoints;
      for (const [i, step] of steps.entries()) {
        const sp = `${path}.step.${i}`,
          ref = savedSteps?.[i];
        c('capacityIdentityMismatch', `${sp}.reference`, true, step === ref?.step);
        if (step.kind === 'reconcile')
          c(
            'capacityIdentityMismatch',
            `${sp}.original`,
            true,
            !!ref &&
              'domains' in ref &&
              step.before === ref.before &&
              step.after === ref.after &&
              step.domains === ref.domains &&
              step.source === ref.source,
          );
        else if (step.kind === 'sourceEnd')
          c(
            'capacityIdentityMismatch',
            `${sp}.original`,
            true,
            !!ref && 'state' in ref && step.state === ref.state && step.source === ref.source,
          );
        else if (step.kind === 'commit')
          c(
            'capacityIdentityMismatch',
            `${sp}.original`,
            true,
            !!ref && 'before' in ref && step.before === ref.before && step.after === ref.after,
          );
        if (step.kind === 'write') {
          c(
            'capacityTransportMissing',
            `${sp}.states`,
            true,
            proofFields(step.write, ['before', 'after']),
          );
          if (!proofFields(step.write, ['before', 'after'])) continue;

          c(
            'capacityIdentityMismatch',
            `${sp}.write`,
            true,
            t.attempts?.some((a) => a.actionId === step.actionId && a.writes.includes(step.write)),
          );
          c('capacityOrderMismatch', `${sp}.before`, true, step.write.before === cursor);
          cursor = step.write.after;
        } else if (step.kind === 'reconcile') {
          c(
            'capacityCanonicalMismatch',
            `${sp}.domains`,
            p.expected.domains.filter((d) => ordered.battlePointDomains.some((x) => x.id === d.id)),
            step.domains,
          );
          c('capacityOrderMismatch', `${sp}.before`, true, step.before.battlePoints === cursor);
          c(
            'capacityStateMismatch',
            `${sp}.receipts`,
            cursor.receipts,
            step.after.battlePoints.receipts,
          );
          c(
            'capacityStateMismatch',
            `${sp}.modifierRetention`,
            Object.entries(cursor.actors).map(([actor, a]) => [
              actor,
              Object.entries(a.domains).map(([domain, v]) => [
                domain,
                v.kind === 'present' ? v.capacityModifiers : null,
              ]),
            ]),
            Object.entries(step.after.battlePoints.actors).map(([actor, a]) => [
              actor,
              Object.entries(a.domains).map(([domain, v]) => [
                domain,
                v.kind === 'present' ? v.capacityModifiers : null,
              ]),
            ]),
          );
          cursor = step.after.battlePoints;
        } else if (step.kind === 'commit') {
          c('capacityOrderMismatch', `${sp}.before`, true, step.before === cursor);
          c(
            'capacityCommitMismatch',
            `${sp}.native`,
            true,
            t.attempts?.some(
              (a) =>
                a.actionId === step.actionId &&
                a.native?.status === 'committed' &&
                a.returned?.battlePoints === step.after,
            ),
          );
          c(
            'capacityStateMismatch',
            `${sp}.retained`,
            true,
            step.before.actors === step.after.actors &&
              step.before.receipts === step.after.receipts,
          );
          cursor = step.after;
        } else c('capacityOrderMismatch', `${sp}.sourceEnd`, true, step.state === cursor);
      }
      c(
        'capacityStateMismatch',
        `${path}.retained`,
        [cursor.actors, cursor.receipts],
        [t.result.state.battlePoints.actors, t.result.state.battlePoints.receipts],
      );
      c(
        'capacityPopulationMismatch',
        `${path}.stepWrites`,
        t.attempts?.flatMap((a) => a.writes),
        steps.flatMap((s) => (s.kind === 'write' ? [s.write] : [])),
      );
      if (action.skillId)
        c(
          'capacityIdentityMismatch',
          `${path}.reducer`,
          true,
          steps.at(-1)?.kind === 'reconcile' &&
            (steps.at(-1) as Extract<PreparationBattlePointStep, { kind: 'reconcile' }>).owner ===
              'reducer' &&
            (steps.at(-1) as Extract<PreparationBattlePointStep, { kind: 'reconcile' }>).after
              .battlePoints === t.result.state.battlePoints,
        );
    }
    if (changedCapacityWrites > capacityCountAtStart)
      c('capacityPopulationMismatch', 'consumer.fixed', true, fixedConsumers > fixedCountAtStart);
    c(
      'capacityStateMismatch',
      'preparation.final',
      capture.transitions.at(-1)?.result.state.battlePoints,
      preparationExecutionStateFor(ordered)?.battlePoints,
    );
    for (const writer of p.expected.writers) {
      const operations = ordered.operations.filter(
        (o) =>
          o.source.origin === 'attacker' &&
          o.source.sourceInstanceId === writer.sourceInstanceId &&
          o.source.skillId === writer.skillId &&
          o.source.effectOccurrenceId === writer.effect.occurrenceId,
      );
      // A mixed source may retain fixed evidence or real readers, never a capacity damage writer.
      c(
        'capacityUseMismatch',
        `writer.${writer.identity}.orderedWrites`,
        [],
        operations.filter((o) => o.kind === 'resourceMutation' || o.kind === 'addQuantity'),
      );
      const fakeProjections = source.downstream.effects.filter(
        (e) =>
          e.source.origin === 'attacker' &&
          e.source.sourceInstanceId === writer.sourceInstanceId &&
          e.source.skillId === writer.skillId &&
          e.source.effectOccurrenceId === writer.effect.occurrenceId &&
          !ordered.operations.some((o) => o.operationId === e.operationId) &&
          e.explanation.code !== 'stateMutationOnly',
      );
      c('capacityUseMismatch', `writer.${writer.identity}.projections`, [], fakeProjections);
      c(
        'capacityUseMismatch',
        `writer.${writer.identity}.contributions`,
        [],
        source.downstream.contributions.contributions.filter(
          (e) =>
            e.source.origin === 'attacker' &&
            e.source.sourceInstanceId === writer.sourceInstanceId &&
            e.source.skillId === writer.skillId &&
            e.source.effectOccurrenceId === writer.effect.occurrenceId &&
            !ordered.operations.some(
              (o) =>
                o.operationId === e.operationId &&
                (o.kind === 'addModifier' || o.kind === 'executeNpDamage'),
            ),
        ),
      );
    }
    npConsumptions += auditBattlePointPreparationUse(
      p,
      source.downstream,
      (_reason, path, wanted, actual) => c('capacityUseMismatch', path, wanted, actual),
    );
    const current = view(source);
    for (const key of ['downstream', 'capture', 'steps'] as const)
      c(
        'capacityStateMismatch',
        `owner.${key}`,
        (authority.owner as Record<string, CanonicalAuditValue>)[key],
        current[key],
      );
  }
  return {
    valueProof,
    gate: {
      canonicalIdentity: identity,
      status: failures.length ? ('failed' as const) : ('passed' as const),
      expected: expectedIds,
      actual: actualIds,
      failures,
      firstDifference: failures[0]?.firstDifference ?? null,
      changedCapacityWrites,
      fixedConsumers,
      npConsumptions,
      boundaries,
    },
  };
}

export function battlePointCapacityCanonicalInventory(master: MasterDataSnapshot) {
  const declarations = master.servants.flatMap((servant) =>
    servant.skills.flatMap((skill) =>
      npProgramEffects(skill.effects).flatMap((effect) =>
        effect.execution.flatMap((operation, operationIndex) =>
          capacityWriter(operation)
            ? [
                {
                  ownerId: servant.id,
                  skillId: skill.id,
                  slot: skill.slot,
                  occurrenceId: effect.occurrenceId,
                  operationIndex,
                  operation,
                },
              ]
            : [],
        ),
      ),
    ),
  );
  const excludedNp = master.servants.flatMap((servant) =>
    servant.noblePhantasmVariantGroups.flatMap((group) =>
      group.variants.flatMap((variant) =>
        variant.effects.flatMap((effect) =>
          effect.execution.flatMap((operation, operationIndex) =>
            operation.kind === 'battlePointCapacityModifier'
              ? [
                  {
                    ownerId: servant.id,
                    variant: variant.ref,
                    occurrenceId: effect.occurrenceId,
                    operationIndex,
                    operation,
                  },
                ]
              : [],
          ),
        ),
      ),
    ),
  );
  return { declarations, excludedNp };
}
export function auditPublishedBattlePointCapacityPreparation(
  master: MasterDataSnapshot,
  programs: readonly BattlePointCapacityProgram[],
  observations: readonly BattlePointCapacitySource[],
  expectedSelections: readonly BattlePointCapacitySelection[],
) {
  const inventory = battlePointCapacityCanonicalInventory(master),
    gate = auditBattlePointCapacityPreparation({
      expected: programs,
      observations,
      evidence: 'diagnostics',
    }).gate;
  const member = (x: {
    ownerId: string;
    skillId: string;
    occurrenceId: string;
    operationIndex: number;
  }) => JSON.stringify([x.ownerId, x.skillId, x.occurrenceId, x.operationIndex]);
  const declared = new Set(inventory.declarations.map(member));
  const selected = programs.flatMap((p) =>
    p.downstream.expected.writers.map((w) =>
      member({
        ownerId: w.sourceId,
        skillId: w.skillId,
        occurrenceId: w.effect.occurrenceId,
        operationIndex: w.operationIndex,
      }),
    ),
  );
  const populationDifference = firstCanonicalAuditDifference(
    [
      {
        identity: 'tsk-08:published-bp-capacity',
        value: expectedSelections.map((s) => [s.canonicalIdentity, s.writers]),
      },
    ],
    [
      {
        identity: 'tsk-08:published-bp-capacity',
        value: programs.map((p) => [
          p.canonicalIdentity,
          p.downstream.expected.writers.map((w) =>
            member({
              ownerId: w.sourceId,
              skillId: w.skillId,
              occurrenceId: w.effect.occurrenceId,
              operationIndex: w.operationIndex,
            }),
          ),
        ]),
      },
    ],
  );
  const difference = firstCanonicalAuditDifference(
    [{ identity: 'tsk-08:published-bp-capacity', value: [] }],
    [{ identity: 'tsk-08:published-bp-capacity', value: selected.filter((x) => !declared.has(x)) }],
  );
  const failures: BattlePointCapacityFailure[] = [...gate.failures];
  if (populationDifference)
    failures.push({
      canonicalIdentity: 'tsk-08:published-bp-capacity',
      reason: 'capacityPopulationMismatch',
      checkPath: 'published.selected',
      expected: snapshot(expectedSelections.map((s) => [s.canonicalIdentity, s.writers])),
      actual: snapshot(programs.map((p) => p.canonicalIdentity)),
      firstDifference: {
        ...populationDifference,
        path: `published.selected.${populationDifference.path}`,
      },
    });
  if (difference)
    failures.push({
      canonicalIdentity: 'tsk-08:published-bp-capacity',
      reason: 'capacityPopulationMismatch',
      checkPath: 'published.population',
      expected: [],
      actual: selected.filter((x) => !declared.has(x)),
      firstDifference: { ...difference, path: 'published.population' },
    });
  return {
    canonicalIdentity: 'tsk-08:published-bp-capacity',
    inventory,
    expectedSelections,
    selected,
    gate,
    status: failures.length ? ('failed' as const) : ('passed' as const),
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
