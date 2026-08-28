import {
  getBaseNoblePhantasmGroup,
  getDefaultInitialActorForm,
  getPassivesForActorForm,
  getSkillsForActorForm,
  findActorForm,
  noblePhantasmVariantKey,
  type NoblePhantasmVariantRef,
  type ActorFormId,
  type MasterDataSnapshot,
  type MasterEffect,
} from '@fgo-lab/master-data';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import type { ExecutionIssue, ExecutionPhase } from './contracts';
import type { Origin } from './effectRouting';
import {
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  type AppliedPreparationAction,
  type PreNoblePhantasmState,
} from './preNoblePhantasm';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export interface SourceEffect {
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
}

export function resolveAttackerFormExecution(
  scenario: ResolvedScenario,
  attacker: MasterDataSnapshot['servants'][number],
): ResolvedAttackerFormExecution {
  const created = createPreNoblePhantasmState(attacker, scenario.attacker.initialActorFormId);
  if (created.status === 'rejected')
    return {
      state: created.state,
      actions: [],
      skillUses: [],
      preparationNoblePhantasms: [],
      issues: [{ kind: 'unsupportedOperation', operationId: 'preparation', detail: created.code }],
    };
  let state = created.state;
  const skillUses: ResolvedAttackerSkillUse[] = [];
  const preparationNoblePhantasms: Array<{
    noblePhantasmVariant: NoblePhantasmVariantRef;
    actorFormId: ActorFormId;
  }> = [];
  const issues: ExecutionIssue[] = [];
  for (const command of scenario.preNoblePhantasmPlan) {
    const actorFormId = state.currentFormId;
    const variantBeforeAction = state.selectedNoblePhantasmVariant;
    const result = reducePreNoblePhantasmAction(attacker, state, command);
    if (result.status === 'rejected') {
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `preparation:${attacker.id}:${command.kind}`,
        detail: result.code,
      });
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
  if (!state.terminated)
    issues.push({
      kind: 'unsupportedOperation',
      operationId: `preparation:${attacker.id}:terminal`,
      detail: 'attack_noble_phantasm_not_executed',
    });
  return { state, actions: state.appliedActions, skillUses, preparationNoblePhantasms, issues };
}

export function collectOperationSources(
  input: DamageResolutionInput,
  scenario: ResolvedScenario,
  master: MasterDataSnapshot,
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
  const appendSkill = (
    origin: Origin,
    phase: ExecutionPhase,
    sourceInstanceId: string,
    sourceId: string,
    skillId: string,
    skillLevel: number,
    sourceEnabled: boolean,
    defaultInclusion: 'master' | 'exclude' = 'master',
    actorFormId?: ActorFormId,
  ) => {
    const servant = master.servants.find((candidate) => candidate.id === sourceId);
    const resolvedActorFormId =
      actorFormId ?? (servant ? getDefaultInitialActorForm(servant)?.id : undefined);
    const available =
      servant && resolvedActorFormId
        ? [
            ...getSkillsForActorForm(servant, resolvedActorFormId),
            ...getPassivesForActorForm(servant, resolvedActorFormId),
          ]
        : [];
    const skill = available.find((candidate) => candidate.id === skillId);
    if (!servant || !skill) {
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `${origin}:${sourceId}:${skillId}`,
        detail: 'source_missing',
      });
      return;
    }
    for (const effect of skill.effects)
      sources.push({
        phase,
        origin,
        sourceInstanceId,
        sourceId,
        sourceName: servant.name,
        sourceTraits: findActorForm(servant, resolvedActorFormId!)?.traits ?? servant.traits,
        skillId,
        skillName: skill.name,
        effect,
        valueSetIndex: 0,
        valueIndex: skillLevel - 1,
        limitBreak: false,
        sourceEnabled,
        enabledByDefault:
          defaultInclusion === 'master' && effect.inclusionPolicy.default === 'include',
        noblePhantasmVariant: null,
      });
  };
  const formExecution = resolveAttackerFormExecution(scenario, attacker);
  issues.push(...formExecution.issues);
  for (const passive of getPassivesForActorForm(attacker, formExecution.state.currentFormId))
    appendSkill(
      'passive',
      'passive',
      `passive:${attacker.id}`,
      attacker.id,
      passive.id,
      1,
      true,
      'master',
      formExecution.state.currentFormId,
    );
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
        valueSetIndex: input.overcharge - 1,
        valueIndex: input.npLevel - 1,
        limitBreak: false,
        sourceEnabled: true,
        enabledByDefault: true,
        noblePhantasmVariant: variant.ref,
      });
  }
  if (scenario.craftEssence) {
    const ce = master.craftEssences.find(
      (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
    );
    if (!ce)
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `craftEssence:${scenario.craftEssence.craftEssenceId}`,
        detail: 'source_missing',
      });
    else
      for (const effect of ce.effects) {
        if (
          effect.availability === 'maximumLimitBreakOnly' &&
          scenario.craftEssence.limitBreak !== 4
        )
          continue;
        sources.push({
          phase: 'craftEssence',
          origin: 'craftEssence',
          sourceInstanceId: `craftEssence:${ce.id}`,
          sourceId: ce.id,
          sourceName: ce.name,
          sourceTraits: [],
          skillId: `ce:${ce.id}`,
          skillName: ce.name,
          effect,
          valueSetIndex: 0,
          valueIndex: 0,
          limitBreak: scenario.craftEssence.limitBreak === 4,
          sourceEnabled: true,
          enabledByDefault: effect.inclusionPolicy.default === 'include',
          noblePhantasmVariant: null,
        });
      }
  }
  if (scenario.support)
    for (const source of scenario.support.composition.sources)
      for (const skill of source.skills)
        appendSkill(
          'support',
          'support',
          source.sourceInstanceId,
          source.servantId,
          skill.skillId,
          skill.skillLevel,
          skill.enabled,
        );
  if (scenario.mysticCode) {
    const code = master.mysticCodes.find(
      (candidate) => candidate.id === scenario.mysticCode?.mysticCodeId,
    );
    if (!code)
      issues.push({
        kind: 'unsupportedOperation',
        operationId: `mysticCode:${scenario.mysticCode.mysticCodeId}`,
        detail: 'source_missing',
      });
    else
      for (const selected of scenario.mysticCode.skills) {
        const skill = code.skills.find((candidate) => candidate.id === selected.skillId);
        if (!skill) {
          issues.push({
            kind: 'unsupportedOperation',
            operationId: `mysticCode:${code.id}:${selected.skillId}`,
            detail: 'source_missing',
          });
          continue;
        }
        for (const effect of skill.effects)
          sources.push({
            phase: 'mysticCode',
            origin: 'mysticCode',
            sourceInstanceId: `mysticCode:${code.id}`,
            sourceId: code.id,
            sourceName: code.name,
            sourceTraits: [],
            skillId: skill.id,
            skillName: skill.name,
            effect,
            valueSetIndex: 0,
            valueIndex: selected.skillLevel - 1,
            limitBreak: false,
            sourceEnabled: selected.enabled,
            enabledByDefault: effect.inclusionPolicy.default === 'include',
            noblePhantasmVariant: null,
          });
      }
  }
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
      });
    }
  }
  return { sources, issues, formExecution };
}
