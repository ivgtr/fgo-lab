import {
  getSkillsForActorForm,
  getNoblePhantasmVariants,
  noblePhantasmVariantKey,
  canonicalRequirementLeaves,
  type MasterDataSnapshot,
  type MasterEffect,
} from '@fgo-lab/master-data';
import {
  npProgramEffects,
  type BattleOperation,
  type ConditionExpression,
  type AppliedPreparationAction,
  type PreNoblePhantasmState,
  type ExecutableBattleState,
} from '@fgo-lab/battle-execution';
import {
  preparationHpActionsFor,
  hpCandidateObservationFor,
  type PreparationHpAction,
} from '@fgo-lab/battle-execution/preparation-audit';
import {
  firstCanonicalAuditDifference,
  type CanonicalAuditValue,
} from '@fgo-lab/master-data/production-audit';
import { scalarQuantitySnapshot as snapshot } from './productionScalarQuantityAudit';
import { battlePointPreparationRejectionObservationFor } from './battlePointPreparationObservation';
import type { PreparedCalculationScenario, CalculationExecution } from './scenario';

type Writer = Extract<MasterEffect['execution'][number], { resource: 'hp' }>;
export function isFixedSelfHpWriter(
  operation: MasterEffect['execution'][number],
): operation is Writer {
  return (
    operation.kind === 'resourceMutation' &&
    operation.resource === 'hp' &&
    operation.amount.kind === 'fixed' &&
    operation.unit === 'fixed' &&
    operation.recipient === 'sourceSelf' &&
    (operation.selection === undefined || operation.selection === 'direct')
  );
}
const same = (left: unknown, right: unknown) =>
  firstCanonicalAuditDifference(
    [{ identity: 'hp', value: snapshot(left) }],
    [{ identity: 'hp', value: snapshot(right) }],
  ) === null;
