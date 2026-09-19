import { hpEffectKey } from './preparationHp';
import { markerEffectReads, terminalMarkerReads, markerHasOpaqueReads } from './markerDependency';
import { getNoblePhantasmVariants } from '@fgo-lab/master-data';
import { actorFormKey, resolveInitialMaximumHp } from '@fgo-lab/master-data';
import { preparationTargetFacts } from './preparationTargetFacts';
import { compileOcSourceProgram } from './ocSourceProgram';
import { ocSourceOperationKey } from './ocSourceBinding';
import { collectAuxiliarySources } from './auxiliarySources';
import { servantStackInputs } from './stackQuantities';
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
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import type { ExecutionIssue, ExecutionPhase } from './contracts';
import type { Origin } from './effectRouting';
import {
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  type AppliedPreparationAction,
  type PreNoblePhantasmState,
  type PreparationExecutionContext,
  type PreparationFailureCode,
} from './preNoblePhantasm';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface SourceEffect {
  markerReaders?: ReadonlySet<string>;
  markerProgram?: readonly string[];
  hpExecutionCommitted?: boolean;
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
  preparationStochasticOutcome: 'success' | 'failure' | null;
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
  requiredInputs: readonly (CanonicalInputDefinition & { effectOccurrenceIds: string[] })[];
  recoveryInputDefinitions?: readonly CanonicalInputDefinition[];
  rejection: { code: PreparationFailureCode; operationId: string } | null;
}

