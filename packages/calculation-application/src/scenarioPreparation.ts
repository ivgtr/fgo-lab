import {
  prepareDiagnosticOrderedScenario,
  executeDiagnosticOrderedScenarioWithAuditObservation,
  battlePointPhaseCandidates,
  type ResolvedAttackerFormExecution,
} from '@fgo-lab/battle-execution';
import { canonicalRequirementLeaves, findActorForm } from '@fgo-lab/master-data';
import { resolveCanonicalInputValues } from './canonicalInputs';
import type { RejectedCalculationDiagnostic, BattlePointIntentIssue } from './scenario';
import type {
  PreparationExecutionSession,
  PreparationActionExecution,
  ContributionApplicationPolicy,
  BattlePointState,
  PreparationStateSnapshot,
} from '@fgo-lab/battle-execution';
import {
  resolveAttackerFormExecution,
  completedPreparationStateFor,
  battlePointPhase,
  readBattlePoint,
} from '@fgo-lab/battle-execution';
import { preparationOcAttemptsFor } from '@fgo-lab/battle-execution/preparation-audit';
import {
  classAttackRate,
  resolveAttributeAffinity,
  resolveClassAffinity,
  servantAttribute,
} from '@fgo-lab/calc-core';
import {
  deriveCraftEssenceAtk,
  deriveNpMultipliers,
  findNoblePhantasmVariant,
  type MasterDataSnapshot,
  type ServantMaster,
  type NoblePhantasmVariant,
} from '@fgo-lab/master-data';
import type { CalculationScenario, DamageResolutionInput } from '@fgo-lab/schema';
import {
  battlePointPreparationRejectionObservationFor,
  type BattlePointPreparationObservation,
} from './battlePointPreparationObservation';
import { resolveInitialMaximumHp } from './initialHp';
import type { CalculationPreparationOptions, ScenarioPreparationOutcome } from './scenario';

type ResolvedCalculationScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function damageResolutionInputForNoblePhantasm(
  scenario: ResolvedCalculationScenario,
  servant: ServantMaster,
  noblePhantasm: Extract<NoblePhantasmVariant, { kind: 'attack' }>,
  master: MasterDataSnapshot,
  attackerAtk: number,
  effectiveOvercharge: number,
  battlePoints?: BattlePointState,
  observation?: BattlePointPreparationObservation,
): DamageResolutionInput {
  const damage = noblePhantasm.damage[0];
  if (!damage) throw new TypeError(`attack_np_damage_missing:${servant.id}`);
  const craftEssence = scenario.craftEssence
    ? master.craftEssences.find(
        (candidate) => candidate.id === scenario.craftEssence?.craftEssenceId,
      )
    : undefined;
  const parameter =
    damage.kind === 'battlePointPhase' && battlePoints
      ? damage.parametersByOvercharge[effectiveOvercharge - 1]?.[scenario.attacker.npLevel - 1]
      : undefined;
  const domain =
    damage.kind === 'battlePointPhase' && battlePoints
      ? master.battlePointDomains.find((candidate) => candidate.id === String(parameter?.targetId))
      : undefined;
  const value =
    domain && battlePoints ? readBattlePoint(battlePoints, 'attacker', domain.id) : undefined;
  const phase =
    damage.kind === 'battlePointPhase' && battlePoints
      ? domain
        ? battlePointPhase(domain, value)
        : null
      : scenario.battleState.battlePointPhase;
  const input: DamageResolutionInput = {
    attackerId: servant.id,
    attackerLevel: scenario.attacker.level,
    attackerAtk,
    fouAtk: scenario.explicitOverrides.fouAtk ?? scenario.attacker.fouAtk,
    craftEssenceId: scenario.craftEssence?.craftEssenceId ?? null,
    craftEssenceAtk:
      scenario.explicitOverrides.craftEssenceAtk ??
      (craftEssence && scenario.craftEssence
        ? deriveCraftEssenceAtk(
            craftEssence,
            scenario.craftEssence.level,
            scenario.craftEssence.limitBreak,
          )
        : 0),
    npLevel: scenario.attacker.npLevel,
    overcharge: effectiveOvercharge,
    npMultipliers: deriveNpMultipliers(damage, effectiveOvercharge),
    damageFunction: { status: 'resolved', kind: damage.kind, ignoreDefense: false },
    cardType: noblePhantasm.card,
    classAttackRate:
      scenario.explicitOverrides.classAttackRate ??
      classAttackRate(servant.classId, master.combatRules),
    classAffinity: resolveClassAffinity(
      servant.classId,
      scenario.targetContext.class,
      master.combatRules,
    ),
    attributeAffinity: resolveAttributeAffinity(
      servantAttribute(servant.traits),
      scenario.targetContext.attribute,
      master.combatRules,
    ),
    attackBuff: 0,
    defenseBuff: scenario.enemyDefenseBuff,
    cardBuff: 0,
    cardResistance: 0,
    npDamageBuff: 0,
    npResistance: 0,
    powerMod: 0,
    eventDamageBuff: 0,
    npSpecialMultipliers: [1, 1, 1, 1, 1],
    specialDamageBuff: 0,
    specialResistance: 0,
    flatDamage: 0,
    damageCut: 0,
    ignoreDamageCut: false,
    fieldTraits: [],
    attackerStateTraits: [],
    attackerHpPermille: scenario.attackerHpPermille,
    targetRarity: null,
    targetStateTraits: [],
    battlePointPhase: phase,
    target: {
      classId:
        scenario.targetContext.class.kind === 'concrete'
          ? scenario.targetContext.class.classId
          : null,
      attribute:
        scenario.targetContext.attribute.kind === 'concrete'
          ? scenario.targetContext.attribute.attribute
          : 'unknown',
      traits: [],
    },
  };
  if (observation) {
    const capture = battlePointPreparationRejectionObservationFor(observation);
    if (capture) capture.damageInputGenerated = input;
  }
  if (observation && damage.kind === 'battlePointPhase' && battlePoints && parameter)
    observation.conversion = { state: battlePoints, domain, value, phase, input, parameter };
  return input;
}

