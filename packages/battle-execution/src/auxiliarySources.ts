import {
  actorFormKey,
  findActorForm,
  getDefaultInitialActorForm,
  getSkillsForActorForm,
  getPassivesForActorForm,
  type ActorFormId,
  type MasterDataSnapshot,
} from '@fgo-lab/master-data';
import type { CalculationScenario } from '@fgo-lab/schema';
import type { ExecutionIssue, ExecutionPhase } from './contracts';
import type { Origin } from './effectRouting';
import type { SourceEffect } from './sourceCollection';
export function collectAuxiliarySources(
  scenario: Extract<CalculationScenario, { mode: 'resolved' }>,
  master: MasterDataSnapshot,
  actorFormId: ActorFormId,
) {
  const sources: SourceEffect[] = [];
  const issues: ExecutionIssue[] = [];
  const attacker = master.servants.find((servant) => servant.id === scenario.attacker.servantId);
  if (!attacker) return { sources, issues };
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
        ...(origin === 'passive' && resolvedActorFormId
          ? { constantFormKey: actorFormKey(resolvedActorFormId) }
          : {}),
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
        preparationStochasticOutcome: null,
      });
  };
  for (const passive of getPassivesForActorForm(attacker, actorFormId))
    appendSkill(
      'passive',
      'passive',
      `passive:${attacker.id}`,
      attacker.id,
      passive.id,
      1,
      true,
      'master',
      actorFormId,
    );
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
          preparationStochasticOutcome: null,
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
            preparationStochasticOutcome: null,
          });
      }
  }
  return { sources, issues };
}
