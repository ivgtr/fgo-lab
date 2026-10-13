import { hasCanonicalRankingSkillSlots, commonPreparationSkillLevels } from './rankingBasis';
import {
  type EffectProjection,
  type OperationSource,
  type AppliedPreparationAction,
} from '@fgo-lab/battle-execution';
import type {
  ResolvedRankingBasis,
  AttackerSkillUse,
  CalculationScenario,
  SupportSource,
} from '@fgo-lab/schema';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import {
  actorFormEquals,
  findActorForm,
  getInitialActorForms,
  getSkillsForActorForm,
  playerChoiceForEffect,
  type ActorFormId,
  type CanonicalNpResourceSemantics,
  type CombatRules,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { applyTargetContextCommand } from './targetContext';
import { defaultCalculatorPreNoblePhantasmCandidateForInitialForm } from './preNoblePhantasmPlanner';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

const attackerOwnedOrigin = new Set(['attacker', 'passive', 'np']);

export interface PreparationChoiceOption {
  key: string;
  slot: 1 | 2 | 3;
  choice: NonNullable<AttackerSkillUse['choice']>;
  label: string;
  skillName: string;
  imageKey: string | null;
  active: boolean;
}

export function preparationChoiceOptions(
  actions: readonly AppliedPreparationAction[],
  servant: ServantMaster,
): readonly PreparationChoiceOption[] {
  return actions.flatMap((action) => {
    if (action.command.kind !== 'useSkillSlot' || action.command.choice === null) return [];
    const command = action.command;
    const skill = getSkillsForActorForm(servant, action.actorFormId).find(
      ({ id }) => id === action.sourceId,
    );
    if (!skill) throw new TypeError(`preparation_choice_skill_missing:${action.sourceId}`);
    const choices = new Map<
      string,
      { choice: NonNullable<AttackerSkillUse['choice']>; label: string; structural: boolean }
    >();
    for (const effect of skill.effects) {
      const choice = playerChoiceForEffect(effect);
      if (!choice) continue;
      const key = `${choice.key}:${choice.candidate}`;
      const structural = effect.execution.some(
        (operation) => operation.kind === 'selectNoblePhantasmVariant',
      );
      const current = choices.get(key);
      if (!current || structural)
        choices.set(key, {
          choice: {
            groupKey: choice.key,
            candidateKey: choice.candidate,
          },
          label: effect.label,
          structural,
        });
    }
    return [...choices.values()].map(({ choice, label }) => ({
      key: `${String(command.slot)}:${choice.groupKey}:${choice.candidateKey}`,
      slot: command.slot,
      choice,
      label,
      skillName: skill.name,
      imageKey: skill.imageKey,
      active:
        command.choice?.groupKey === choice.groupKey &&
        command.choice.candidateKey === choice.candidateKey,
    }));
  });
}

export function setPreparationSkillChoice(
  scenario: ResolvedScenario,
  option: PreparationChoiceOption,
  projections: readonly EffectProjection[],
): ResolvedScenario {
  let replacementCount = 0;
  const preNoblePhantasmPlan = scenario.preNoblePhantasmPlan.map((command) => {
    if (command.kind !== 'useSkillSlot' || command.slot !== option.slot) return command;
    replacementCount += 1;
    return { ...command, choice: option.choice };
  });
  if (replacementCount !== 1) throw new TypeError('preparation_choice_command_missing');
  const removedDecisionKeys = new Set(
    projections
      .filter(({ source }) => attackerOwnedOrigin.has(source.origin))
      .map(({ projectionKey }) => projectionKey),
  );
  const changed: ResolvedScenario = {
    ...scenario,
    preNoblePhantasmPlan,
    effectDecisions: scenario.effectDecisions.filter(
      ({ decisionKey }) => !removedDecisionKeys.has(decisionKey),
    ),
    activationFacts: scenario.activationFacts.filter(
      ({ source }) => !attackerOwnedOrigin.has(source.origin),
    ),
    worldFactAssertions: scenario.worldFactAssertions.filter(
      ({ decisionKey }) => !removedDecisionKeys.has(decisionKey),
    ),
    canonicalInputValues: {},
  };
  return changed;
}

export function preparationSkillLevelsForScenario(
  servant: ServantMaster,
  scenario: CalculationScenario,
): ResolvedRankingBasis['skillLevels'] {
  // New unused slots use the explicit calculator command default.
  const levels = commonPreparationSkillLevels(servant);
  if (scenario.mode === 'manual') return levels;
  const selectedSlots = new Set<number>();
  for (const command of scenario.preNoblePhantasmPlan) {
    if (command.kind !== 'useSkillSlot') continue;
    if (selectedSlots.has(command.slot)) throw new TypeError('duplicate_preparation_skill_slot');
    selectedSlots.add(command.slot);
    levels[String(command.slot) as '1' | '2' | '3'] = command.skillLevel;
  }
  if (!hasCanonicalRankingSkillSlots(servant, levels))
    throw new TypeError('preparation_skill_levels_incomplete');
  return levels;
}

export function setInitialActorForm(
  scenario: ResolvedScenario,
  servant: ServantMaster,
  resourceSemantics: CanonicalNpResourceSemantics,
  initialActorFormId: ActorFormId,
  projections: readonly EffectProjection[],
): ResolvedScenario {
  const targetForm = findActorForm(servant, initialActorFormId);
  if (
    !targetForm ||
    !getInitialActorForms(servant).some(({ id }) => actorFormEquals(id, initialActorFormId))
  )
    throw new TypeError('unknown_initial_actor_form');
  if (actorFormEquals(scenario.attacker.initialActorFormId, initialActorFormId)) return scenario;
  const skillLevels = preparationSkillLevelsForScenario(servant, scenario);
  const candidate = defaultCalculatorPreNoblePhantasmCandidateForInitialForm(
    servant,
    targetForm.id,
    resourceSemantics,
    skillLevels,
    scenario.attacker.npLevel as 1 | 2 | 3 | 4 | 5,
    scenario.initialOvercharge,
    scenario.initialOvercharge * resourceSemantics.noblePhantasmUse.baseOvercharge.gaugePerStage,
  );
  const removedDecisionKeys = new Set(
    projections
      .filter(({ source }) => attackerOwnedOrigin.has(source.origin))
      .map(({ projectionKey }) => projectionKey),
  );
  return {
    ...scenario,
    attacker: { ...scenario.attacker, initialActorFormId },
    preNoblePhantasmPlan: [...candidate.commands],
    effectDecisions: scenario.effectDecisions.filter(
      ({ decisionKey }) => !removedDecisionKeys.has(decisionKey),
    ),
    activationFacts: scenario.activationFacts.filter(
      ({ source }) => !attackerOwnedOrigin.has(source.origin),
    ),
    worldFactAssertions: scenario.worldFactAssertions.filter(
      ({ decisionKey }) => !removedDecisionKeys.has(decisionKey),
    ),
    canonicalInputValues: {},
  };
}

export function resetTargetClassContextForAttacker(
  scenario: ResolvedScenario,
  attackerClassId: string,
  combatRules?: CombatRules,
): ResolvedScenario {
  return {
    ...scenario,
    targetContext: applyTargetContextCommand(scenario.targetContext, {
      kind: 'setClassRelation',
      relation: defaultTargetClassRelation(attackerClassId, combatRules),
    }),
  };
}

export function setEffectSourceEnabled(
  scenario: ResolvedScenario,
  projection: EffectProjection,
  enabled: boolean,
): ResolvedScenario {
  if (projection.gameActivation !== 'skillUse') return scenario;
  return setOperationSourceEnabled(scenario, projection.source, enabled);
}

export function setOperationSourceEnabled(
  scenario: ResolvedScenario,
  source: OperationSource,
  enabled: boolean,
): ResolvedScenario {
  if (source.origin === 'attacker' || source.origin === 'np' || source.origin === 'passive')
    return scenario;
  if (source.origin === 'support')
    return setCalculationSupportSkillEnabled(
      scenario,
      source.sourceInstanceId,
      source.skillId,
      enabled,
    );
  if (source.origin === 'mysticCode' && scenario.mysticCode)
    return {
      ...scenario,
      mysticCode: {
        ...scenario.mysticCode,
        skills: scenario.mysticCode.skills.map((skill) =>
          skill.skillId === source.skillId ? { ...skill, enabled } : skill,
        ),
      },
    };
  return scenario;
}

export function setAttackerSkillLevel(
  scenario: ResolvedScenario,
  slot: 1 | 2 | 3,
  skillLevel: number,
): ResolvedScenario {
  return {
    ...scenario,
    preNoblePhantasmPlan: scenario.preNoblePhantasmPlan.map((command) =>
      command.kind === 'useSkillSlot' && command.slot === slot
        ? { ...command, skillLevel }
        : command,
    ),
  };
}

export function appendCalculationSupportSource(
  scenario: ResolvedScenario,
  source: SupportSource,
): ResolvedScenario {
  const composition = scenario.support?.composition ?? { sources: [], effectInclusions: [] };
  return {
    ...scenario,
    support: {
      sourceTemplateId: scenario.support?.sourceTemplateId ?? null,
      composition: { ...composition, sources: [...composition.sources, source] },
    },
  };
}

export function removeCalculationSupportSource(
  scenario: ResolvedScenario,
  sourceInstanceId: string,
  effects: readonly EffectProjection[],
): ResolvedScenario {
  if (!scenario.support) return scenario;
  const removedDecisionKeys = new Set(
    effects
      .filter((effect) => effect.source.sourceInstanceId === sourceInstanceId)
      .map((effect) => effect.projectionKey),
  );
  return {
    ...scenario,
    effectDecisions: scenario.effectDecisions.filter(
      (decision) => !removedDecisionKeys.has(decision.decisionKey),
    ),
    activationFacts: scenario.activationFacts.filter(
      (fact) => fact.source.sourceInstanceId !== sourceInstanceId,
    ),
    worldFactAssertions: scenario.worldFactAssertions.filter(
      (assertion) => !removedDecisionKeys.has(assertion.decisionKey),
    ),
    support: {
      ...scenario.support,
      composition: {
        sources: scenario.support.composition.sources.filter(
          (source) => source.sourceInstanceId !== sourceInstanceId,
        ),
        effectInclusions: scenario.support.composition.effectInclusions.filter(
          (effect) => effect.sourceInstanceId !== sourceInstanceId,
        ),
      },
    },
  };
}

export function setCalculationSupportSkillLevel(
  scenario: ResolvedScenario,
  sourceInstanceId: string,
  skillId: string,
  skillLevel: number,
): ResolvedScenario {
  if (!scenario.support) return scenario;
  return {
    ...scenario,
    support: {
      ...scenario.support,
      composition: {
        ...scenario.support.composition,
        sources: scenario.support.composition.sources.map((source) =>
          source.sourceInstanceId === sourceInstanceId
            ? {
                ...source,
                skills: source.skills.map((skill) =>
                  skill.skillId === skillId ? { ...skill, skillLevel } : skill,
                ),
              }
            : source,
        ),
      },
    },
  };
}

export function setCalculationSupportSkillEnabled(
  scenario: ResolvedScenario,
  sourceInstanceId: string,
  skillId: string,
  enabled: boolean,
): ResolvedScenario {
  if (!scenario.support) return scenario;
  return {
    ...scenario,
    support: {
      ...scenario.support,
      composition: {
        ...scenario.support.composition,
        sources: scenario.support.composition.sources.map((source) =>
          source.sourceInstanceId === sourceInstanceId
            ? {
                ...source,
                skills: source.skills.map((skill) =>
                  skill.skillId === skillId ? { ...skill, enabled } : skill,
                ),
              }
            : source,
        ),
      },
    },
  };
}

/** Replace the initial intent and discard obsolete duplicate HP assertions. Execution always reseeds. */
export function setInitialHp(
  scenario: ResolvedScenario,
  permille: number | null,
): ResolvedScenario {
  if (permille !== null && (!Number.isInteger(permille) || permille < 0 || permille > 1000))
    throw new TypeError('invalid_initial_hp_ratio');
  return {
    ...scenario,
    attackerHpPermille: permille,
    worldFactAssertions: scenario.worldFactAssertions.filter(
      ({ fact }) => fact.kind !== 'quantity' || fact.quantity !== 'attackerHpPermille',
    ),
  };
}

/** Set the target's independent defense modifier before ordered effect execution. */
export function setEnemyDefenseBuff(scenario: ResolvedScenario, value: number): ResolvedScenario {
  if (!Number.isFinite(value) || value < -5 || value > 5)
    throw new TypeError('invalid_enemy_defense_buff');
  return { ...scenario, enemyDefenseBuff: value };
}
