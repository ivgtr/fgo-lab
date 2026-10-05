import { preparationExecutionStateFor } from '@fgo-lab/battle-execution';
import {
  getNoblePhantasmVariants,
  type MasterDataSnapshot,
  type MasterEffect,
} from '@fgo-lab/master-data';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import {
  hpPreparationCanonicalFor,
  hpPreparationSource,
  type HpPreparationSelection,
} from './productionHpPreparationAudit';
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';

/** Preserve container and absence distinctions in audit comparisons. */
function snapshot(value: unknown): CanonicalAuditValue {
  if (value === undefined) return { type: 'undefined' };
  if (value instanceof Map)
    return {
      type: 'map',
      entries: [...value].map(([key, item]) => [snapshot(key), snapshot(item)]),
    };
  if (value instanceof Set) return { type: 'set', values: [...value].map(snapshot) };
  if (Array.isArray(value)) return { type: 'array', values: value.map(snapshot) };
  if (value !== null && typeof value === 'object')
    return {
      type: 'object',
      fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)])),
    };
  return { type: typeof value, value: value as CanonicalAuditValue };
}

type Give = Extract<MasterEffect['execution'][number], { kind: 'hpModifier' }>;
/** Selection is canonical, before activation, native success or receipt filtering. */
export function isGiveSelf(operation: MasterEffect['execution'][number]): operation is Give {
  return (
    operation.kind === 'hpModifier' &&
    operation.action === 'give' &&
    operation.lifetime === 'active' &&
    operation.route.target === 'sourceSelf' &&
    (operation.selection === undefined || operation.selection === 'direct')
  );
}
export function isGiveFixedGain(operation: MasterEffect['execution'][number]) {
  return (
    operation.kind === 'resourceMutation' &&
    operation.resource === 'hp' &&
    operation.direction === 'gain' &&
    operation.unit === 'fixed' &&
    operation.amount.kind === 'fixed' &&
    (operation.recipient === 'sourceSelf' || operation.recipient === 'partyMember') &&
    (operation.selection === undefined || operation.selection === 'direct')
  );
}
export function giveCanonical(prepared: PreparedCalculationScenario) {
  const canonical = hpPreparationCanonicalFor(
    prepared,
    isGiveSelf,
    (operation) =>
      operation.kind === 'removeHpModifiers' ||
      (operation.kind === 'hpModifier' && !isGiveSelf(operation)),
    isGiveFixedGain,
  );
  if (!canonical) return null;
  // Flatten command/effect/operation order once. Consumers can be in a different skill/action.
  const ordered = canonical.actions.flatMap((action) =>
    action.effects.flatMap((effect) =>
      effect.execution.map((operation, operationIndex) => ({
        actionIndex: action.index,
        actionId: action.actionId,
        skillId: action.skillId,
        effect,
        operation,
        operationIndex,
        valueSetIndex: 0,
        valueIndex: action.command.kind === 'useSkillSlot' ? action.command.skillLevel - 1 : -1,
      })),
    ),
  );
  const consumers = ordered.flatMap((entry, sequence) =>
    isGiveFixedGain(entry.operation)
      ? [
          {
            ...entry,
            sequence,
            writers: canonical.writers.filter((writer) => {
              const index = ordered.findIndex(
                (candidate) =>
                  candidate.actionIndex === writer.actionIndex &&
                  candidate.effect === writer.effect &&
                  candidate.operationIndex === writer.operationIndex,
              );
              return index >= 0 && index < sequence;
            }),
          },
        ]
      : [],
  );
  return { ...canonical, consumers };
}
export interface GiveRequest {
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
}
export function giveSelection(request: GiveRequest, index = 0) {
  const canonical = giveCanonical(request.prepared);
  return canonical
    ? {
        ...request,
        index,
        canonical,
        identity: `hpGive:${index}:${JSON.stringify(canonical.writers.map((writer) => [writer.sourceId, writer.form, writer.actionId, writer.skillId, writer.effect.occurrenceId, writer.operationIndex]))}`,
      }
    : null;
}
type Selection = NonNullable<ReturnType<typeof giveSelection>>;
export function giveSource(selection: Selection) {
  return {
    ...hpPreparationSource(selection satisfies HpPreparationSelection<Give>),
    canonical: selection.canonical,
  };
}
export type GiveSource = ReturnType<typeof giveSource>;
/** Complete focused values, no master copy and no decode in the gate. */
export function giveDiagnostic(source: GiveSource): Record<string, unknown> {
  const actor = source.master.servants.find((servant) => servant.id === source.canonical.servantId);
  return {
    identity: source.identity,
    canonical: source.canonical,
    governingInput: {
      masterVersion: source.master.version,
      actor: actor && {
        id: actor.id,
        hpByLevel: actor.hpByLevel,
        actorFormGraph: actor.actorFormGraph,
      },
      selectedNp: source.selection.prepared.resolved.noblePhantasmVariant,
    },
    transitions: source.transitions?.map((transition) => ({
      command: transition.command,
      before: transition.before.hp,
      status: transition.result.status,
      returned: transition.result.state.hp,
      actions: transition.hpActions?.map((action) => ({
        actionId: action.actionId,
        start: action.start.hp,
        sourceOrder: action.sources.map((s) => [
          s.sourceInstanceId,
          s.skillId,
          s.effect.occurrenceId,
        ]),
        writes: action.giveWrites,
        gains: action.giveGains,
        consumptions: action.giveConsumptions,
        sourceEnds: action.sourceEnds.map((end) => ({
          occurrenceId: end.source.effect.occurrenceId,
          before: end.before.hp,
          after: end.after.hp,
        })),
        commitStart: action.commitStartHp,
        native: action.native,
        attempted: action.attempted?.hp,
        returned: action.returned?.hp,
      })),
    })),
    rejection: source.transport?.rejection,
    preparedStatus: source.selection.prepared.status,
    calculationStatus: source.calculation.status,
    orderedHp: preparationExecutionStateFor(source.ordered)?.hp,
    candidate: source.candidate,
    uses: source.uses,
    input: source.input,
    effects: source.effects,
    contributions: source.contributions,
    result: source.result,
  };
}
/** Reference anchors are borrowed, while the proof is materialized once per original execution. */
function anchors(source: GiveSource): unknown[] {
  return [
    source.selection.prepared,
    source.calculation,
    source.master,
    source.scenario,
    source.transport,
    source.ordered,
    source.observation,
    source.candidate,
    source.input,
    source.effects,
    source.contributions,
    source.result,
    ...(source.transitions?.flatMap((t) => [
      t.before,
      t.result,
      ...(t.hpActions?.flatMap((a) => [
        a.start,
        a.native,
        a.returned,
        a.commitStartHp,
        ...(a.giveWrites?.flatMap((w) => [
          w.source,
          w.operation,
          w.before,
          w.after,
          ...w.modifiers,
          ...w.receipts,
        ]) ?? []),
        ...(a.giveConsumptions?.flatMap((r) => [
          r.source,
          r.consumption.before,
          r.consumption.modifierState,
          ...r.consumption.give.instances,
          ...r.consumption.receive.instances,
          r.consumption.result,
        ]) ?? []),
        ...(a.giveGains?.flatMap((w) => [w.source, w.before, w.after, ...w.receipts]) ?? []),
      ]) ?? []),
    ]) ?? []),
    ...(source.candidate?.reads.map((r) => r.state) ?? []),
    ...(source.candidate?.nps.flatMap((n) => [n.state, n.context, n.evaluation, n.input]) ?? []),
    ...source.uses.flatMap((u) => [...u.events, ...u.projections, ...u.contributions]),
  ];
}
export interface GiveProgram {
  selection: Selection;
}
const authorities = new WeakMap<
  GiveProgram,
  { proof: ReturnType<typeof giveDiagnostic>; references: unknown[] }
