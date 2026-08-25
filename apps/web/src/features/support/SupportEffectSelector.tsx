import { isDamageEffectRoutable } from '@fgo-lab/effect-resolver';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportComposition, SupportEffectRef } from '@fgo-lab/schema';
import { ModifierChip } from '../calculator/ModifierChip';

function sameEffect(left: SupportEffectRef, right: SupportEffectRef) {
  return (
    left.sourceInstanceId === right.sourceInstanceId &&
    left.skillId === right.skillId &&
    left.effectId === right.effectId
  );
}

export function SupportEffectSelector({
  composition,
  servants,
  onToggle,
}: {
  composition: SupportComposition;
  servants: readonly ServantMaster[];
  onToggle: (effect: SupportEffectRef, selected: boolean) => void;
}) {
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  const effects = composition.sources.flatMap((source) => {
    const servant = servantById.get(source.servantId);
    return source.skills.flatMap((selection) => {
      const skill = servant?.skills.find((candidate) => candidate.id === selection.skillId);
      return (skill?.effects ?? [])
        .filter((effect) => isDamageEffectRoutable(effect, 'support'))
        .map((effect) => ({
          ref: {
            sourceInstanceId: source.sourceInstanceId,
            skillId: selection.skillId,
            effectId: effect.id,
          } satisfies SupportEffectRef,
          effect,
          skill,
          servant,
          skillLevel: selection.skillLevel,
        }));
    });
  });

  return (
    <fieldset className="modifier-group support-effect-selector">
      <legend>
        適用内容 <small>{composition.selectedEffects.length}件選択中</small>
      </legend>
      {effects.length ? (
        <ul className="modifier-chip-list">
          {effects.map(({ ref, effect, skill, servant, skillLevel }) => {
            const selected = composition.selectedEffects.some((candidate) =>
              sameEffect(candidate, ref),
            );
            return (
              <ModifierChip
                key={`${ref.sourceInstanceId}:${ref.skillId}:${ref.effectId}`}
                active={selected}
                label={effect.label}
                detail={`Lv${skillLevel}・${selected ? 'セットから除外' : 'セットに含める'}`}
                sources={[
                  {
                    key: `${ref.sourceInstanceId}:${ref.skillId}`,
                    label: `${servant?.name ?? ref.sourceInstanceId}・${skill?.name ?? ref.skillId}`,
                    imageKey: skill?.imageKey ?? null,
                  },
                ]}
                onToggle={(active) => onToggle(ref, active)}
              />
            );
          })}
        </ul>
      ) : (
        <p className="notice">宝具火力に反映できる効果はありません。</p>
      )}
    </fieldset>
  );
}
