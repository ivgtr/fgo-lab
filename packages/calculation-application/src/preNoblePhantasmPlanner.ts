import { executeStochasticPossibilities } from '@fgo-lab/battle-execution';
import {
  UnresolvedPreparationPlanningRead,
  availablePreparationSkillCommands,
  availableTransformNoblePhantasmCommand,
  createPreNoblePhantasmState,
  reducePreNoblePhantasmAction,
  servantStackInputs,
  type PreNoblePhantasmState,
  type PreparationExecutionContext,
  type PreparationFailureCode,
} from '@fgo-lab/battle-execution';
import {
  actorFormKey,
  actorFormEquals,
  getDefaultInitialActorForm,
  findActorForm,
  getInitialActorForms,
  noblePhantasmVariantKey,
  type ActorFormId,
  type CanonicalNpResourceSemantics,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { CalculationScenario } from '@fgo-lab/schema';

function preparationPlanningAlternatives<T>(
  context: PreparationExecutionContext,
  run: (context: PreparationExecutionContext) => T,
): T[] {
  const pending: ReadonlyMap<string, boolean>[] = [new Map()];
  const results: T[] = [];
  let branches = 0;
  while (pending.length) {
    if (++branches > 4096) throw new TypeError('hp_structural_branch_limit');
    const choices = pending.pop()!;
    try {
      results.push(
        ...executeStochasticPossibilities((stochasticSelection) =>
          run({ ...context, stochasticSelection, planningConditionChoices: choices }),
        ).executions.map(({ value }) => value),
      );
    } catch (error) {
      if (!(error instanceof UnresolvedPreparationPlanningRead)) throw error;
      pending.push(
        new Map([...choices, [error.key, false]]),
        new Map([...choices, [error.key, true]]),
      );
    }
  }
  return results;
}

const productionPlanCache = new WeakMap<
  ServantMaster,
  Map<string, PlannedPreNoblePhantasmCandidates>
>();

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
  rejectedActionCounts: Readonly<Partial<Record<PreparationFailureCode, number>>>;
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
    requirement: effect.effect.requirement,
    proc: effect.effect.proc,
    sourceActivation: effect.sourceActivation,
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
    battlePoints: state.battlePoints.actors,
    ...(state.buffInstances.length ? { buffInstances: state.buffInstances } : {}),
    stateTraits: {
      attackerState: [...state.stateTraits.attackerState].sort(),
      targetState: [...state.stateTraits.targetState].sort(),
    },
    ...(Object.values(state.stackCounts).some((counts) =>
      Object.values(counts).some((count) => count > 1),
    ) || Object.values(state.stackCounts.field).some((count) => count > 0)
      ? {
          stackCounts: Object.fromEntries(
            Object.entries(state.stackCounts).map(([scope, counts]) => [
              scope,
              Object.entries(counts)
                .filter(([, count]) => count > 0)
                .sort(([left], [right]) => left.localeCompare(right)),
            ]),
          ),
        }
      : {}),
    npResource: state.npResource,
    baseOvercharge: state.baseOvercharge,
    oc: {
      boosts: state.ocState.boosts,
      rates: state.ocState.rates,
      uncertainRates: state.ocState.uncertainRates,
      activeFormKey: state.ocState.activeFormKey,
      sourceOutcomes: [...state.ocState.sourceOutcomes].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      removalResistance: state.ocState.removalResistance,
      uncertainContextWrites: state.uncertainContextWrites,
      constantSources: [...state.ocState.constantSources].sort(),
      receipts: state.ocState.receipts,
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
  context: PreparationExecutionContext,
): readonly PreNoblePhantasmCommand[] {
  const transform = availableTransformNoblePhantasmCommand(servant, state, context);
  return [
    ...availablePreparationSkillCommands(servant, state),
    ...(transform ? [transform] : []),
  ].sort((left, right) => commandKey(left).localeCompare(commandKey(right)));
}

export function planPreNoblePhantasmCandidates(
  servant: ServantMaster,
  resourceSemantics: CanonicalNpResourceSemantics,
  npLevel: PreparationExecutionContext['npLevel'],
  overcharge: PreparationExecutionContext['overcharge'],
  initialGauge: number = resourceSemantics.noblePhantasmUse.requirement,
  canonicalInputValues: Readonly<Record<string, number>> = {},
): PlannedPreNoblePhantasmCandidates {
  const cacheKey = JSON.stringify({
    stochasticSelection: { kind: 'declared' },
    resourceSemantics,
    npLevel,
    overcharge,
    initialGauge,
    canonicalInputValues: Object.entries(canonicalInputValues).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  });
  let servantCache = productionPlanCache.get(servant);
  if (!servantCache) {
    servantCache = new Map();
    productionPlanCache.set(servant, servantCache);
  }
  const cached = servantCache.get(cacheKey);
  if (cached) return cached;
  const context: PreparationExecutionContext = {
    stochasticSelection: { kind: 'declared' },
    planningOnly: true,
    resourceSemantics,
    npLevel,
    initialGauge,
    overcharge,
    canonicalInputValues,
    stackInputs: servantStackInputs(servant),
    battlePointDomains: servant.battlePointDomains ?? [],
  };
  const pending: Array<{
    state: PreNoblePhantasmState;
    commands: readonly PreNoblePhantasmCommand[];
  }> = [];
  for (const form of getInitialActorForms(servant)) {
    for (const created of preparationPlanningAlternatives(context, (branch) =>
      createPreNoblePhantasmState(servant, form.id, branch),
    )) {
      if (created.status === 'rejected') throw new TypeError(created.code);
      pending.push({ state: created.state, commands: [] });
    }
  }
  const visited = new Map<string, readonly PreNoblePhantasmCommand[]>();
  const candidates: PreNoblePhantasmPlanCandidate[] = [];
  let generatedStateCount = 0;
  let exactDuplicateCount = 0;
  let rejectedActionCount = 0;
  const rejectedActionCounts: Partial<Record<PreparationFailureCode, number>> = {};
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
    maximumPreparationActionCount = Math.max(maximumPreparationActionCount, item.commands.length);
    for (const attack of preparationPlanningAlternatives(context, (branch) =>
      reducePreNoblePhantasmAction(
        servant,
        item.state,
        { kind: 'executeAttackNoblePhantasm' },
        branch,
      ),
    )) {
      if (attack.status === 'applied') {
        const commands = [...item.commands, { kind: 'executeAttackNoblePhantasm' as const }];
        candidates.push({
          commands,
          terminalState: attack.state,
          semanticStateKey: preNoblePhantasmSemanticStateKey(attack.state),
        });
      }
    }
    for (const command of preparationCommands(servant, item.state, context)) {
      for (const result of preparationPlanningAlternatives(context, (branch) =>
        reducePreNoblePhantasmAction(servant, item.state, command, branch),
      )) {
        if (result.status === 'rejected') {
          rejectedActionCount += 1;
          rejectedActionCounts[result.code] = (rejectedActionCounts[result.code] ?? 0) + 1;
          continue;
        }
        pending.push({ state: result.state, commands: [...item.commands, command] });
      }
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
      rejectedActionCounts,
      maximumPreparationActionCount,
    },
  };
  servantCache.set(cacheKey, planned);
  return planned;
}

