import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { CalculationScenario, SupportSource } from '@fgo-lab/schema';

type ResolvedScenario = Extract<CalculationScenario, { mode: 'resolved' }>;

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
  const composition = scenario.support?.composition ?? { sources: [], selectedEffects: [] };
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
    worldFactAssertions: scenario.worldFactAssertions.filter(
      (assertion) => !removedDecisionKeys.has(assertion.decisionKey),
    ),
    support: {
      ...scenario.support,
      composition: {
        sources: scenario.support.composition.sources.filter(
          (source) => source.sourceInstanceId !== sourceInstanceId,
        ),
        selectedEffects: scenario.support.composition.selectedEffects.filter(
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