function hpLeaves(
  condition: ConditionExpression,
): Extract<ConditionExpression, { kind: 'quantity' }>[] {
  if (condition.kind === 'quantity')
    return condition.quantity === 'attackerHpPermille' ? [condition] : [];
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.flatMap(hpLeaves);
  return condition.kind === 'not' ? hpLeaves(condition.expression) : [];
}
type ResolvedScenario = Extract<PreparedCalculationScenario['scenario'], { mode: 'resolved' }>;
type HpAction = {
  index: number;
  actionId: string;
  command: ResolvedScenario['preNoblePhantasmPlan'][number];
  form: ResolvedScenario['attacker']['initialActorFormId'];
  skillId: string | null;
  effects: MasterEffect[];
};
export interface HpCanonical {
  scenario: ResolvedScenario;
  masterVersion: string;
  servantId: string;
  form: HpAction['form'];
  actions: HpAction[];
  writers: {
    actionIndex: number;
    actionId: string;
    command: HpAction['command'];
    form: HpAction['form'];
    sourceInstanceId: string;
    sourceId: string;
    origin: 'attacker';
    skillId: string;
    effect: MasterEffect;
    operation: Writer;
    operationIndex: number;
    valueSetIndex: number;
    valueIndex: number;
    actor: string;
  }[];
  naturalReaders: {
    occurrenceId: string;
    leaf: ReturnType<typeof canonicalRequirementLeaves>[number];
  }[];
  scopeBoundaries: string[];
  naturalNps: Extract<
    ReturnType<typeof getNoblePhantasmVariants>[number],
    { kind: 'attack' }
  >['damage'];
  operations: readonly BattleOperation[];
  readers: {
    operationId: string;
    sequence: number;
    source: BattleOperation['source'];
    leaf: Extract<ConditionExpression, { kind: 'quantity' }>;
  }[];
  nps: { operation: Extract<BattleOperation, { kind: 'executeNpDamage' }>; sequence: number }[];
}
/** Selected canonical commands, before activation/native success/receipt filtering. */
export function hpPreparationCanonical(prepared: PreparedCalculationScenario): HpCanonical | null {
  const scenario = prepared.scenario;
  if (scenario.mode !== 'resolved') return null;
  const servant = prepared.master.servants.find(({ id }) => id === scenario.attacker.servantId);
  if (!servant) return null;
  const form = scenario.attacker.initialActorFormId;
  const actions = scenario.preNoblePhantasmPlan.map((command, index) => {
    const skills =
      command.kind === 'useSkillSlot'
        ? getSkillsForActorForm(servant, form).filter(({ slot }) => slot === command.slot)
        : [];
    const skill = skills.length === 1 ? skills[0] : undefined;
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
      form,
      skillId: skill?.id ?? null,
      effects,
    };
  });
  const writers = actions.flatMap((action) =>
    action.effects.flatMap((effect) =>
      effect.execution.flatMap((operation, operationIndex) =>
        isFixedSelfHpWriter(operation)
          ? [
              {
                actionIndex: action.index,
                actionId: action.actionId,
                command: action.command,
                form,
                sourceInstanceId: `attacker:${servant.id}`,
                sourceId: servant.id,
                origin: 'attacker' as const,
                skillId: action.skillId!,
                effect,
                operation,
                operationIndex,
                valueSetIndex: 0,
                valueIndex:
                  action.command.kind === 'useSkillSlot' ? action.command.skillLevel - 1 : -1,
                actor: 'attacker',
              },
            ]
          : [],
      ),
    ),
  );
  if (!writers.length) return null;
  const variant = getNoblePhantasmVariants(servant).find(
    (candidate) =>
      prepared.resolved.noblePhantasmVariant &&
      noblePhantasmVariantKey(candidate.ref) ===
        noblePhantasmVariantKey(prepared.resolved.noblePhantasmVariant.ref),
  );
  const naturalReaders = [
    ...actions.flatMap(({ effects }) => effects),
    ...(variant?.effects ?? []),
  ].flatMap((effect) =>
    canonicalRequirementLeaves(effect.requirement.expression)
      .filter((leaf) => leaf.kind === 'quantity' && leaf.quantity === 'attackerHpPermille')
      .map((leaf) => ({ occurrenceId: effect.occurrenceId, leaf })),
  );
  const operations = prepared.orderedScenario?.operations ?? [];
  const readers = operations.flatMap((operation, sequence) =>
    hpLeaves(operation.condition).map((leaf) => ({
      operationId: operation.operationId,
      sequence,
      source: operation.source,
      leaf,
    })),
  );
  const nps = operations.flatMap((operation, sequence) =>
    operation.kind === 'executeNpDamage' && operation.damage.kind === 'hpRatioLow'
      ? [{ operation, sequence }]
      : [],
  );
  const scopeBoundaries: string[] = [];
  if (
    [...actions.flatMap(({ effects }) => effects), ...(variant?.effects ?? [])].some((effect) =>
      effect.execution.some(
        (operation) => operation.kind === 'hpModifier' || operation.kind === 'removeHpModifiers',
      ),
    )
  )
    scopeBoundaries.push('hpEnvironmentMutation');
  if (
    actions.some(({ effects }) =>
      effects.some((effect) =>
        effect.execution.some(
          (operation) =>
            operation.kind === 'resourceMutation' &&
            operation.resource === 'hp' &&
            !isFixedSelfHpWriter(operation),
        ),
      ),
    )
  )
    scopeBoundaries.push('otherHpWriter');
  if (
    variant?.effects.some((effect) =>
      effect.execution.some(
        (operation) => operation.kind === 'resourceMutation' && operation.resource === 'hp',
      ),
    )
  )
    scopeBoundaries.push('npHpWriter');
  return {
    scopeBoundaries,
    scenario,
    masterVersion: prepared.master.version,
    servantId: servant.id,
    form,
    actions,
    writers,
    naturalReaders,
    naturalNps:
      variant?.kind === 'attack' ? variant.damage.filter(({ kind }) => kind === 'hpRatioLow') : [],
    operations,
    readers,
    nps,
  };
}
export interface HpPreparationSelection {
  index: number;
  identity: string;
  prepared: PreparedCalculationScenario;
  calculation: CalculationExecution;
  canonical: NonNullable<ReturnType<typeof hpPreparationCanonical>>;
}
export function hpPreparationSelection(
  prepared: PreparedCalculationScenario,
  calculation: CalculationExecution,
  index = 0,
): HpPreparationSelection | null {
  const canonical = hpPreparationCanonical(prepared);
  return canonical
    ? {
        index,
        identity: `hp:${index}:${JSON.stringify(canonical.writers.map((writer) => [writer.sourceId, writer.form, writer.actionId, writer.skillId, writer.effect.occurrenceId, writer.operationIndex]))}`,
        prepared,
        calculation,
        canonical,
      }
    : null;
}
export function hpPreparationSource(selection: HpPreparationSelection) {
  const { prepared, calculation } = selection;
  const transport = battlePointPreparationRejectionObservationFor(prepared);
  const target =
    'executionObservation' in calculation
      ? calculation.executionObservation.targetExecution
      : undefined;
  const candidate =
    target?.selection === 'selected' ? hpCandidateObservationFor(target.candidateState) : undefined;
  const ids = [
    ...new Set([
      ...selection.canonical.readers.map(({ operationId }) => operationId),
      ...selection.canonical.nps.map(({ operation }) => operation.operationId),
    ]),
  ];
  return {
    identity: selection.identity,
    selection,
    scenario: prepared.scenario,
    master: prepared.master,
    canonical: selection.canonical,
    transport,
    transitions: transport?.transitions.map((transition) => ({
      ...transition,
      hpActions: preparationHpActionsFor(transition.result),
    })),
    ordered: prepared.orderedScenario,
    calculation,
    observation:
      'executionObservation' in calculation ? calculation.executionObservation : undefined,
    candidate,
    input: calculation.status === 'executable' ? calculation.input : undefined,
    effects: calculation.effects,
    contributions: calculation.effectiveContributions,
    result: calculation.result,
    uses: ids.map((operationId) => ({
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
export type HpPreparationSource = ReturnType<typeof hpPreparationSource>;
export type HpPreparationFailureReason =
  | 'hpPopulationMismatch'
  | 'hpCanonicalMismatch'
  | 'hpIdentityMismatch'
  | 'hpWriteMismatch'
  | 'hpCommitMismatch'
  | 'hpRetainedMismatch'
  | 'hpReaderMismatch'
  | 'hpNpMismatch'
  | 'hpUseMismatch'
  | 'hpTraceMissing';
function auditRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hpSourceStructure(source: unknown): boolean {
  if (!auditRecord(source) || !Array.isArray(source['transitions'])) return false;
  const transitions: readonly unknown[] = source['transitions'];
  for (const transition of transitions) {
    if (
      !auditRecord(transition) ||
      !auditRecord(transition['before']) ||
      !auditRecord(transition['result']) ||
      !Array.isArray(transition['hpActions'])
    )
      return false;
    const actions: readonly unknown[] = transition['hpActions'];
    for (const action of actions) {
      if (
        !auditRecord(action) ||
        !auditRecord(action['start']) ||
        !Array.isArray(action['sources']) ||
        !Array.isArray(action['writes'])
      )
        return false;
      const writes: readonly unknown[] = action['writes'];
      for (const write of writes)
        if (
          !auditRecord(write) ||
          !auditRecord(write['source']) ||
          !auditRecord(write['before']) ||
          !auditRecord(write['after']) ||
          !Array.isArray(write['receipts'])
        )
          return false;
    }
  }
  const candidate = source['candidate'];
  return (
    candidate === undefined ||
    (auditRecord(candidate) &&
      auditRecord(candidate['seed']) &&
      Array.isArray(candidate['reads']) &&
      Array.isArray(candidate['nps']))
  );
}
function hpReferenceAnchors(source: HpPreparationSource): Record<string, unknown> {
  const anchors: Record<string, unknown> = {};
  for (const [i, transition] of (source.transitions ?? []).entries()) {
    anchors[`action.${i}.before`] = transition.before;
    anchors[`action.${i}.result`] = transition.result;
    for (const [j, action] of (transition.hpActions ?? []).entries()) {
      anchors[`action.${i}.native.${j}.start`] = action.start;
      anchors[`action.${i}.native.${j}.result`] = action.native;
      anchors[`action.${i}.native.${j}.returned`] = action.returned;
      for (const [k, write] of action.writes.entries()) {
        const path = `action.${i}.native.${j}.write.${k}`;
        anchors[`${path}.source`] = write.source;
        anchors[`${path}.before`] = write.before;
        anchors[`${path}.after`] = write.after;
        for (const [r, receipt] of write.receipts.entries())
          anchors[`${path}.receipt.${r}`] = receipt;
      }
    }
  }
  anchors['seed.hp'] = source.candidate?.seed.hp;
  for (const [i, read] of (source.candidate?.reads ?? []).entries())
    anchors[`reader.${i}.state`] = read.state;
  for (const [i, np] of (source.candidate?.nps ?? []).entries()) {
    anchors[`np.${i}.state`] = np.state;
    anchors[`np.${i}.context`] = np.context;
    anchors[`np.${i}.evaluation`] = np.evaluation;
    anchors[`np.${i}.input`] = np.input;
  }
  return anchors;
}
function effectDiagnostic(effect: MasterEffect) {
  const canonical = { ...effect };
  Reflect.deleteProperty(canonical, 'atlasEvidence');
  Reflect.deleteProperty(canonical, 'label');
  return canonical;
}
function actionDiagnostic(action: AppliedPreparationAction) {
  return {
    command: action.command,
    actorFormId: action.actorFormId,
    sourceKind: action.sourceKind,
    sourceId: action.sourceId,
    selectedEffects: action.selectedEffects.map((effect) => ({
      sourceKind: effect.sourceKind,
      sourceId: effect.sourceId,
      actorFormId: effect.actorFormId,
      occurrenceId: effect.occurrenceId,
      stochasticOutcome: effect.stochasticOutcome,
    })),
    hpBefore: action.hpBefore,
    hpAfter: action.hpAfter,
  };
}
function preparationStateDiagnostic(state: PreNoblePhantasmState) {
  if (!Array.isArray(state.appliedActions)) return state;
  return {
    hp: state.hp,
    appliedActions: state.appliedActions.map(actionDiagnostic),
    currentFormId: state.currentFormId,
  };
}
function hpSourceDiagnostic(source: PreparationHpAction['sources'][number]) {
  return {
    origin: source.origin,
    sourceInstanceId: source.sourceInstanceId,
    sourceId: source.sourceId,
    skillId: source.skillId,
    sourceTraits: source.sourceTraits,
    valueSetIndex: source.valueSetIndex,
    valueIndex: source.valueIndex,
    sourceEnabled: source.sourceEnabled,
    limitBreak: source.limitBreak,
    effect: {
      occurrenceId: source.effect.occurrenceId,
      selection: source.effect.selection,
      requirement: source.effect.requirement,
      execution: source.effect.execution.flatMap((operation, operationIndex) =>
        isFixedSelfHpWriter(operation) ? [{ operationIndex, operation }] : [],
      ),
    },
  };
}
function hpWriteDiagnostic(write: PreparationHpAction['writes'][number]) {
  return { ...write, source: hpSourceDiagnostic(write.source) };
}
function hpActionDiagnostic(action: PreparationHpAction) {
  if (!auditRecord(action.start) || !Array.isArray(action.sources) || !Array.isArray(action.writes))
    return action;
  return {
    actionId: action.actionId,
    start: preparationStateDiagnostic(action.start),
    sources: action.sources.map(hpSourceDiagnostic),
    writes: action.writes.map(hpWriteDiagnostic),
    native: action.native,
    returned: action.returned ? preparationStateDiagnostic(action.returned) : undefined,
  };
}
function battleStateDiagnostic(state: ExecutableBattleState) {
  return {
    hp: state.hp,
    actorFormId: state.actorFormId,
    hpPermille: state.quantities.attackerHpPermille,
    noblePhantasmVariant: state.noblePhantasmVariant.ref,
  };
}
function canonicalDiagnostic(canonical: HpCanonical | null | undefined): unknown {
  if (
    !canonical ||
    !Array.isArray(canonical.actions) ||
    !Array.isArray(canonical.writers) ||
    !Array.isArray(canonical.operations) ||
    !Array.isArray(canonical.readers) ||
    !Array.isArray(canonical.nps) ||
    !Array.isArray(canonical.naturalNps) ||
    !Array.isArray(canonical.naturalReaders) ||
    !Array.isArray(canonical.scopeBoundaries)
  )
    return canonical;
  return {
    ...canonical,
    actions: canonical.actions.map(({ effects, ...action }) => ({
      ...action,
      effects: effects.map((effect) => ({
        occurrenceId: effect.occurrenceId,
        selection: effect.selection,
        requirement: effect.requirement,
        proc: effect.proc,
      })),
    })),
    writers: canonical.writers.map(({ effect, ...writer }) => ({
      ...writer,
      effect: effectDiagnostic(effect),
    })),
  };
}
export interface HpPreparationProgram {
  selection: HpPreparationSelection;
  contract: CanonicalAuditValue;
  owner: CanonicalAuditValue;
  references: HpPreparationSource;
  anchors: Record<string, unknown>;
}
/** Freeze original observations once; coherent later mutations cannot replace owner evidence. */
export function hpPreparationProgram(selection: HpPreparationSelection): HpPreparationProgram {
  const references = hpPreparationSource(selection);
  return {
    selection,
    contract: snapshot(canonicalDiagnostic(selection.canonical)),
    owner: snapshot(hpDiagnosticSource(references)),
    references,
    anchors: hpReferenceAnchors(references),
  };
}
export function hpDiagnosticSource(source: HpPreparationSource): Record<string, unknown> {
  return {
    identity: source.identity,
    scenario: source.scenario,
    transport: source.transport
      ? {
          commands: source.transport.transitions.map(({ command }) => command),
          ordered: source.transport.orderedScenario === source.ordered,
          executionPresent: source.transport.orderedExecution !== undefined,
          rejection: source.transport.rejection,
        }
      : undefined,
    observation: source.observation
      ? {
          selection: source.observation.targetExecution?.selection,
          events:
            source.observation.targetExecution?.selection === 'selected'
              ? source.observation.targetExecution.operationEvents
              : undefined,
        }
      : undefined,
    canonical: canonicalDiagnostic(source.canonical),
    transitions: source.transitions?.map(({ before, command, result, hpActions }) => ({
      before: preparationStateDiagnostic(before),
      command,
      result: {
        status: result.status,
        hp: result.state.hp,
        appliedActions: result.state.appliedActions.map(actionDiagnostic),
        currentFormId: result.state.currentFormId,
      },
      hpActions: hpActions?.map(hpActionDiagnostic),
    })),
    ordered: source.ordered
      ? {
          hp: source.ordered.hp,
          operations: source.ordered.operations,
          appliedActions: source.ordered.appliedPreparationActions.map(actionDiagnostic),
        }
      : null,
    candidate:
      source.candidate &&
      Array.isArray(source.candidate.reads) &&
      Array.isArray(source.candidate.nps)
        ? {
            seed: source.candidate.seed,
            reads: source.candidate.reads.map(({ state, ...read }) => ({
              ...read,
              state: battleStateDiagnostic(state),
            })),
            nps: source.candidate.nps.map(({ state, ...np }) => ({
              ...np,
              state: battleStateDiagnostic(state),
            })),
          }
        : source.candidate,
    input: source.input,
    effects: source.effects,
    contributions: source.contributions,
    result: source.result,
    uses: source.uses,
  };
}
function diagnosticAt(value: CanonicalAuditValue, path: readonly (string | number)[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = Reflect.get(current, key) as unknown;
  }
  return current;
}
export function auditHpPreparation(input: {
  expected: readonly HpPreparationProgram[];
  observations: readonly HpPreparationSource[];
}) {
  const failures: {
    identity: string;
    reason: HpPreparationFailureReason;
    checkPath: string;
    expected: CanonicalAuditValue;
    actual: CanonicalAuditValue;
    firstDifference: NonNullable<ReturnType<typeof firstCanonicalAuditDifference>>;
  }[] = [];
  const checks: {
    identity: string;
    reason: HpPreparationFailureReason;
    checkPath: string;
    expected: CanonicalAuditValue;
    actual: CanonicalAuditValue;
  }[] = [];
  const check = (
    identity: string,
    reason: HpPreparationFailureReason,
    checkPath: string,
    expected: unknown,
    actual: unknown,
  ) => {
    const wanted = snapshot(expected),
      observed = snapshot(actual);
    checks.push({ identity, reason, checkPath, expected: wanted, actual: observed });
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: wanted }],
      [{ identity, value: observed }],
    );
    if (difference)
      failures.push({
        identity,
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
  check(
    'hp:population',
    'hpPopulationMismatch',
    'population',
    input.expected.map(({ selection }) => selection.identity),
    input.observations.map(({ identity }) => identity),
  );
  check(
    'hp:population',
    'hpPopulationMismatch',
    'population.unique',
    input.expected.length,
    new Set(input.expected.map(({ selection }) => selection.identity)).size,
  );
  let changed = 0,
    readers = 0,
    nps = 0;
  const boundaries: { identity: string; reason: string }[] = [];
  for (const program of input.expected) {
    const identity = program.selection.identity;
    const c = (
      reason: HpPreparationFailureReason,
      path: string,
      expected: unknown,
      actual: unknown,
    ) => check(identity, reason, path, expected, actual);
    const source = input.observations.find((item) => item.identity === identity);
    c('hpTraceMissing', 'transport.source', true, !!source);
    if (!source) continue;
    const { selection, references: refs } = program;
    c(
      'hpUseMismatch',
      'use.ownerReferences',
      [true, true, true, true],
      [
        source.input === refs.input,
        source.effects === refs.effects,
        source.contributions === refs.contributions,
        source.result === refs.result,
      ],
    );
    c(
      'hpIdentityMismatch',
      'transport.references',
      [true, true, true, true, true, true, true, true, true],
      [
        source.selection === selection,
        source.master === selection.prepared.master,
        source.scenario === selection.prepared.scenario,
        source.transport === refs.transport,
        source.ordered === selection.prepared.orderedScenario,
        source.calculation === selection.calculation,
        source.observation === refs.observation,
        source.candidate === refs.candidate,
        source.result === refs.result,
      ],
    );
    c(
      'hpCanonicalMismatch',
      'canonical.owner',
      program.contract,
      canonicalDiagnostic(hpPreparationCanonical(selection.prepared)),
    );
    c(
      'hpCanonicalMismatch',
      'canonical.source',
      program.contract,
      canonicalDiagnostic(source.canonical),
    );
    c('hpTraceMissing', 'transport.transitions', true, !!source.transitions);
    c('hpTraceMissing', 'transport.structure', true, hpSourceStructure(source));
    if (!hpSourceStructure(source)) continue;
    c('hpRetainedMismatch', 'owner.observations', program.owner, hpDiagnosticSource(source));
    const actualAnchors = hpReferenceAnchors(source);
    c(
      'hpIdentityMismatch',
      'transport.anchorPopulation',
      Object.keys(program.anchors),
      Object.keys(actualAnchors),
    );
    for (const [path, reference] of Object.entries(program.anchors))
      c('hpIdentityMismatch', `reference.${path}`, true, actualAnchors[path] === reference);
    const canonical = selection.canonical;
    if (!same(program.contract, canonicalDiagnostic(canonical))) continue;
    const formChanged = source.transitions?.some(
      (transition) =>
        !same(transition.before.currentFormId, canonical.form) ||
        !same(transition.result.state.currentFormId, canonical.form),
    );
    if (canonical.scopeBoundaries.length || formChanged) {
      boundaries.push({
        identity,
        reason: formChanged
          ? 'outsideFixedActorForm'
          : `outsideScope:${canonical.scopeBoundaries.join(',')}`,
      });
      continue;
    }

    for (const action of canonical.actions) {
      const transition = source.transitions?.[action.index];
      c('hpTraceMissing', `action.${action.index}.transition`, true, !!transition);
      if (!transition) continue;
      c(
        'hpCanonicalMismatch',
        `action.${action.index}.command`,
        action.command,
        transition.command,
      );
      c(
        'hpIdentityMismatch',
        `action.${action.index}.startReference`,
        true,
        transition.before === refs.transitions?.[action.index]?.before,
      );
      if (action.index > 0)
        c(
          'hpRetainedMismatch',
          `action.${action.index}.prefix`,
          preparationStateDiagnostic(source.transitions![action.index - 1]!.result.state),
          preparationStateDiagnostic(transition.before),
        );
      c(
        'hpRetainedMismatch',
        `action.${action.index}.startHp`,
        diagnosticAt(program.owner, ['transitions', action.index, 'before', 'hp']),
        transition.before.hp,
      );
      c(
        'hpCommitMismatch',
        `action.${action.index}.reducerOutcome`,
        diagnosticAt(program.owner, ['transitions', action.index, 'result', 'status']),
        transition.result.status,
      );
      const writers = canonical.writers.filter(({ actionIndex }) => actionIndex === action.index);
      if (!writers.length) continue;
      const native = transition.hpActions?.find(({ actionId }) => actionId === action.actionId);
      c('hpTraceMissing', `action.${action.index}.native`, true, !!native);
      if (!native) continue;
      c(
        'hpIdentityMismatch',
        `action.${action.index}.nativeStart`,
        true,
        native.start.hp === transition.before.hp &&
          native.start.appliedActions === transition.before.appliedActions,
      );
      const nativeIndex = transition.hpActions?.indexOf(native) ?? -1;
      const nativePath = ['transitions', action.index, 'hpActions', nativeIndex] as const;
      c(
        'hpCommitMismatch',
        `action.${action.index}.nativeOutcome`,
        diagnosticAt(program.owner, [...nativePath, 'native', 'status']),
        native.native?.status,
      );
      c(
        'hpWriteMismatch',
        `action.${action.index}.writes`,
        diagnosticAt(program.owner, [...nativePath, 'writes']),
        native.writes.map(hpWriteDiagnostic),
      );
      if (native.native?.status !== 'committed' || transition.result.status !== 'applied') {
        boundaries.push({ identity, reason: 'outsideCommittedHpWriter' });
        continue;
      }
      c(
        'hpCommitMismatch',
        `action.${action.index}.nativeCommit`,
        'committed',
        native.native.status,
      );
      c(
        'hpRetainedMismatch',
        `action.${action.index}.returnedHp`,
        true,
        native.returned?.hp === transition.result.state.hp,
      );
      const applied = transition.result.state.appliedActions.at(-1);
      c(
        'hpRetainedMismatch',
        `action.${action.index}.appliedReferences`,
        [true, true],
        [
          applied?.hpBefore === transition.before.hp,
          applied?.hpAfter === transition.result.state.hp,
        ],
      );
      c(
        'hpRetainedMismatch',
        `action.${action.index}.committedPrefix`,
        transition.before.appliedActions.map(actionDiagnostic),
        transition.result.state.appliedActions.slice(0, -1).map(actionDiagnostic),
      );
      const writes = native.writes.filter(({ source: writer }) => writer.origin === 'attacker');
      c(
        'hpWriteMismatch',
        `action.${action.index}.writeOrder`,
        writers
          .filter((writer) =>
            writes.some(
              (write) =>
                write.source.effect === writer.effect &&
                write.operationIndex === writer.operationIndex,
            ),
          )
          .map((writer) => [writer.effect.occurrenceId, writer.operationIndex]),
        writes.map((write) => [write.source.effect.occurrenceId, write.operationIndex]),
      );
      for (const [index, writer] of writers.entries()) {
        const write = writes.find(
          (write) =>
            write.source.effect === writer.effect && write.operationIndex === writer.operationIndex,
        );
        const path = `action.${action.index}.writer.${index}`;
        const actualSource = native.sources.find(
          (item) => item.effect === writer.effect && item.origin === 'attacker',
        );
        c('hpTraceMissing', `${path}.source`, true, !!actualSource);
        if (!actualSource) continue;
        c(
          'hpCanonicalMismatch',
          `${path}.identity`,
          [
            writer.origin,
            writer.sourceInstanceId,
            writer.sourceId,
            writer.skillId,
            writer.valueSetIndex,
            writer.valueIndex,
            writer.operation,
          ],
          [
            actualSource.origin,
            actualSource.sourceInstanceId,
            actualSource.sourceId,
            actualSource.skillId,
            actualSource.valueSetIndex,
            actualSource.valueIndex,
            actualSource.effect.execution[writer.operationIndex],
          ],
        );
        if (!write) {
          boundaries.push({ identity, reason: 'notApplied' });
          continue;
        }
        c('hpIdentityMismatch', `${path}.operationReference`, true, write.source === actualSource);
        c(
          'hpWriteMismatch',
          `${path}.receiptPopulation`,
          write.before === write.after ? 0 : 1,
          write.receipts.length,
        );
        if (write.before === write.after) boundaries.push({ identity, reason: 'notApplied' });
        const receipt = write.receipts[0];
        if (!receipt) continue;
        c(
          'hpIdentityMismatch',
          `${path}.receiptIdentity`,
          [writer.actionId, writer.effect.occurrenceId, writer.actor],
          [receipt.actionId, receipt.occurrenceId, receipt.actor],
        );
        c(
          'hpIdentityMismatch',
          `${path}.receiptReferences`,
          [true, true, true],
          [
            receipt.before === write.before.actors.attacker,
            receipt.after === write.after.actors.attacker,
            write.after.receipts.at(-1) === receipt,
          ],
        );
        c(
          'hpRetainedMismatch',
          `${path}.receiptPrefix`,
          write.before.receipts,
          write.after.receipts.slice(0, -1),
        );
        if (receipt.actual !== null && receipt.actual > 0 && !same(receipt.before, receipt.after))
          changed++;
        else boundaries.push({ identity, reason: 'noChange' });
      }
      c(
        'hpRetainedMismatch',
        `action.${action.index}.lastWrite`,
        writes.at(-1)?.after.actors ?? transition.before.hp?.actors,
        transition.result.state.hp?.actors,
      );
    }
    if (
      selection.prepared.status !== 'executable' ||
      selection.calculation.status !== 'executable' ||
      !source.ordered
    ) {
      boundaries.push({ identity, reason: 'beforeOrderedExecution' });
      continue;
    }
    const final = source.transitions?.at(-1)?.result.state.hp;
    c('hpRetainedMismatch', 'retained.preparedReference', true, source.ordered.hp === final);
    const candidate = source.candidate;
    c('hpTraceMissing', 'seed.candidate', true, !!candidate);
    if (!candidate) continue;
    c('hpRetainedMismatch', 'seed.hpReference', true, candidate.seed.hp === source.ordered.hp);
    c(
      'hpReaderMismatch',
      'reader.population',
      canonical.readers.map(({ operationId, sequence, leaf }) => [
        operationId,
        sequence,
        leaf.comparison,
        leaf.value,
      ]),
      candidate.reads.map((read) => [
        read.operationId,
        read.operationSequence,
        read.comparison,
        read.expectedValue,
      ]),
    );
    if (!canonical.readers.length) boundaries.push({ identity, reason: 'noOrderedHpReader' });
    for (const [index, read] of candidate.reads.entries()) {
      c(
        'hpReaderMismatch',
        `reader.${index}.retained`,
        [
          candidate.seed.hp?.actors,
          candidate.seed.permille,
          read.state.quantities.attackerHpPermille,
        ],
        [read.state.hp?.actors, read.permille, read.permille],
      );
      c(
        'hpIdentityMismatch',
        `reader.${index}.stateReference`,
        true,
        read.state === refs.candidate?.reads[index]?.state,
      );
      c('hpReaderMismatch', `reader.${index}.actor`, 'attacker', read.actor);
      const use = source.uses.find(({ operationId }) => operationId === read.operationId);
      c('hpUseMismatch', `reader.${index}.eventPopulation`, 1, use?.events.length);
      for (const event of use?.events ?? [])
        c(
          'hpReaderMismatch',
          `reader.${index}.conditionOutcome`,
          read.conditionOutcome,
          event.condition,
        );

      c(
        'hpReaderMismatch',
        `reader.${index}.evaluation`,
        diagnosticAt(program.owner, ['candidate', 'reads', index, 'evaluated']),
        read.evaluated,
      );
      readers++;
    }
    c(
      'hpNpMismatch',
      'np.population',
      canonical.nps.map(({ operation, sequence }) => [operation.operationId, sequence]),
      candidate.nps.map((np) => [np.operationId, np.operationSequence]),
    );
    c('hpNpMismatch', 'np.canonicalPopulation', canonical.naturalNps.length, canonical.nps.length);
    if (!canonical.nps.length) boundaries.push({ identity, reason: 'noHpRatioLowNp' });
    for (const [index, np] of candidate.nps.entries()) {
      c('hpNpMismatch', `np.${index}.retained`, candidate.seed.hp?.actors, np.state.hp?.actors);
      const frozenContext = diagnosticAt(program.owner, ['candidate', 'nps', index, 'context']);
      const frozenEvaluation = diagnosticAt(program.owner, [
        'candidate',
        'nps',
        index,
        'evaluation',
      ]);
      c('hpNpMismatch', `np.${index}.context`, frozenContext, np.context);
      c('hpNpMismatch', `np.${index}.evaluation`, frozenEvaluation, np.evaluation);
      c(
        'hpNpMismatch',
        `np.${index}.input`,
        {
          npMultipliers: np.input.npMultipliers,
          npSpecialMultipliers: np.input.npSpecialMultipliers,
          damageFunction: np.input.damageFunction,
        },
        {
          npMultipliers: source.input?.npMultipliers,
          npSpecialMultipliers: source.input?.npSpecialMultipliers,
          damageFunction: source.input?.damageFunction,
        },
      );
      c(
        'hpIdentityMismatch',
        `np.${index}.stateReference`,
        true,
        np.state === refs.candidate?.nps[index]?.state,
      );
      c('hpNpMismatch', `np.${index}.ratio`, np.context.attackerHpRatio, np.ratio);
      if (np.disposition === 'consumed') nps++;
      else boundaries.push({ identity, reason: `hpNp:${np.disposition}` });
    }
    c(
      'hpUseMismatch',
      'use.references',
      [true, true, true],
      [
        source.input === refs.input,
        source.effects === refs.effects,
        source.contributions === refs.contributions,
      ],
    );
    c('hpUseMismatch', 'use.evidence', refs.uses, source.uses);
    for (const [index, use] of source.uses.entries()) {
      c('hpUseMismatch', `use.${index}.events`, 1, use.events.length);
      for (const event of use.events) {
        c(
          'hpUseMismatch',
          `use.${index}.projection`,
          [event.projectionKey, event.projectionOutcome, event.projectionValuePermille],
          use.projections.map((projection) => [
            projection.projectionKey,
            projection.outcome,
            projection.valuePermille,
          ])[0],
        );
        for (const contribution of use.contributions)
          c(
            'hpUseMismatch',
            `use.${index}.contribution.${contribution.component}`,
            event.operationOutcome,
            contribution.executionOutcome,
          );
      }
    }

    c('hpUseMismatch', 'result.owner', refs.result, source.result);
  }
  return {
    status: failures.length ? ('failed' as const) : ('passed' as const),
    expected: input.expected.map(({ selection }) => selection.identity),
    changed,
    readers,
    nps,
    boundaries,
    checks,
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
  };
}
export function hpCanonicalInventory(master: MasterDataSnapshot) {
  return master.servants.flatMap((servant) =>
    servant.actorFormGraph.forms.flatMap((form) =>
      getSkillsForActorForm(servant, form.id).flatMap((skill) =>
        npProgramEffects(skill.effects).flatMap((effect) =>
          effect.execution.flatMap((operation, operationIndex) =>
            isFixedSelfHpWriter(operation)
              ? [
                  {
                    servantId: servant.id,
                    form: form.id,
                    skillId: skill.id,
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
}
export function auditPublishedHpPreparation(
  master: MasterDataSnapshot,
  requests: readonly { prepared: PreparedCalculationScenario; calculation: CalculationExecution }[],
  selections: readonly HpPreparationSelection[],
  programs: readonly HpPreparationProgram[],
  observations: readonly HpPreparationSource[],
) {
  const gate = auditHpPreparation({ expected: programs, observations });
  const inventory = hpCanonicalInventory(master);
  const expectedSelections: HpPreparationSelection[] = [];
  for (const request of requests) {
    const selection = hpPreparationSelection(
      request.prepared,
      request.calculation,
      expectedSelections.length,
    );
    if (selection) expectedSelections.push(selection);
  }
  const expectedSelectionValues = expectedSelections.map(({ identity, canonical }) => ({
    identity,
    canonical: canonicalDiagnostic(canonical),
  }));
  const actualSelectionValues = selections.map(({ identity, canonical }) => ({
    identity,
    canonical: canonicalDiagnostic(canonical),
  }));
  const selected = selections.map((selection) => selection.identity);
  const expectedPrograms = programs.map(({ selection }) => selection.identity);
  const missingDeclarations = selections.flatMap(({ canonical }) =>
    canonical.writers.filter(
      (writer) =>
        !inventory.some(
          (item) =>
            item.servantId === writer.sourceId &&
            same(item.form, writer.form) &&
            item.skillId === writer.skillId &&
            item.occurrenceId === writer.effect.occurrenceId &&
            item.operationIndex === writer.operationIndex &&
            same(item.operation, writer.operation),
        ),
    ),
  );
  const publicationChecks = [
    {
      checkPath: 'published.requests',
      expected: snapshot(expectedSelectionValues),
      actual: snapshot(actualSelectionValues),
    },
    {
      checkPath: 'published.selectionPrograms',
      expected: snapshot(selected),
      actual: snapshot(expectedPrograms),
    },
    {
      checkPath: 'published.declarations',
      expected: snapshot([]),
      actual: snapshot(missingDeclarations),
    },
  ];
  const publicationFailures: typeof gate.failures = publicationChecks.flatMap((check) => {
    const identity = 'hp:published';
    const difference = firstCanonicalAuditDifference(
      [{ identity, value: check.expected }],
      [{ identity, value: check.actual }],
    );
    return difference
      ? [
          {
            ...check,
            identity,
            reason: 'hpPopulationMismatch',
            firstDifference: {
              ...difference,
              path: difference.path ? `${check.checkPath}.${difference.path}` : check.checkPath,
            },
          },
        ]
      : [];
  });
  const failures = [...gate.failures, ...publicationFailures];
  return {
    ...gate,
    status: failures.length ? ('failed' as const) : ('passed' as const),
    checks: [
      ...gate.checks,
      ...publicationChecks.map((check) => ({
        ...check,
        identity: 'hp:published',
        reason: 'hpPopulationMismatch' as const,
      })),
    ],
    failures,
    firstDifference: failures[0]?.firstDifference ?? null,
    inventory,
    selected,
    missingDeclarations,
  };
}
