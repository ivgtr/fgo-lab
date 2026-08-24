import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { DamageTraitCondition, ResolvedSupportEffect } from '@fgo-lab/effect-resolver';
import { effectSourceImage } from './effectSourcePresentation';

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
  matchesWhenPresent: boolean;
  sources: SpecialTraitSource[];
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
    const conditionedTraits = [
      ...effect.damageTraitCondition.condition.anyOf.map((trait) => ({
        trait,
        matchesWhenPresent: true,
      })),
      ...effect.damageTraitCondition.condition.noneOf.map((trait) => ({
        trait,
        matchesWhenPresent: false,
      })),
    ];
    for (const { trait, matchesWhenPresent } of conditionedTraits) {
      if (trait.startsWith('trait:')) continue;
      const candidateKey = `${matchesWhenPresent ? 'has' : 'not'}:${trait}`;
      const candidate = candidates.get(candidateKey) ?? { trait, matchesWhenPresent, sources: [] };
      const key = `${effect.origin}:${effect.sourceId}:${effect.skillId}:${effect.effectId}`;
      if (!candidate.sources.some((source) => source.key === key)) {
        candidate.sources.push({
          key,
          origin: effect.origin,
          sourceName: effect.sourceName,
          effectName: effect.skillName,
          imageKey: effectSourceImage(effect, servants, craftEssence),
          effectLabel: effect.label,
          value: effect.value,
          modifierKind: effect.damageTraitCondition.kind,
        });
      }
      candidates.set(candidateKey, candidate);
    }
  }

  return [...candidates.values()];
}