>();
export function giveProgram(selection: Selection): GiveProgram {
  const source = giveSource(selection),
    program = { selection };
  authorities.set(program, {
    proof: structuredClone(giveDiagnostic(source)),
    references: anchors(source),
  });
  return program;
}
export type GiveReason =
  | 'givePopulationMismatch'
  | 'giveCanonicalMismatch'
  | 'giveIdentityMismatch'
  | 'giveWriteMismatch'
  | 'giveConsumptionMismatch'
  | 'giveRetainedMismatch'
  | 'giveReaderMismatch'
  | 'giveNpMismatch'
  | 'giveUseMismatch'
  | 'giveProofMismatch'
  | 'giveTraceMissing';
export function auditGive(input: {
  requests: readonly GiveRequest[];
  expected: readonly GiveProgram[];
  observations: readonly GiveSource[];
}) {
  const checks: {
    identity: string;
    reason: GiveReason;
    path: string;
    expected: ReturnType<typeof snapshot>;
    actual: ReturnType<typeof snapshot>;
  }[] = [];
  const failures: ((typeof checks)[number] & {
    firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
  })[] = [];
  const boundaries: { identity: string; reason: string }[] = [];
  const check = (
    identity: string,
    reason: GiveReason,
    path: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const record = {
      identity,
      reason,
      path,
      expected: snapshot(expected),
      actual: snapshot(actual),
    };
    checks.push(record);
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: record.expected }],
      [{ identity, value: record.actual }],
    );
    if (difference)
      failures.push({
        ...record,
        firstDifference: { ...difference, path: `${path}.${difference.path}` },
      });
  };
  const selected = input.requests.filter((request) => giveCanonical(request.prepared) !== null);
  check(
    'hpGive:population',
    'givePopulationMismatch',
    'requests',
    selected.length,
    input.expected.length,
  );
  check(
    'hpGive:population',
    'givePopulationMismatch',
    'requestOwners',
    selected.map((r) => input.expected.filter((p) => p.selection.prepared === r.prepared).length),
    selected.map(() => 1),
  );
  check(
    'hpGive:population',
    'givePopulationMismatch',
    'uniqueRequests',
    selected.length,
    new Set(selected.map((r) => r.prepared)).size,
  );
  check(
    'hpGive:population',
    'givePopulationMismatch',
    'uniquePrograms',
    input.expected.length,
    new Set(input.expected.map((p) => p.selection.identity)).size,
  );
  check(
    'hpGive:population',
    'givePopulationMismatch',
    'observations',
    input.expected.map((p) => p.selection.identity),
    input.observations.map((s) => s.identity),
  );
  let reached = 0,
    committed = 0,
    rejected = 0,
    excluded = 0,
    gainConsumed = 0,
    changed = 0,
    readers = 0,
    nps = 0,
    connected = 0;
  for (const [index, program] of input.expected.entries()) {
    const source = input.observations[index],
      authority = authorities.get(program),
      identity = program.selection.identity;
    const c = (reason: GiveReason, path: string, expected: unknown, actual: unknown) =>
      check(identity, reason, path, expected, actual);
    const boundary = (reason: string) => boundaries.push({ identity, reason });
    c('giveTraceMissing', 'authority/source', [true, true], [!!authority, !!source]);
    if (!source || !authority) continue;
    c(
      'giveCanonicalMismatch',
      'canonical',
      authority.proof.canonical,
      giveCanonical(source.selection.prepared),
    );
    c('giveCanonicalMismatch', 'selectedCanonical', authority.proof.canonical, source.canonical);
    c(
      'giveIdentityMismatch',
      'requestCalculation',
      true,
      selected.some(
        (r) => r.prepared === source.selection.prepared && r.calculation === source.calculation,
      ),
    );
    const refs = anchors(source);
    c(
      'giveIdentityMismatch',
      'references',
      authority.references.map(() => true),
      refs.map((ref, i) => ref === authority.references[i]),
    );
    // Each section is compared once, retaining a complete first-difference and no proof decode.
    const diagnostic = giveDiagnostic(source);
    for (const key of Object.keys(authority.proof))
      c('giveProofMismatch', `proof.${key}`, authority.proof[key], diagnostic[key]);
    for (const reason of source.canonical.scopeBoundaries) boundary(`scope:${reason}`);
    c('giveTraceMissing', 'transport', true, !!source.transport);
    c(
      'giveTraceMissing',
      'actionCapture',
      true,
      source.transitions?.every((t) => t.hpActions !== undefined),
    );
    const actions = source.transitions?.flatMap((transition) => transition.hpActions ?? []) ?? [];
    c(
      'giveIdentityMismatch',
      'actionCommands',
      source.transitions?.map((t) => t.command),
      source.canonical.actions.slice(0, source.transitions?.length).map((a) => a.command),
    );
    const capturedWrites = actions.flatMap((a) => a.giveWrites ?? []);
    let localConsumed = 0;
    for (const [i, writer] of source.canonical.writers.entries()) {
      const path = `writer.${i}`,
        action = actions.find((a) => a.actionId === writer.actionId);
      const writes =
        action?.giveWrites?.filter(
          (w) => w.source.effect === writer.effect && w.operationIndex === writer.operationIndex,
        ) ?? [];
      c('giveWriteMismatch', `${path}.unique`, true, writes.length <= 1);
      if (!action || !writes.length) {
        boundary('writerNotApplied');
        continue;
      }
      reached++;
      const write = writes[0]!;
      c('giveWriteMismatch', `${path}.native`, 'committed', action.native?.status);
      if (action.native?.status !== 'committed') {
        rejected++;
        boundary('nativeNoncommitOutsideScope');
        continue;
      }
      const modifier = write.modifiers[0],
        receipt = write.receipts[0];
      if (write.modifiers.length === 0 && write.receipts.length === 0) {
        c('giveWriteMismatch', `${path}.excludedNoMutation`, true, write.before === write.after);
        excluded++;
        boundary('writerReachedWithoutApplicableRecipient');
        continue;
      }

      c(
        'giveWriteMismatch',
        `${path}.cardinality`,
        [1, 1],
        [write.modifiers.length, write.receipts.length],
      );
      if (!modifier || !receipt) continue;
      c(
        'giveIdentityMismatch',
        `${path}.source`,
        [writer.sourceInstanceId, writer.sourceId, writer.skillId, writer.effect.occurrenceId],
        [
          write.source.sourceInstanceId,
          write.source.sourceId,
          write.source.skillId,
          write.source.effect.occurrenceId,
        ],
      );
      c(
        'giveIdentityMismatch',
        `${path}.operation`,
        [true, true],
        [write.operation === writer.operation, modifier.operation === writer.operation],
      );
      c(
        'giveWriteMismatch',
        `${path}.cell`,
        [
          writer.valueSetIndex,
          writer.valueIndex,
          writer.operation.values[writer.valueSetIndex]?.[writer.valueIndex],
        ],
        [write.valueSetIndex, write.valueIndex, modifier.value],
      );
      c(
        'giveIdentityMismatch',
        `${path}.instance`,
        [
          `${writer.actionId}:${writer.sourceInstanceId}:${writer.effect.occurrenceId}`,
          'attacker',
          write.source.constantFormKey ?? null,
        ],
        [modifier.id, modifier.actor, modifier.formKey],
      );
      c(
        'giveWriteMismatch',
        `${path}.append`,
        [write.before.modifiers ?? [], write.before.receipts, write.before.actors],
        [
          write.after.modifiers?.slice(0, -1),
          write.after.receipts.slice(0, -1),
          write.after.actors,
        ],
      );
      c(
        'giveIdentityMismatch',
        `${path}.receipt`,
        [writer.actionId, writer.effect.occurrenceId, 'attacker', 0, 0, true, true, true],
        [
          receipt.actionId,
          receipt.occurrenceId,
          receipt.actor,
          receipt.attempted,
          receipt.actual,
          receipt.before === write.before.actors.attacker,
          receipt.after === write.after.actors.attacker,
          write.after.receipts.at(-1) === receipt,
        ],
      );
      c(
        'giveRetainedMismatch',
        `${path}.committedInstance`,
        true,
        action.returned?.hp?.modifiers?.includes(modifier),
      );
      committed++;
    }
    c(
      'giveWriteMismatch',
      'writePopulation',
      capturedWrites.length,
      source.canonical.writers.filter((w) =>
        capturedWrites.some(
          (x) =>
            x.source.effect === w.effect &&
            x.operationIndex === w.operationIndex &&
            actions.some((a) => a.actionId === w.actionId && a.giveWrites?.includes(x)),
        ),
      ).length,
    );
    for (const [i, consumer] of source.canonical.consumers.entries()) {
      const action = actions.find((a) => a.actionId === consumer.actionId),
        path = `gain.${i}`;
      const gains =
        action?.giveGains?.filter(
          (w) =>
            w.source.effect === consumer.effect && w.operationIndex === consumer.operationIndex,
        ) ?? [];
      c('giveConsumptionMismatch', `${path}.unique`, true, gains.length <= 1);
      const gain = gains[0];
      if (!gain) {
        boundary('gainNotApplied');
        continue;
      }
      const instances =
        gain.before.modifiers?.filter(
          (m) => m.actor === 'attacker' && m.operation.action === 'give',
        ) ?? [];
      if (!instances.length) {
        boundary('noAppliedPriorGive');
        continue;
      }
      const reads =
        action?.giveConsumptions?.filter(
          (r) => r.source === gain.source && r.operationIndex === consumer.operationIndex,
        ) ?? [];
      // Party gain records each original recipient, including auxiliary actors, in native receipt order.
      const receipts = gain.receipts.filter((r) => r.actor !== 'excluded');
      c(
        'giveConsumptionMismatch',
        `${path}.population`,
        receipts.map((r) => r.actor),
        reads.map((r) => r.consumption.actor),
      );
      c('giveConsumptionMismatch', `${path}.native`, 'committed', action?.native?.status);
      for (const [j, read] of reads.entries()) {
        const h = read.consumption,
          receipt = receipts[j],
          q = `${path}.read.${j}`;
        if (!receipt) continue;
        c(
          'giveIdentityMismatch',
          `${q}.source`,
          [
            source.canonical.writers[0]?.sourceInstanceId,
            consumer.skillId,
            consumer.valueSetIndex,
            consumer.valueIndex,
            true,
          ],
          [
            read.source.sourceInstanceId,
            read.source.skillId,
            read.valueSetIndex,
            read.valueIndex,
            read.source.effect.execution[read.operationIndex] === consumer.operation,
          ],
        );
        c('giveConsumptionMismatch', `${q}.giveActor`, 'attacker', h.give.actor);
        c(
          'giveIdentityMismatch',
          `${q}.recipientBefore`,
          true,
          receipt.before === gain.before.actors[receipt.actor],
        );
        c('giveConsumptionMismatch', `${q}.instances`, instances, h.give.instances);
        c(
          'giveIdentityMismatch',
          `${q}.instanceReferences`,
          instances.map(() => true),
          h.give.instances.map((m, k) => m === instances[k]),
        );
        c(
          'giveConsumptionMismatch',
          `${q}.priorCommittedWrites`,
          true,
          h.give.instances.every((m) =>
            capturedWrites.some(
              (w) =>
                w.modifiers.includes(m) &&
                consumer.writers.some(
                  (writer) =>
                    writer.effect === w.source.effect && writer.operationIndex === w.operationIndex,
                ),
            ),
          ),
        );
        c(
          'giveConsumptionMismatch',
          `${q}.input`,
          [
            receipt.actor,
            true,
            'gain',
            'fixed',
            consumer.operation.kind === 'resourceMutation' &&
            consumer.operation.amount.kind === 'fixed'
              ? consumer.operation.amount.values[consumer.valueSetIndex]?.[consumer.valueIndex]
              : undefined,
          ],
          [
            h.actor,
            h.before === receipt.before,
            h.mutation.direction,
            h.mutation.unit,
            h.mutation.amount,
          ],
        );
        c(
          'giveConsumptionMismatch',
          `${q}.arguments`,
          [h.give.value, h.receive.value],
          [h.mutation.give, h.mutation.receive],
        );
        c(
          'giveIdentityMismatch',
          `${q}.receipt`,
          [consumer.actionId, consumer.effect.occurrenceId, true, true],
          [
            receipt.actionId,
            receipt.occurrenceId,
            receipt.after === gain.after.actors[receipt.actor],
            h.result.status === 'applied' && h.result.actor === receipt.after,
          ],
        );
        c(
          'giveConsumptionMismatch',
          `${q}.result`,
          h.result.status === 'applied'
            ? [h.result.actor, h.result.attempted, h.result.actual]
            : h.result,
          [receipt.after, receipt.attempted, receipt.actual],
        );
        c(
          'giveRetainedMismatch',
          `${q}.returned`,
          gain.after.actors[h.actor],
          action?.returned?.hp?.actors[h.actor],
        );
        gainConsumed++;
        if (h.actor === 'attacker') localConsumed++;
        if (receipt.actual !== null && receipt.actual > 0) changed++;
        else boundary('gainActualZero');
      }
    }
    // Native state chains include marker append and action boundaries, without reducer replay.
    for (const [i, action] of actions.entries()) {
      if (i)
        c(
          'giveRetainedMismatch',
          `action.${i}.start`,
          actions[i - 1]?.returned?.hp,
          action.start.hp,
        );
      const last =
        action.sources.length === 0 ? action.start.hp : action.sourceEnds.at(-1)?.after.hp;
      if (action.native?.status === 'committed') {
        const facts = (hp: typeof last) =>
          hp && Object.fromEntries(Object.entries(hp).filter(([key]) => key !== 'executedEffects'));
        c(
          'giveRetainedMismatch',
          `action.${i}.commit`,
          facts(action.commitStartHp ?? last),
          facts(action.returned?.hp),
        );
      }
    }
    if (
      source.calculation.status !== 'executable' ||
      !source.ordered ||
      source.observation?.targetExecution?.selection !== 'selected'
    ) {
      boundary('noSelectedDamageExecution');
      continue;
    }
    c(
      'giveRetainedMismatch',
      'selected.finalHp',
      true,
      preparationExecutionStateFor(source.ordered)?.hp === source.transitions?.at(-1)?.result.state.hp,
    );
    c('giveTraceMissing', 'selected.candidate', true, !!source.candidate);
    const candidate = source.candidate;
    if (!candidate) continue;
    c('giveRetainedMismatch', 'selected.seed', true, candidate.seed.hp === preparationExecutionStateFor(source.ordered)?.hp);
    c(
      'giveReaderMismatch',
      'reader.population',
      source.canonical.readers.map((r) => [
        r.operationId,
        r.sequence,
        r.leaf.comparison,
        r.leaf.value,
      ]),
      candidate.reads.map((r) => [
        r.operationId,
        r.operationSequence,
        r.comparison,
        r.expectedValue,
      ]),
    );
    for (const [i, read] of candidate.reads.entries()) {
      c(
        'giveReaderMismatch',
        `reader.${i}.retained`,
        [candidate.seed.hp?.actors, candidate.seed.permille, 'attacker'],
        [read.state.hp?.actors, read.permille, read.actor],
      );
      const use = source.uses.find((u) => u.operationId === read.operationId);
      c(
        'giveReaderMismatch',
        `reader.${i}.event`,
        [read.conditionOutcome],
        use?.events.map((e) => e.condition),
      );
      readers++;
    }
    if (!candidate.reads.length) boundary('noSelectedHpReader');
    c(
      'giveNpMismatch',
      'np.population',
      source.canonical.nps.map((n) => [n.operation.operationId, n.sequence]),
      candidate.nps.map((n) => [n.operationId, n.operationSequence]),
    );
    c(
      'giveNpMismatch',
      'np.canonicalPopulation',
      source.canonical.naturalNps.length,
      source.canonical.nps.length,
    );
    for (const [i, np] of candidate.nps.entries()) {
      c('giveNpMismatch', `np.${i}.retained`, candidate.seed.hp?.actors, np.state.hp?.actors);
      c('giveNpMismatch', `np.${i}.ratio`, np.context.attackerHpRatio, np.ratio);
      c(
        'giveNpMismatch',
        `np.${i}.input`,
        [np.input.damageFunction, np.input.npMultipliers, np.input.npSpecialMultipliers],
        [
          source.input?.damageFunction,
          source.input?.npMultipliers,
          source.input?.npSpecialMultipliers,
        ],
      );
      if (np.disposition === 'consumed') nps++;
      else boundary(`np:${np.disposition}`);
    }
    if (!candidate.nps.length) boundary('noSelectedHpRatioLowNp');
    for (const [i, use] of source.uses.entries()) {
      c('giveUseMismatch', `use.${i}.eventPopulation`, 1, use.events.length);
      for (const event of use.events) {
        c(
          'giveUseMismatch',
          `use.${i}.projection`,
          [event.projectionKey, event.projectionOutcome, event.projectionValuePermille],
          use.projections.map((p) => [p.projectionKey, p.outcome, p.valuePermille])[0],
        );
        for (const contribution of use.contributions)
          c(
            'giveUseMismatch',
            `use.${i}.contribution`,
            event.operationOutcome,
            contribution.executionOutcome,
          );
      }
    }
    if (
      localConsumed &&
      source.canonical.scopeBoundaries.length === 0 &&
      candidate.reads.length &&
      candidate.nps.some((np) => np.disposition === 'consumed') &&
      !failures.some((f) => f.identity === identity)
    )
      connected++;
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    declaredSelected: selected.reduce(
      (count, r) => count + (giveCanonical(r.prepared)?.writers.length ?? 0),
      0,
    ),
    selected: selected.length,
    reached,
    committed,
    rejected,
    excluded,
    gainConsumed,
    changed,
    readers,
    nps,
    connected,
    checks,
    failures,
    boundaries,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
/** Canonical declaration inventory includes out-of-scope origins; never selects by ID/label. */
export function giveInventory(master: MasterDataSnapshot) {
  const sources = [
    ...master.servants.flatMap((s) => [
      ...s.skills.map((skill) => ({
        origin: 'skill',
        owner: s.id,
        key: skill.id,
        effects: skill.effects,
      })),
      ...s.passives.map((skill) => ({
        origin: 'passive',
        owner: s.id,
        key: skill.id,
        effects: skill.effects,
      })),
      ...getNoblePhantasmVariants(s).map((np) => ({
        origin: 'np',
        owner: s.id,
        key: JSON.stringify(np.ref),
        effects: np.effects,
      })),
    ]),
    ...master.craftEssences.map((ce) => ({
      origin: 'craftEssence',
      owner: ce.id,
      key: ce.id,
      effects: ce.effects,
    })),
    ...master.mysticCodes.flatMap((mc) =>
      mc.skills.map((skill) => ({
        origin: 'mysticCode',
        owner: mc.id,
        key: skill.id,
        effects: skill.effects,
      })),
    ),
  ];
  return sources.flatMap((s) =>
    s.effects.flatMap((effect) =>
      effect.execution.flatMap((operation, operationIndex) =>
        operation.kind === 'hpModifier' && operation.action === 'give'
          ? [
              {
                origin: s.origin,
                owner: s.owner,
                key: s.key,
                occurrenceId: effect.occurrenceId,
                operationIndex,
                operation,
              },
            ]
          : [],
      ),
    ),
  );
}
