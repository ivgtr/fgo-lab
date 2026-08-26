import { canNormalizeDamageEffect } from '@fgo-lab/battle-execution';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportComposition, SupportEffectRef, SupportSource } from '@fgo-lab/schema';

export interface SupportEffectOption {
  ref: SupportEffectRef;
  label: string;
  skillLevel: number;
  sourceName: string;
  skillName: string;
  imageKey: string | null;
}

export interface SupportDamageSkillView {
  skillId: string;
  skillLevel: number;
  name: string;
  imageKey: string | null;
  effectLabels: readonly string[];
}

function damageEffectLabels(servant: ServantMaster | undefined, skillId: string): string[] {
  const skill = servant?.skills.find((candidate) => candidate.id === skillId);
  return (skill?.effects ?? [])
    .filter((effect) => canNormalizeDamageEffect(effect, 'support'))
    .map((effect) => effect.label)
    .filter((label, index, labels) => labels.indexOf(label) === index);
}

export function supportEffectOptions(
  composition: SupportComposition,
  servants: readonly ServantMaster[],
): SupportEffectOption[] {
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  return composition.sources.flatMap((source) => {
    const servant = servantById.get(source.servantId);
    return source.skills.flatMap((selection) => {
      const skill = servant?.skills.find((candidate) => candidate.id === selection.skillId);
      return (skill?.effects ?? [])
        .filter((effect) => canNormalizeDamageEffect(effect, 'support'))
        .map((effect) => ({
          ref: {
            sourceInstanceId: source.sourceInstanceId,
            skillId: selection.skillId,
            effectId: effect.id,
            effectOccurrenceId: effect.occurrenceId,
          },
          label: effect.label,
          skillLevel: selection.skillLevel,
          sourceName: servant?.name ?? source.sourceInstanceId,
          skillName: skill?.name ?? selection.skillId,
          imageKey: skill?.imageKey ?? null,
        }));
    });
  });
}

export function supportDamageSkillViews(
  source: SupportSource,
  servant: ServantMaster | undefined,
): SupportDamageSkillView[] {
  return source.skills.flatMap((selection) => {
    const skill = servant?.skills.find((candidate) => candidate.id === selection.skillId);
    const effectLabels = damageEffectLabels(servant, selection.skillId);
    return effectLabels.length
      ? [
          {
            skillId: selection.skillId,
            skillLevel: selection.skillLevel,
            name: skill?.name ?? selection.skillId,
            imageKey: skill?.imageKey ?? null,
            effectLabels,
          },
        ]
      : [];
  });
}

export function supportDamageEffectSummary(
  servant: ServantMaster | undefined,
  skillId: string,
): string {
  return damageEffectLabels(servant, skillId).join('・');
}