export function resolveAttackerFormExecution(
  scenario: ResolvedScenario,
  attacker: MasterDataSnapshot['servants'][number],
  resourceSemantics: CanonicalNpResourceSemantics,
  initialGauge: number = scenario.initialOvercharge *
    resourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
  options: {
    master?: MasterDataSnapshot;
    initialMaximumHp?: number;
    policy?: PreparationExecutionContext['policy'];
  } = {},
): ResolvedAttackerFormExecution {
  const auxiliary = options.master
    ? collectAuxiliarySources(scenario, options.master, scenario.attacker.initialActorFormId)
    : null;
  const resolvedHp =
    options.master && options.initialMaximumHp === undefined
      ? resolveInitialMaximumHp(scenario, options.master)
      : null;
  const maximum =
    options.initialMaximumHp ??
    (resolvedHp?.status === 'resolved' ? resolvedHp.maximum : undefined);
  const context: PreparationExecutionContext = {
    ...(maximum === undefined ? {} : { initialMaximumHp: maximum }),
    ...(options.master
      ? {
          maximumHpByForm: new Map(
            attacker.actorFormGraph.forms.flatMap((form) => {
              const initialForm = findActorForm(attacker, scenario.attacker.initialActorFormId);
              if (
                maximum !== undefined &&
                (actorFormKey(form.id) === actorFormKey(scenario.attacker.initialActorFormId) ||
                  (form.baseHp.kind === 'lineage' && initialForm?.baseHp.kind === 'lineage'))
              )
                return [[actorFormKey(form.id), maximum] as const];
              const hp = resolveInitialMaximumHp(
                { ...scenario, attacker: { ...scenario.attacker, initialActorFormId: form.id } },
                options.master!,
              );
              return hp.status === 'resolved' ? [[actorFormKey(form.id), hp.maximum] as const] : [];
            }),
          ),
        }
      : {}),
    attackerPredicates:
      options.master?.targetSemantics.execution.classIdentities.map((classId) => ({
        sourceKey: 'initial:attackerClass',
        predicate: { kind: 'classIdentity' as const, classId },
        present: attacker.predicates.some(
          (predicate) => predicate.kind === 'classIdentity' && predicate.classId === classId,
        ),
      })) ?? [],
    worldFacts: scenario.worldFactAssertions,
    targetPredicates: options.master
      ? preparationTargetFacts(
          attacker,
          scenario.targetContext,
          options.master.targetSemantics.execution,
        )
      : [],
    activationFacts: scenario.activationFacts,
    ...(options.policy ? { policy: options.policy } : {}),
    initialSources:
      auxiliary?.sources.filter(
        (source) =>
          source.origin === 'craftEssence' ||
          (source.origin === 'support' && source.effect.gameActivation === 'constant'),
      ) ?? [],
    terminalSources:
      auxiliary?.sources.filter(
        (source) =>
          (source.origin === 'support' && source.effect.gameActivation !== 'constant') ||
          source.origin === 'mysticCode',
      ) ?? [],
    stackInputs: servantStackInputs(attacker),
    resourceSemantics,
    npLevel: scenario.attacker.npLevel as PreparationExecutionContext['npLevel'],
    initialGauge,
    overcharge: scenario.initialOvercharge,
    canonicalInputValues: Object.fromEntries(
      Object.entries(scenario.canonicalInputValues).map(([key, value]) => [key, value.value]),
    ),
    ...(scenario.attackerHpPermille === null
      ? {}
      : { attackerHpPermille: scenario.attackerHpPermille }),
    battlePointPhase: scenario.battleState.battlePointPhase,
  };
  const created = createPreNoblePhantasmState(
    attacker,
    scenario.attacker.initialActorFormId,
    context,
  );
  if (created.status === 'rejected')
    return {
      state: created.state,
      actions: [],
      skillUses: [],
      preparationNoblePhantasms: [],
      requiredInputs:
        created.requiredInput && created.requiredInputEffectOccurrenceId
          ? [
              {
                ...created.requiredInput,
                effectOccurrenceIds: [created.requiredInputEffectOccurrenceId],
              },
            ]
          : [],
      ...(created.recoveryInputDefinitions?.length
        ? { recoveryInputDefinitions: created.recoveryInputDefinitions }
        : {}),
      rejection: { code: created.code, operationId: 'preparation:create' },
      issues: [{ kind: 'unsupportedOperation', operationId: 'preparation', detail: created.code }],
    };
  let state = created.state;
  const skillUses: ResolvedAttackerSkillUse[] = [];
  const preparationNoblePhantasms: Array<{
    noblePhantasmVariant: NoblePhantasmVariantRef;
    actorFormId: ActorFormId;
  }> = [];
  const issues: ExecutionIssue[] = [];
  const requiredInputs: Array<CanonicalInputDefinition & { effectOccurrenceIds: string[] }> = [];
  let rejection: ResolvedAttackerFormExecution['rejection'] = null;
  let recoveryInputDefinitions: readonly CanonicalInputDefinition[] = [];
  for (const command of scenario.preNoblePhantasmPlan) {
    const actorFormId = state.currentFormId;
    const variantBeforeAction = state.selectedNoblePhantasmVariant;
    const result = reducePreNoblePhantasmAction(attacker, state, command, context);
    if (result.status === 'rejected') {
      recoveryInputDefinitions = result.recoveryInputDefinitions ?? [];
      if (
        result.code === 'preparationInputRequired' &&
        result.requiredInput &&
        result.requiredInputEffectOccurrenceId
      )
        requiredInputs.push({
          ...result.requiredInput,
          effectOccurrenceIds: [result.requiredInputEffectOccurrenceId],
        });
      rejection = {
        code: result.code,
        operationId: `preparation:${attacker.id}:${command.kind}`,
      };
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
    state,
    actions: state.appliedActions,
    skillUses,
    preparationNoblePhantasms,
    issues,
    requiredInputs,
    ...(recoveryInputDefinitions.length ? { recoveryInputDefinitions } : {}),
    rejection,
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
  if (formExecution.rejection)
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
          preparationStochasticOutcome: applied.stochasticOutcome,
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
        preparationStochasticOutcome: applied.stochasticOutcome,
      });
  }
  sources.push(...auxiliary.sources.filter((source) => source.origin !== 'passive'));
  const npGroup = getBaseNoblePhantasmGroup(attacker);
  for (const np of npGroup?.variants ?? []) {
    const variantKey = noblePhantasmVariantKey(np.ref);
    for (const effect of np.effects.filter((candidate) => candidate.timing === 'beforeDamage')) {
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
        preparationStochasticOutcome:
          formExecution.actions
            .at(-1)
            ?.selectedEffects.find(
              (applied) =>
                applied.occurrenceId === effect.occurrenceId &&
                applied.sourceId === np.ref.noblePhantasmId,
            )?.stochasticOutcome ?? null,
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
      preparationStochasticOutcome:
        formExecution.state.ocState.sourceOutcomes.get(
          ocSourceOperationKey(compileOcSourceProgram(source), 0),
        ) ?? source.preparationStochasticOutcome,
      hpExecutionCommitted:
        formExecution.state.hp?.executedEffects?.includes(hpEffectKey(source)) ?? false,
      ocExecutionCommitted: formExecution.state.ocState.executedSources.has(
        ocSourceOperationKey(compileOcSourceProgram(source), 0),
      ),
    })),
    issues,
    formExecution,
  };
}