export function resolveScenarioPreparationOutcome(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  preparation: CalculationPreparationOptions = {},
  policy: ContributionApplicationPolicy = { kind: 'calculator' },
  observation?: BattlePointPreparationObservation,
  executionSession?: PreparationExecutionSession,
): ScenarioPreparationOutcome {
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant) throw new TypeError(`scenario_attacker_missing:${scenario.attacker.servantId}`);
  const canonicalAttackerAtk = servant.atkByLevel[String(scenario.attacker.level)];
  if (canonicalAttackerAtk === undefined)
    return {
      status: 'invalid',
      issue: {
        kind: 'attackerLevelStatUnavailable',
        servantId: servant.id,
        level: scenario.attacker.level,
      },
    };
  const assertedHp = scenario.worldFactAssertions.flatMap(({ fact }) =>
    fact.kind === 'quantity' && fact.quantity === 'attackerHpPermille' ? [fact.value] : [],
  );
  const initialIntents = [
    ...new Set([
      ...(scenario.attackerHpPermille === null ? [] : [scenario.attackerHpPermille]),
      ...assertedHp,
    ]),
  ];
  if (initialIntents.length > 1)
    return {
      status: 'invalid',
      issue: {
        kind: 'initialHpUnavailable',
        servantId: servant.id,
        level: scenario.attacker.level,
        source: 'servant',
        reason: 'conflictingInitialIntent',
      },
    };
  if (scenario.attackerHpPermille === null && initialIntents.length === 1)
    scenario = { ...scenario, attackerHpPermille: initialIntents[0]! };
  const initialHp = resolveInitialMaximumHp(scenario, master);
  if (initialHp.status === 'invalid') return initialHp;
  const attackerAtk = scenario.explicitOverrides.attackerAtk ?? canonicalAttackerAtk;
  const formExecution = resolveAttackerFormExecution(
    scenario,
    servant,
    master.npResourceSemantics,
    preparation.initialNpGauge,
    {
      master,
      ...(executionSession ? { executionSession } : {}),
      policy,
      diagnoseRejectedActions: true,
      ...(preparation.stochasticSelection
        ? { stochasticSelection: preparation.stochasticSelection }
        : {}),
      ...(observation
        ? {
            observePreparationTransition: (
              before: PreparationStateSnapshot,
              command: PreparationActionExecution['command'],
              result: PreparationActionExecution,
            ) => {
              battlePointPreparationRejectionObservationFor(observation)?.transitions.push({
                before,
                command,
                result,
                attempts: preparationOcAttemptsFor(result),
              });
              observation.transitions = [
                ...observation.transitions,
                {
                  before: {
                    battlePoints: before.battlePoints,
                    appliedActionCount: before.appliedActions.length,
                  },
                  command,
                  result: {
                    status: result.status,
                    state: {
                      battlePoints: result.state.battlePoints,
                      appliedActions: result.state.appliedActions,
                    },
                  },
                },
              ];
            },
          }
        : {}),
      ...(preparation.initialOvercharge === undefined
        ? {}
        : { initialOvercharge: preparation.initialOvercharge }),
      initialMaximumHp: initialHp.maximum,
      ...(preparation.initialBattlePointPoints
        ? { initialBattlePointPoints: preparation.initialBattlePointPoints }
        : {}),
    },
  );
  const selected = formExecution.state.selectedNoblePhantasmVariant
    ? findNoblePhantasmVariant(servant, formExecution.state.selectedNoblePhantasmVariant)
    : undefined;
  if (formExecution.rejection || formExecution.issues.length > 0) {
    const rejection = formExecution.rejection ?? {
      code: 'invalidPreparationActivation' as const,
      operationId: 'preparation:source-collection',
    };
    return {
      status: 'rejected',
      rejection,
      requiredInputs: formExecution.requiredInputs.map(({ definition, effectOccurrenceIds }) => ({
        ...definition,
        effectOccurrenceIds,
      })),
      ...(formExecution.recoveryInputDefinitions
        ? { recoveryInputDefinitions: formExecution.recoveryInputDefinitions }
        : {}),
      appliedPreparationActions: formExecution.actions,
      ...(formExecution.diagnostic ? { diagnostic: formExecution.diagnostic } : {}),
      formExecution,
    };
  }
  if (selected?.kind !== 'attack')
    return {
      status: 'rejected',
      rejection: {
        code: 'attackNoblePhantasmUnavailable',
        operationId: `preparation:${servant.id}:terminal`,
      },
      requiredInputs: [],
      appliedPreparationActions: formExecution.actions,
      formExecution,
    };
  return {
    status: 'executable',
    initialMaximumHp: initialHp.maximum,
    input: damageResolutionInputForNoblePhantasm(
      scenario,
      servant,
      selected,
      master,
      attackerAtk,
      completedPreparationStateFor(formExecution).ocState.receipts.at(-1)!.effectiveOc,
      completedPreparationStateFor(formExecution).battlePoints,
      observation,
    ),
    formExecution,
  };
}
export function prepareRejectedCalculationDiagnostic(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
  formExecution: ResolvedAttackerFormExecution,
  policy: ContributionApplicationPolicy,
  options: CalculationPreparationOptions,
): RejectedCalculationDiagnostic | undefined {
  const preparation = formExecution.diagnostic;
  if (!preparation || !preparation.state.terminated) return undefined;
  if (!formExecution.actionExecutions)
    throw new TypeError('diagnostic_normal_action_receipts_missing');
  const servant = master.servants.find(({ id }) => id === scenario.attacker.servantId);
  if (!servant) throw new TypeError('diagnostic_servant_missing');
  const ref = preparation.state.selectedNoblePhantasmVariant;
  const variant = ref && findNoblePhantasmVariant(servant, ref);
  const receipt = preparation.state.ocState.receipts.at(-1);
  if (!variant || variant.kind !== 'attack' || !receipt)
    throw new TypeError('diagnostic_terminal_np_receipt_missing');
  const atk =
    scenario.explicitOverrides.attackerAtk ?? servant.atkByLevel[String(scenario.attacker.level)];
  if (atk === undefined) throw new TypeError('diagnostic_attacker_stat_missing');
  const input = damageResolutionInputForNoblePhantasm(
    scenario,
    servant,
    variant,
    master,
    atk,
    receipt.effectiveOc,
    preparation.state.battlePoints,
  );
  const orderedScenario = prepareDiagnosticOrderedScenario(input, scenario, master, formExecution);
  const canonicalInputs = resolveCanonicalInputValues(
    orderedScenario.inputDefinitions,
    scenario.canonicalInputValues,
  );
  const observed = executeDiagnosticOrderedScenarioWithAuditObservation(
    orderedScenario,
    canonicalInputs,
    policy,
  );
  return {
    kind: 'rejectedCalculationDiagnostic',
    preparation,
    normalActions: formExecution.actionExecutions,
    orderedScenario,
    canonicalInputs,
    execution: observed.execution,
    executionObservation: {
      battlePointWitness: options.initialBattlePointPoints ?? null,
      targetExecution: observed.observation,
    },
  };
}

