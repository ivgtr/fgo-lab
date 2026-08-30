import {
  availablePreparationSkillCommands,
  availableTransformNoblePhantasmCommand,
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  type PreNoblePhantasmState,
} from '@fgo-lab/battle-execution';
import {
  actorFormKey,
  actorFormEquals,
  getDefaultInitialActorForm,
  findActorForm,
  getInitialActorForms,
  noblePhantasmVariantKey,
  type ActorFormId,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { CalculationScenario } from '@fgo-lab/schema';

const MAX_SEMANTIC_STATES_PER_SERVANT = 512;
const productionPlanCache = new WeakMap<ServantMaster, PlannedPreNoblePhantasmCandidates>();

export interface PreNoblePhantasmPlanCandidate {
  commands: readonly PreNoblePhantasmCommand[];
  terminalState: PreNoblePhantasmState;
  semanticStateKey: string;
}

export interface PreNoblePhantasmPlanInventory {
  generatedStateCount: number;
  deduplicatedStateCount: number;
  terminalPlanCount: number;
  exactDuplicateCount: number;
  rejectedActionCount: number;
  maximumPreparationActionCount: number;
}

export interface PlannedPreNoblePhantasmCandidates {
  candidates: readonly PreNoblePhantasmPlanCandidate[];
  inventory: PreNoblePhantasmPlanInventory;
}

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

function canonicalEffectKey(effect: PreNoblePhantasmState['activeEffects'][number]): string {
  return JSON.stringify({
    sourceKind: effect.sourceKind,
    sourceId: effect.sourceId,
    actorFormId: actorFormKey(effect.actorFormId),
    occurrenceId: effect.occurrenceId,
    execution: effect.effect.execution,
    selection: effect.effect.selection,
    conditions: effect.effect.conditions,
    quantityConditions: effect.effect.quantityConditions,
    sourceQuantityConditions: effect.effect.sourceQuantityConditions,
    inputQuantityConditions: effect.effect.inputQuantityConditions,
    proc: effect.effect.proc,
  });
}

export function preNoblePhantasmSemanticStateKey(state: PreNoblePhantasmState): string {
  return JSON.stringify({
    initialForm: actorFormKey(state.initialFormId),
    currentForm: actorFormKey(state.currentFormId),
    selectedVariant: state.selectedNoblePhantasmVariant
      ? noblePhantasmVariantKey(state.selectedNoblePhantasmVariant)
      : null,
    usedSkillSlots: [...state.usedSkillSlots].sort((left, right) => left - right),
    transformNoblePhantasmUsed: state.transformNoblePhantasmUsed,
    activeEffects: state.activeEffects.map(canonicalEffectKey).sort(),
    stateTraits: {
      attackerState: [...state.stateTraits.attackerState].sort(),
      targetState: [...state.stateTraits.targetState].sort(),
    },
    choices: state.appliedActions
      .flatMap(({ command }) =>
        command.kind === 'useSkillSlot' && command.choice
          ? [`${command.slot}:${command.choice.groupKey}:${command.choice.candidateKey}`]
          : [],
      )
      .sort(),
    terminated: state.terminated,
  });
}

function commandKey(command: PreNoblePhantasmCommand): string {
  return JSON.stringify(command);
}

function planKey(commands: readonly PreNoblePhantasmCommand[]): string {
  return commands.map(commandKey).join('|');
}

function preparationCommands(
  servant: ServantMaster,
  state: PreNoblePhantasmState,
): readonly PreNoblePhantasmCommand[] {
  const transform = availableTransformNoblePhantasmCommand(servant, state);
  return [
    ...availablePreparationSkillCommands(servant, state),
    ...(transform ? [transform] : []),
  ].sort((left, right) => commandKey(left).localeCompare(commandKey(right)));
}

export function planPreNoblePhantasmCandidates(
  servant: ServantMaster,
): PlannedPreNoblePhantasmCandidates {
  const cached = productionPlanCache.get(servant);
  if (cached) return cached;
  const pending: Array<{
    state: PreNoblePhantasmState;
    commands: readonly PreNoblePhantasmCommand[];
  }> = [];
  for (const form of getInitialActorForms(servant)) {
    const created = createPreNoblePhantasmState(servant, form.id);
    if (created.status === 'rejected') throw new TypeError(created.code);
    pending.push({ state: created.state, commands: [] });
  }
  const visited = new Map<string, readonly PreNoblePhantasmCommand[]>();
  const candidates: PreNoblePhantasmPlanCandidate[] = [];
  let generatedStateCount = 0;
  let exactDuplicateCount = 0;
  let rejectedActionCount = 0;
  let maximumPreparationActionCount = 0;
  while (pending.length > 0) {
    const item = pending.shift()!;
    generatedStateCount += 1;
    const stateKey = preNoblePhantasmSemanticStateKey(item.state);
    const existing = visited.get(stateKey);
    if (existing) {
      exactDuplicateCount += 1;
      if (planKey(existing).localeCompare(planKey(item.commands)) <= 0) continue;
    }
    visited.set(stateKey, item.commands);
    if (visited.size > MAX_SEMANTIC_STATES_PER_SERVANT)
      throw new RangeError(`pre_noble_phantasm_state_limit:${servant.id}`);
    maximumPreparationActionCount = Math.max(maximumPreparationActionCount, item.commands.length);
    const attack = reducePreNoblePhantasmAction(servant, item.state, {
      kind: 'executeAttackNoblePhantasm',
    });
    if (attack.status === 'applied') {
      const commands = [...item.commands, { kind: 'executeAttackNoblePhantasm' as const }];
      candidates.push({
        commands,
        terminalState: attack.state,
        semanticStateKey: preNoblePhantasmSemanticStateKey(attack.state),
      });
    }
    for (const command of preparationCommands(servant, item.state)) {
      const result = reducePreNoblePhantasmAction(servant, item.state, command);
      if (result.status === 'rejected') {
        rejectedActionCount += 1;
        continue;
      }
      pending.push({ state: result.state, commands: [...item.commands, command] });
    }
  }
  const stableCandidates = [
    ...new Map(
      candidates
        .sort((left, right) => planKey(left.commands).localeCompare(planKey(right.commands)))
        .map((candidate) => [candidate.semanticStateKey, candidate]),
    ).values(),
  ];
  const planned = {
    candidates: stableCandidates,
    inventory: {
      generatedStateCount,
      deduplicatedStateCount: visited.size,
      terminalPlanCount: stableCandidates.length,
      exactDuplicateCount,
      rejectedActionCount,
      maximumPreparationActionCount,
    },
  };
  productionPlanCache.set(servant, planned);
  return planned;
}

export function defaultPreNoblePhantasmCandidate(
  servant: ServantMaster,
): PreNoblePhantasmPlanCandidate {
  const defaultForm = getDefaultInitialActorForm(servant);
  if (!defaultForm) throw new TypeError(`default_initial_actor_form_missing:${servant.id}`);
  return defaultPreNoblePhantasmCandidateForInitialForm(servant, defaultForm.id);
}

export function defaultPreNoblePhantasmCandidateForInitialForm(
  servant: ServantMaster,
  initialFormId: ActorFormId,
): PreNoblePhantasmPlanCandidate {
  const candidates = planPreNoblePhantasmCandidates(servant).candidates.filter(
    ({ terminalState }) => actorFormEquals(terminalState.initialFormId, initialFormId),
  );
  if (candidates.length === 0)
    throw new TypeError(`default_preparation_plan_missing:${servant.id}`);
  const minimumTransformNpCount = Math.min(
    ...candidates.map(
      ({ commands }) => commands.filter(({ kind }) => kind === 'useTransformNoblePhantasm').length,
    ),
  );
  const minimumChoiceCount = Math.min(
    ...candidates
      .filter(
        ({ commands }) =>
          commands.filter(({ kind }) => kind === 'useTransformNoblePhantasm').length ===
          minimumTransformNpCount,
      )
      .map(
        ({ commands }) =>
          commands.filter((command) => command.kind === 'useSkillSlot' && command.choice !== null)
            .length,
      ),
  );
  const selected = candidates
    .filter(
      ({ commands }) =>
        commands.filter(({ kind }) => kind === 'useTransformNoblePhantasm').length ===
          minimumTransformNpCount &&
        commands.filter((command) => command.kind === 'useSkillSlot' && command.choice !== null)
          .length === minimumChoiceCount,
    )
    .sort((left, right) => {
      const leftSlots = left.terminalState.usedSkillSlots.size;
      const rightSlots = right.terminalState.usedSkillSlots.size;
      return (
        rightSlots - leftSlots || planKey(left.commands).localeCompare(planKey(right.commands))
      );
    })[0];
  if (!selected) throw new TypeError(`default_preparation_plan_missing:${servant.id}`);
  return selected;
}

export function defaultCalculatorPreNoblePhantasmCandidateForInitialForm(
  servant: ServantMaster,
  initialFormId: ActorFormId,
): PreNoblePhantasmPlanCandidate {
  const candidates = planPreNoblePhantasmCandidates(servant).candidates.filter(
    ({ terminalState }) => actorFormEquals(terminalState.initialFormId, initialFormId),
  );
  const minimumTransformNpCount = Math.min(
    ...candidates.map(
      ({ commands }) => commands.filter(({ kind }) => kind === 'useTransformNoblePhantasm').length,
    ),
  );
  const explicitBaseVariantCandidates = candidates.filter(({ commands, terminalState }) => {
    if (
      commands.filter(({ kind }) => kind === 'useTransformNoblePhantasm').length !==
      minimumTransformNpCount
    )
      return false;
    const baseVariant = findActorForm(
      servant,
      terminalState.currentFormId,
    )?.baseNoblePhantasmVariant;
    const selectedVariant = terminalState.selectedNoblePhantasmVariant;
    return (
      baseVariant !== null &&
      baseVariant !== undefined &&
      selectedVariant !== null &&
      noblePhantasmVariantKey(baseVariant) === noblePhantasmVariantKey(selectedVariant) &&
      terminalState.appliedActions.some((action) =>
        action.selectedEffects.some((selected) =>
          selected.effect.execution.some(
            (operation) => operation.kind === 'selectNoblePhantasmVariant',
          ),
        ),
      )
    );
  });
  if (explicitBaseVariantCandidates.length === 0)
    return defaultPreNoblePhantasmCandidateForInitialForm(servant, initialFormId);
  return explicitBaseVariantCandidates.sort(
    (left, right) =>
      right.terminalState.usedSkillSlots.size - left.terminalState.usedSkillSlots.size ||
      planKey(left.commands).localeCompare(planKey(right.commands)),
  )[0]!;
}

export function defaultCalculatorPreNoblePhantasmCandidate(
  servant: ServantMaster,
): PreNoblePhantasmPlanCandidate {
  const defaultForm = getDefaultInitialActorForm(servant);
  if (!defaultForm) throw new TypeError(`default_initial_actor_form_missing:${servant.id}`);
  return defaultCalculatorPreNoblePhantasmCandidateForInitialForm(servant, defaultForm.id);
}

export function materializePreNoblePhantasmPlan(
  scenario: ResolvedScenario,
  candidate: PreNoblePhantasmPlanCandidate,
): ResolvedScenario {
  return {
    ...scenario,
    attacker: {
      ...scenario.attacker,
      initialActorFormId: candidate.terminalState.initialFormId,
    },
    preNoblePhantasmPlan: [...candidate.commands],
  };
}
