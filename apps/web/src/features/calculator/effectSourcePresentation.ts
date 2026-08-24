import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { ResolvedSupportEffect } from '@fgo-lab/effect-resolver';

export function effectSourceImage(
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
