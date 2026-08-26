import { supportEffectOptions } from '@fgo-lab/calculation-application';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportComposition, SupportEffectRef } from '@fgo-lab/schema';
import { ModifierChip } from '../calculator/ModifierChip';

function sameEffect(left: SupportEffectRef, right: SupportEffectRef) {
  return (
    left.sourceInstanceId === right.sourceInstanceId &&
    left.skillId === right.skillId &&
    left.effectId === right.effectId &&
    left.effectOccurrenceId === right.effectOccurrenceId
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
  const effects = supportEffectOptions(composition, servants);

  return (
    <fieldset className="modifier-group support-effect-selector">
      <legend>
        適用内容 <small>{composition.selectedEffects.length}件選択中</small>
      </legend>
      {effects.length ? (
        <ul className="modifier-chip-list">
          {effects.map(({ ref, label, skillName, sourceName, imageKey, skillLevel }) => {
            const selected = composition.selectedEffects.some((candidate) =>
              sameEffect(candidate, ref),
            );
            return (
              <ModifierChip
                key={`${ref.sourceInstanceId}:${ref.skillId}:${ref.effectOccurrenceId}`}
                active={selected}
                label={label}
                detail={`Lv${skillLevel}・${selected ? 'セットから除外' : 'セットに含める'}`}
                sources={[
                  {
                    key: `${ref.sourceInstanceId}:${ref.skillId}`,
                    label: `${sourceName}・${skillName}`,
                    imageKey,
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
