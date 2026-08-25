import type { ResolvedEffect } from '@fgo-lab/effect-resolver';
import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { ReactNode } from 'react';
import { effectSourceImage } from './effectSourcePresentation';
import { ModifierChip } from './ModifierChip';

const HIDDEN_MISMATCHES = new Set(['attacker_trait_mismatch', 'card_type_mismatch']);

function effectValueLabel(effect: ResolvedEffect) {
  if (effect.value === null) return '倍率不明';
  if (effect.kind === 'flatDamage') return `+${effect.value.toLocaleString('ja-JP')}`;
  if (effect.damageTraitCondition?.kind === 'npSpecial') return `${effect.value.toFixed(2)}倍`;
  return effect.value.toLocaleString('ja-JP', {
    style: 'percent',
    signDisplay: 'always',
    maximumFractionDigits: 1,
  });
}

function effectStateLabel(effect: ResolvedEffect) {
  if (!effect.calculationSupported) return '未対応';
  const value = effectValueLabel(effect);
  return effect.applied ? `${value}・計算中` : `${value}・計算外`;
}

export function visibleAppliedEffects(effects: readonly ResolvedEffect[]) {
  return effects.filter((effect) => effect.damageRelevant && !HIDDEN_MISMATCHES.has(effect.reason));
}

export function AppliedEffects({
  title,
  effects,
  servants,
  craftEssence,
  onToggle,
  action,
}: {
  title: string;
  effects: readonly ResolvedEffect[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
  onToggle: (effectKey: string, active: boolean) => void;
  action?: ReactNode;
}) {
  const visibleEffects = visibleAppliedEffects(effects);
  if (visibleEffects.length === 0 && !action) return null;

  return (
    <fieldset className="modifier-group calculator-applied-effect-group">
      <legend className="calculator-support-effect-legend">
        <span>
          <strong>{title}</strong>
          <small>{visibleEffects.length}件</small>
        </span>
        {action}
      </legend>
      {visibleEffects.length ? (
        <ul className="modifier-chip-list">
          {visibleEffects.map((effect) => (
            <ModifierChip
              key={effect.effectKey}
              active={effect.applied}
              label={effect.label}
              detail={effectStateLabel(effect)}
              sources={[
                {
                  key: `${effect.effectKey}:source`,
                  label: `${effect.sourceName}・${effect.skillName}`,
                  imageKey: effectSourceImage(effect, servants, craftEssence),
                },
              ]}
              {...(effect.calculationSupported
                ? { onToggle: (active: boolean) => onToggle(effect.effectKey, active) }
                : {})}
            />
          ))}
        </ul>
      ) : (
        <p className="notice">宝具火力に反映できる効果はありません。</p>
      )}
    </fieldset>
  );
}
