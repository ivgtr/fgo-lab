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
        適用内容 <small>{composition.effectInclusions.length}件を除外</small>
      </legend>
      {effects.length ? (
        <ul className="modifier-chip-list">
          {effects.map(({ ref, label, skillName, sourceName, imageKey, skillLevel }) => {
            const selected = !composition.effectInclusions.some((candidate) =>
              sameEffect(candidate, ref),
            );
            return (
              <ModifierChip
                key={`${ref.sourceInstanceId}:${ref.skillId}:${ref.effectOccurrenceId}`}
                active={selected}
                label={label}
                detail={`Lv${skillLevel}・${selected ? 'セットに含める' : 'セットから除外'}`}
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