export function defaultPreNoblePhantasmCandidate(
  servant: ServantMaster,
  resourceSemantics: CanonicalNpResourceSemantics,
  npLevel: PreparationExecutionContext['npLevel'],
): PreNoblePhantasmPlanCandidate {
  const defaultForm = getDefaultInitialActorForm(servant);
  if (!defaultForm) throw new TypeError(`default_initial_actor_form_missing:${servant.id}`);
  return defaultPreNoblePhantasmCandidateForInitialForm(
    servant,
    defaultForm.id,
    resourceSemantics,
    npLevel,
  );
}

export function defaultPreNoblePhantasmCandidateForInitialForm(
  servant: ServantMaster,
  initialFormId: ActorFormId,
  resourceSemantics: CanonicalNpResourceSemantics,
  npLevel: PreparationExecutionContext['npLevel'],
): PreNoblePhantasmPlanCandidate {
  const candidates = planPreNoblePhantasmCandidates(
    servant,
    resourceSemantics,
    npLevel,
    1,
  ).candidates.filter(({ terminalState }) =>
    actorFormEquals(terminalState.initialFormId, initialFormId),
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
  resourceSemantics: CanonicalNpResourceSemantics,
  npLevel: PreparationExecutionContext['npLevel'],
): PreNoblePhantasmPlanCandidate {
  const candidates = planPreNoblePhantasmCandidates(
    servant,
    resourceSemantics,
    npLevel,
    1,
  ).candidates.filter(({ terminalState }) =>
    actorFormEquals(terminalState.initialFormId, initialFormId),
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
    return defaultPreNoblePhantasmCandidateForInitialForm(
      servant,
      initialFormId,
      resourceSemantics,
      npLevel,
    );
  return explicitBaseVariantCandidates.sort(
    (left, right) =>
      right.terminalState.usedSkillSlots.size - left.terminalState.usedSkillSlots.size ||
      planKey(left.commands).localeCompare(planKey(right.commands)),
  )[0]!;
}

export function defaultCalculatorPreNoblePhantasmCandidate(
  servant: ServantMaster,
  resourceSemantics: CanonicalNpResourceSemantics,
  npLevel: PreparationExecutionContext['npLevel'],
): PreNoblePhantasmPlanCandidate {
  const defaultForm = getDefaultInitialActorForm(servant);
  if (!defaultForm) throw new TypeError(`default_initial_actor_form_missing:${servant.id}`);
  return defaultCalculatorPreNoblePhantasmCandidateForInitialForm(
    servant,
    defaultForm.id,
    resourceSemantics,
    npLevel,
  );
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