export function battlePointWitnesses(
  scenario: ResolvedCalculationScenario,
  master: MasterDataSnapshot,
):
  | { status: 'ready'; witnesses: Readonly<Record<string, number>>[] }
  | {
      status: 'invalid';
      issue: BattlePointIntentIssue;
    } {
  const phase = scenario.battleState.battlePointPhase;
  if (phase === null) return { status: 'ready', witnesses: [{}] };
  const servant = master.servants.find((candidate) => candidate.id === scenario.attacker.servantId);
  if (!servant || !(servant.battlePointDomains?.length ?? 0))
    return { status: 'ready', witnesses: [{}] };
  const invalid = (detail: BattlePointIntentIssue['detail']) => ({
    status: 'invalid' as const,
    issue: {
      kind: 'invalidBattlePointIntent' as const,
      servantId: scenario.attacker.servantId,
      level: scenario.attacker.level,
      detail,
    },
  });
  const referenced = new Set<string>();
  const collectRequirementDomains = (
    effect: MasterDataSnapshot['servants'][number]['skills'][number]['effects'][number],
  ) => {
    for (const leaf of canonicalRequirementLeaves(effect.requirement.expression))
      if (
        (leaf.kind === 'quantity' && leaf.quantity === 'battlePointPhase') ||
        leaf.kind === 'sourceQuantity'
      )
        if (leaf.subjectId !== undefined) referenced.add(leaf.subjectId);
  };
  for (const variant of servant.noblePhantasmVariantGroups.flatMap((group) => group.variants)) {
    if (variant.kind === 'attack')
      for (const damage of variant.damage)
        if (damage.kind === 'battlePointPhase')
          for (const row of damage.parametersByOvercharge)
            for (const cell of row)
              if (cell.targetId !== undefined) referenced.add(String(cell.targetId));
    for (const effect of variant.effects) {
      collectRequirementDomains(effect);
      for (const operation of effect.execution)
        if (
          operation.kind === 'battlePointCapacityModifier' ||
          (operation.kind === 'resourceMutation' && operation.resource === 'battlePoint')
        )
          if (operation.subjectId !== null) referenced.add(operation.subjectId);
    }
  }
  for (const effect of [...servant.skills, ...servant.passives].flatMap((skill) => skill.effects)) {
    collectRequirementDomains(effect);
    for (const operation of effect.execution)
      if (
        operation.kind === 'battlePointCapacityModifier' ||
        (operation.kind === 'resourceMutation' && operation.resource === 'battlePoint')
      )
        if (operation.subjectId !== null) referenced.add(operation.subjectId);
  }
  if (referenced.size > 1) return invalid('ambiguousDomain');
  if ([...referenced].some((id) => !master.battlePointDomains.some((domain) => domain.id === id)))
    return invalid('unresolvedDomain');
  const traits = new Set(
    findActorForm(servant, scenario.attacker.initialActorFormId)?.traits ?? servant.traits,
  );
  let witnesses: Readonly<Record<string, number>>[] = [{}];
  for (const domain of master.battlePointDomains.filter((candidate) =>
    referenced.has(candidate.id),
  )) {
    const capacity =
      domain.capacity.traitOverrides.find((entry) => entry.all.every((trait) => traits.has(trait)))
        ?.value ?? domain.capacity.default;
    const points = phase === 0 ? [-1] : battlePointPhaseCandidates(domain, phase, capacity);
    if (!points.length) return invalid('unreachablePhase');
    witnesses = witnesses.flatMap((prior) =>
      points.map((point) => ({ ...prior, [domain.id]: point })),
    );
  }
  return { status: 'ready', witnesses };
}
