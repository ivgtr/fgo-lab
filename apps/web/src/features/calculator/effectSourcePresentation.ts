import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { EffectProjection } from '@fgo-lab/calculation-application';

export function effectSourceImage(
  effect: EffectProjection,
  servants: readonly ServantMaster[],
  craftEssence: CraftEssenceMaster | undefined,
): string | null {
  if (effect.source.origin === 'craftEssence') return craftEssence?.imageKey ?? null;
  const servant = servants.find((candidate) => candidate.id === effect.source.sourceId);
  if (effect.source.origin === 'np') return servant?.imageKey ?? null;
  return (
    [...(servant?.skills ?? []), ...(servant?.passives ?? [])].find(
      (skill) => skill.id === effect.source.skillId,
    )?.imageKey ?? null
  );
}
