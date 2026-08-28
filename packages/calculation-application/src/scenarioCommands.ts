import type { EffectProjection, OperationSource } from '@fgo-lab/battle-execution';
import type { CalculationScenario, SupportSource } from '@fgo-lab/schema';
import { defaultTargetClassRelation } from '@fgo-lab/calc-core';
import { applyTargetContextCommand } from './targetContext';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

export function resetTargetClassContextForAttacker(
  scenario: ResolvedScenario,
  attackerClassId: string,
): ResolvedScenario {
  return {
    ...scenario,
    targetContext: applyTargetContextCommand(scenario.targetContext, {
      kind: 'setClassRelation',
      relation: defaultTargetClassRelation(attackerClassId),
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
  skillId: string,
  skillLevel: number,
): ResolvedScenario {
  return {
    ...scenario,
    attackerSkills: scenario.attackerSkills.map((skill) =>
      skill.skillId === skillId ? { ...skill, skillLevel } : skill,
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
    activationDecisions: scenario.activationDecisions.filter(
      (decision) => !removedDecisionKeys.has(decision.decisionKey),
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
