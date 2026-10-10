import type { SourceActivationReceipt } from './conditionRead';
import { diagnoseRejectedPreparation } from './preparationDiagnostic';
import type {
  PreparationActionExecution,
  RejectedPreparationDiagnostic,
} from './preparationExecution';
import type { PreparationInitializationExecution } from './preparationExecution';
import { pendingNoblePhantasmSourceBinding, type SourceExecutionBinding } from './executionBinding';
import { initializePreparationRoot, type PreparationExecutionSession } from './preparationSession';
import { forkPreparationState } from './preparationState';
import type { PreparationContextOptions, PreparationStateSnapshot } from './preparationContracts';
import { hpEffectKey } from './preparationHp';
import { markerEffectReads, terminalMarkerReads, markerHasOpaqueReads } from './markerDependency';
import { getNoblePhantasmVariants } from '@fgo-lab/master-data';
import { actorFormKey } from '@fgo-lab/master-data';
import { compileOcSourceProgram } from './ocSourceProgram';
import { ocSourceOperationKey } from './ocSourceBinding';
import { collectAuxiliarySources } from './auxiliarySources';
import {
  getBaseNoblePhantasmGroup,
  getSkillsForActorForm,
  findActorForm,
  noblePhantasmVariantKey,
  type NoblePhantasmVariantRef,
  type ActorFormId,
  type MasterDataSnapshot,
  type MasterEffect,
  type CanonicalInputDefinition,
  type CanonicalNpResourceSemantics,
} from '@fgo-lab/master-data';
import { battlePointEffectKey } from './battlePointResource';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import type { ExecutionIssue, ExecutionPhase } from './contracts';
import type { Origin } from './effectRouting';
import {
  reducePreNoblePhantasmAction,
  type AppliedPreparationAction,
  type PreNoblePhantasmState,
  type PreparationFailureCode,
} from './preNoblePhantasm';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface SourceEffect {
  sourceActivation: SourceActivationReceipt;
  runtimeBinding?: SourceExecutionBinding;
  markerReaders?: ReadonlySet<string>;
  markerProgram?: readonly string[];
  hpExecutionCommitted?: boolean;
  battlePointExecutionCommitted?: boolean;
  phase: ExecutionPhase;
  origin: Origin;
  sourceInstanceId: string;
  sourceId: string;
  sourceName: string;
  sourceTraits: readonly string[];
  skillId: string;
  skillName: string;
  effect: MasterEffect;
  valueSetIndex: number;
  valueIndex: number;
  limitBreak: boolean;
  sourceEnabled: boolean;
  enabledByDefault: boolean;
  noblePhantasmVariant: NoblePhantasmVariantRef | null;
  constantFormKey?: string;
  ocExecutionCommitted?: boolean;
  compilationPurpose?: 'execution' | 'dependency';
}

export interface ResolvedAttackerSkillUse {
  slot: 1 | 2 | 3;
  skillLevel: number;
  skillId: string;
  actorFormId: ActorFormId;
  selectedEffects: readonly PreNoblePhantasmState['activeEffects'][number][];
  transitionId: string | null;
}

export interface ResolvedAttackerFormExecution {
  state: PreNoblePhantasmState;
  actions: readonly AppliedPreparationAction[];
  skillUses: readonly ResolvedAttackerSkillUse[];
  preparationNoblePhantasms: readonly {
    noblePhantasmVariant: NoblePhantasmVariantRef;
    actorFormId: ActorFormId;
  }[];
  issues: readonly ExecutionIssue[];
  requiredInputs: readonly PreparationRequiredInput[];
  recoveryInputDefinitions?: readonly CanonicalInputDefinition[];
  rejection: { code: PreparationFailureCode; operationId: string } | null;
  actionExecutions?: readonly PreparationActionExecution[];
  diagnostic?: RejectedPreparationDiagnostic;
  initializationExecution?: PreparationInitializationExecution;
}

/** A normal completed execution borrows its final native receipt, never its writable checkout. */
export function completedPreparationStateFor(
  execution: ResolvedAttackerFormExecution,
): PreparationStateSnapshot {
  const native = execution.actionExecutions?.at(-1) ?? execution.initializationExecution;
  if (!native) throw new TypeError('missing_completed_preparation_execution');
  return native.state;
}

/** Runtime demand metadata never changes the canonical declaration. */
export interface PreparationRequiredInput {
  definition: CanonicalInputDefinition;
  effectOccurrenceIds: string[];
}

