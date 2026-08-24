import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { DamageTraitCondition, ResolvedSupportEffect } from '@fgo-lab/effect-resolver';

export interface SpecialTraitSource {
  key: string;
  origin: ResolvedSupportEffect['origin'];
  sourceName: string;
  effectName: string;
  imageKey: string | null;
  effectLabel: string;
  value: number | null;
  modifierKind: DamageTraitCondition['kind'];
}

export interface SpecialTraitCandidate {
  trait: string;
  sources: SpecialTraitSource[];
}

function sourceImage(
  effect: ResolvedSupportEffect,
  servants: readonly ServantMaster[],
  craftEssence: CraftEssenceMaster | undefined,
): string | null {
  if (effect.origin === 'craftEssence') return craftEssence?.imageKey ?? null;
  const servant = servants.find((candidate) => candidate.id === effect.sourceId);
  if (effect.origin === 'np') return servant?.imageKey ?? null;
  return (
    [...(servant?.skills ?? []), ...(servant?.passives ?? [])].find(
      (skill) => skill.id === effect.skillId,
    )?.imageKey ?? null
  );
}

export function collectSpecialTraitCandidates({
  effects,
  servants,
  craftEssence,
}: {
  effects: readonly ResolvedSupportEffect[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
}): SpecialTraitCandidate[] {
  const candidates = new Map<string, SpecialTraitCandidate>();

  for (const effect of effects) {
    if (!effect.damageTraitCondition || effect.reason === 'attacker_trait_mismatch') continue;
    for (const trait of effect.damageTraitCondition.traits) {
      if (trait.startsWith('trait:')) continue;
      const candidate = candidates.get(trait) ?? { trait, sources: [] };
      const key = `${effect.origin}:${effect.sourceId}:${effect.skillId}:${effect.effectId}`;
      if (!candidate.sources.some((source) => source.key === key)) {
        candidate.sources.push({
          key,
          origin: effect.origin,
          sourceName: effect.sourceName,
          effectName: effect.skillName,
          imageKey: sourceImage(effect, servants, craftEssence),
          effectLabel: effect.label,
          value: effect.value,
          modifierKind: effect.damageTraitCondition.kind,
        });
      }
      candidates.set(trait, candidate);
    }
  }

  return [...candidates.values()];
}