export function resolveAttackerFormExecution(
  scenario: ResolvedScenario,
  attacker: MasterDataSnapshot['servants'][number],
  resourceSemantics: CanonicalNpResourceSemantics,
  initialGauge: number = scenario.initialOvercharge *
    resourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
  options: PreparationContextOptions & {
    executionSession?: PreparationExecutionSession;
    diagnoseRejectedActions?: boolean;
    observePreparationTransition?: (
      before: PreparationStateSnapshot,
      command: PreparationActionExecution['command'],
      result: PreparationActionExecution,
    ) => void;
  } = {},
): ResolvedAttackerFormExecution {
  const identity = {
    scenario,
    attacker,
    resourceSemantics,
    initialGauge,
    options,
    diagnoseRejectedActions: options.diagnoseRejectedActions ?? false,
    observed: options.observePreparationTransition !== undefined,
  };
  const root = options.executionSession?.root(identity);
  const initialized = root
    ? { context: root.context, execution: root.prefix.execution }
    : initializePreparationRoot(identity);
  const context = { ...initialized.context };
  const created = initialized.execution;
  let prefix: Parameters<PreparationExecutionSession['step']>[0] | undefined = root?.prefix;
  if (created.status === 'rejected')
    return {
      state:
        root && options.executionSession
          ? options.executionSession.checkout(root.prefix)
          : forkPreparationState(created.state),
      actions: [],
      skillUses: [],
      preparationNoblePhantasms: [],
      requiredInputs:
        created.requiredInput && created.requiredInputEffectOccurrenceId
          ? [
              {
                definition: created.requiredInput,
                effectOccurrenceIds: [created.requiredInputEffectOccurrenceId],
              },
            ]
          : [],
      ...(created.recoveryInputDefinitions?.length
        ? { recoveryInputDefinitions: created.recoveryInputDefinitions }
        : {}),
      rejection: { code: created.code, operationId: 'preparation:create' },
      issues: [{ kind: 'unsupportedOperation', operationId: 'preparation', detail: created.code }],
      initializationExecution: created,
    };
  let state: PreparationStateSnapshot = created.state;
  const initializationExecution = created;
  const skillUses: ResolvedAttackerSkillUse[] = [];
  const preparationNoblePhantasms: Array<{
    noblePhantasmVariant: NoblePhantasmVariantRef;
    actorFormId: ActorFormId;
  }> = [];
  const issues: ExecutionIssue[] = [];
  const requiredInputs: PreparationRequiredInput[] = [];
  let rejection: ResolvedAttackerFormExecution['rejection'] = null;
  let recoveryInputDefinitions: readonly CanonicalInputDefinition[] = [];
  const actionExecutions: PreparationActionExecution[] = [];
  let diagnostic: RejectedPreparationDiagnostic | undefined;
  for (const [commandIndex, command] of scenario.preNoblePhantasmPlan.entries()) {
    const actorFormId = state.currentFormId;
    const variantBeforeAction = state.selectedNoblePhantasmVariant;
    const next =
      prefix && options.executionSession
        ? options.executionSession.step(prefix, command)
        : undefined;
    const result = next
      ? next.execution
      : reducePreNoblePhantasmAction(attacker, state, command, context);
    if (next) prefix = next;
    actionExecutions.push(result);
    options.observePreparationTransition?.(result.before, result.command, result);
    if (result.status === 'rejected') {
      recoveryInputDefinitions = result.recoveryInputDefinitions ?? [];
      if (
        result.code === 'preparationInputRequired' &&
        result.requiredInput &&
        result.requiredInputEffectOccurrenceId
      )
        requiredInputs.push({
          definition: result.requiredInput,
          effectOccurrenceIds: [result.requiredInputEffectOccurrenceId],
        });
      rejection = {
        code: result.code,
        operationId: `preparation:${attacker.id}:${command.kind}`,
      };
      if (options.diagnoseRejectedActions)
        diagnostic = diagnoseRejectedPreparation(
          attacker,
          result,
          scenario.preNoblePhantasmPlan.slice(commandIndex + 1),
          context,
        );
      break;
    }
    state = result.state;
    const applied = state.appliedActions.at(-1);
    if (command.kind === 'useSkillSlot' && applied)
      skillUses.push({
        slot: command.slot,
        skillLevel: command.skillLevel,
        skillId: applied.sourceId,
        actorFormId,
        selectedEffects: applied.selectedEffects,
        transitionId: applied.transition?.id ?? null,
      });
    if (command.kind === 'useTransformNoblePhantasm' && variantBeforeAction)
      preparationNoblePhantasms.push({
        noblePhantasmVariant: variantBeforeAction,
        actorFormId,
      });
  }
  if (!state.terminated && requiredInputs.length === 0 && rejection === null)
    rejection = {
      code: 'attackNoblePhantasmUnavailable',
      operationId: `preparation:${attacker.id}:terminal`,
    };
  return {
    state:
      prefix && options.executionSession
        ? options.executionSession.checkout(prefix)
        : forkPreparationState(state),
    actions: state.appliedActions,
    skillUses,
    preparationNoblePhantasms,
    issues,
    requiredInputs,
    ...(recoveryInputDefinitions.length ? { recoveryInputDefinitions } : {}),
    rejection,
    actionExecutions,
    initializationExecution,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

export function collectOperationSources(
  input: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  resolvedFormExecution?: ResolvedAttackerFormExecution,
): {
  sources: SourceEffect[];
  issues: ExecutionIssue[];
  formExecution: ResolvedAttackerFormExecution | null;
} {
  return collectOperationSourcesForPurpose(input, scenario, master, resolvedFormExecution, false);
}

export function collectDiagnosticOperationSources(
  input: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  rejected: ResolvedAttackerFormExecution,
) {
  if (!rejected.rejection || rejected.diagnostic?.kind !== 'rejectedPreparationDiagnostic')
    throw new TypeError('rejected_preparation_diagnostic_required');
  const state = rejected.diagnostic.state;
  return collectOperationSourcesForPurpose(
    input,
    scenario,
    master,
    {
      ...rejected,
      state,
      actions: state.appliedActions,
    },
    true,
  );
}

function collectOperationSourcesForPurpose(
  input: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
  resolvedFormExecution: ResolvedAttackerFormExecution | undefined,
  diagnostic: boolean,
): ReturnType<typeof collectOperationSources> {
  const sources: SourceEffect[] = [];
  const issues: ExecutionIssue[] = [];
  const attacker = master.servants.find((servant) => servant.id === input.attackerId);
  if (!attacker)
    return {
      sources,
      issues: [
        {
          kind: 'unsupportedOperation',
          operationId: 'attacker',
          detail: 'attacker_source_missing',
        },
      ],
      formExecution: null,
    };
  const formExecution =
    resolvedFormExecution ??
    resolveAttackerFormExecution(scenario, attacker, master.npResourceSemantics, undefined, {
      master,
    });
  issues.push(...formExecution.issues);
  if (formExecution.rejection && !diagnostic)
    return {
      sources: [],
      issues: [
        ...issues,
        {
          kind: 'unsupportedOperation',
          operationId: formExecution.rejection.operationId,
          detail: formExecution.rejection.code,
        },
      ],
      formExecution,
    };
  const auxiliary = collectAuxiliarySources(scenario, master, formExecution.state.currentFormId);
  sources.push(...auxiliary.sources.filter((source) => source.origin === 'passive'));
  issues.push(...auxiliary.issues);
  for (const action of formExecution.actions) {
    if (action.sourceKind === 'attackNoblePhantasm') continue;
    if (action.sourceKind === 'skill')
      for (const applied of action.selectedEffects) {
        const form = findActorForm(attacker, action.actorFormId);
        const skill = getSkillsForActorForm(attacker, action.actorFormId).find(
          ({ id }) => id === action.sourceId,
        );
        if (!form || !skill) {
          issues.push({
            kind: 'unsupportedOperation',
            operationId: `attacker:${attacker.id}:${action.sourceId}`,
            detail: 'source_missing',
          });
          continue;
        }
        sources.push({
          phase: 'attackerSkill',
          origin: 'attacker',
          sourceInstanceId: `attacker:${attacker.id}`,
          sourceId: attacker.id,
          sourceName: attacker.name,
          sourceTraits: form.traits,
          skillId: skill.id,
          skillName: skill.name,
          effect: applied.effect,
          valueSetIndex: 0,
          valueIndex: action.command.kind === 'useSkillSlot' ? action.command.skillLevel - 1 : 0,
          limitBreak: false,
          sourceEnabled: true,
          enabledByDefault: true,
          noblePhantasmVariant: null,
          sourceActivation: applied.sourceActivation,
        });
      }
    if (action.sourceKind !== 'noblePhantasm') continue;
    const variant = attacker.noblePhantasmVariantGroups
      .flatMap(({ variants }) => variants)
      .find(
        (candidate) =>
          candidate.ref.noblePhantasmId === action.sourceId &&
          candidate.ref.actorFormId.actorId === action.actorFormId.actorId &&
          candidate.ref.actorFormId.limitCount === action.actorFormId.limitCount,
      );
    if (!variant || variant.kind !== 'nonAttack') {
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `preparationNp:${action.sourceId}`,
        detail: 'source_missing',
      });
      continue;
    }
    if (!action.ocUse) {
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `preparationNp:${action.sourceId}`,
        detail: 'missingNpOcReceipt',
      });
      continue;
    }
    const variantKey = noblePhantasmVariantKey(variant.ref);
    for (const applied of action.selectedEffects)
      sources.push({
        phase: 'preparationNoblePhantasm',
        origin: 'np',
        sourceInstanceId: `np:${variantKey}`,
        sourceId: attacker.id,
        sourceName: attacker.name,
        sourceTraits: findActorForm(attacker, action.actorFormId)?.traits ?? attacker.traits,
        skillId: `np:${variantKey}`,
        skillName: variant.name,
        effect: applied.effect,
        valueSetIndex: action.ocUse.effectiveOc - 1,
        valueIndex: input.npLevel - 1,
        limitBreak: false,
        sourceEnabled: true,
        enabledByDefault: true,
        noblePhantasmVariant: variant.ref,
        sourceActivation: applied.sourceActivation,
      });
  }
  sources.push(...auxiliary.sources.filter((source) => source.origin !== 'passive'));
  const npGroup = getBaseNoblePhantasmGroup(attacker);
  const terminalAction = formExecution.actions.at(-1);
  for (const np of npGroup?.variants ?? []) {
    const variantKey = noblePhantasmVariantKey(np.ref);
    for (const effect of np.effects.filter((candidate) => candidate.timing === 'beforeDamage')) {
      const applied = formExecution.actions
        .at(-1)
        ?.selectedEffects.find(
          (candidate) =>
            candidate.occurrenceId === effect.occurrenceId &&
            candidate.sourceId === np.ref.noblePhantasmId,
        );
      sources.push({
        phase: 'beforeNpDamage',
        origin: 'np',
        sourceInstanceId: `np:${variantKey}`,
        sourceId: attacker.id,
        sourceName: attacker.name,
        sourceTraits: findActorForm(attacker, np.ref.actorFormId)?.traits ?? attacker.traits,
        skillId: `np:${variantKey}`,
        skillName: np.name,
        effect,
        valueSetIndex: input.overcharge - 1,
        valueIndex: input.npLevel - 1,
        limitBreak: false,
        sourceEnabled: true,
        enabledByDefault: effect.inclusionPolicy.default === 'include',
        noblePhantasmVariant: np.ref,
        sourceActivation: applied ? applied.sourceActivation : { kind: 'unread' },
        ...(!applied &&
        terminalAction?.sourceKind === 'attackNoblePhantasm' &&
        terminalAction.sourceId === variantKey
          ? {
              runtimeBinding: pendingNoblePhantasmSourceBinding(
                terminalAction,
                `np:${variantKey}`,
                effect.occurrenceId,
                input.npLevel - 1,
              ),
            }
          : {}),
      });
    }
  }
  const markerReaders =
    !sources.some((source) => markerHasOpaqueReads(source.effect)) &&
    sources.some((source) =>
      source.effect.execution.some(
        (operation) => operation.kind === 'buffInstanceMutation' && operation.marker,
      ),
    )
      ? new Set([
          ...sources.flatMap((source) => markerEffectReads(source.effect)),
          ...getNoblePhantasmVariants(attacker).flatMap(terminalMarkerReads),
        ])
      : undefined;
  return {
    sources: sources.map((source) => ({
      ...source,
      ...(() => {
        if (source.runtimeBinding) return {};
        const actionId =
          source.sourceActivation.kind === 'read'
            ? source.sourceActivation.read.clock.actionId
            : null;
        const bindings = formExecution.state.sourceBindings.filter(
          (binding) =>
            (actionId === null || binding.actionId === actionId) &&
            (source.constantFormKey === undefined ||
              actorFormKey(binding.actorFormId) === source.constantFormKey) &&
            binding.sourceInstanceId === source.sourceInstanceId &&
            binding.skillId === source.skillId &&
            binding.occurrenceId === source.effect.occurrenceId,
        );
        if (bindings.length > 1) throw new TypeError('duplicate_source_execution_binding');
        return bindings[0]
          ? { runtimeBinding: bindings[0], sourceActivation: bindings[0].activation }
          : {};
      })(),
      ...(markerReaders
        ? {
            markerReaders,
            markerProgram: sources.map((selected) =>
              JSON.stringify([
                selected.origin,
                selected.sourceInstanceId,
                selected.skillId,
                selected.effect.occurrenceId,
              ]),
            ),
          }
        : {}),
      hpExecutionCommitted:
        formExecution.state.hp?.executedEffects?.includes(hpEffectKey(source)) ?? false,
      battlePointExecutionCommitted: formExecution.state.battlePoints.executedEffects.includes(
        battlePointEffectKey(source),
      ),
      ocExecutionCommitted: formExecution.state.ocState.executedSources.has(
        ocSourceOperationKey(compileOcSourceProgram(source), 0),
      ),
    })),
    issues,
    formExecution,
  };
}
