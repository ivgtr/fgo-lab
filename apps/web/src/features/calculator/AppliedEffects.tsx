import type { EffectProjection } from '@fgo-lab/battle-execution';
import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { ReactNode } from 'react';
import { effectSourceImage } from './effectSourcePresentation';
import { ModifierChip } from './ModifierChip';
import { traitLabel } from './traitPresentation';

function conditionLabel(condition: EffectProjection['explanation']['condition']): string {
  if (!condition) return '';
  if (condition.kind === 'trait') return traitLabel(condition.trait);
  if (condition.kind === 'quantity' && condition.quantity === 'targetRarity')
    return `レアリティ${condition.value}`;
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.expressions.map(conditionLabel).filter(Boolean).join('・');
  if (condition.kind === 'not') return `非${conditionLabel(condition.expression)}`;
  return '';
}

function effectLabel(effect: EffectProjection): string {
  if (effect.modifier !== 'npSpecial') return effect.label;
  const condition = conditionLabel(effect.explanation.condition);
  return condition ? `${condition}・${effect.label}` : effect.label;
}

function effectValueLabel(effect: EffectProjection) {
  if (effect.modifier === 'ignoreDefense' || effect.modifier === 'ignoreDamageCut') return '有効';
  if (effect.value === null) return '倍率不明';
  if (effect.modifier === 'flatDamage') return `+${effect.value.toLocaleString('ja-JP')}`;
  if (effect.modifier === 'npSpecial') return `${effect.value.toFixed(2)}倍`;
  return effect.value.toLocaleString('ja-JP', {
    style: 'percent',
    signDisplay: 'always',
    maximumFractionDigits: 1,
  });
}

function effectStateLabel(effect: EffectProjection) {
  if (effect.outcome === 'unsupported') return '未対応';
  const value = effectValueLabel(effect);
  return effect.outcome === 'applied' ? `${value}・計算中` : `${value}・計算外`;
}

export function isEffectSelected(effect: EffectProjection) {
  return (
    effect.decision.state === 'enabled' ||
    (effect.decision.state === 'none' && effect.outcome === 'applied')
  );
}

export function visibleAppliedEffects(effects: readonly EffectProjection[]) {
  return effects.filter((effect) => effect.visibility === 'visible');
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
  effects: readonly EffectProjection[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
  onToggle: (projection: EffectProjection, active: boolean) => void;
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
              key={effect.projectionKey}
              active={isEffectSelected(effect)}
              label={effectLabel(effect)}
              detail={effectStateLabel(effect)}
              sources={[
                {
                  key: `${effect.projectionKey}:source`,
                  label: `${effect.sourceName}・${effect.skillName}`,
                  imageKey: effectSourceImage(effect, servants, craftEssence),
                },
              ]}
              {...(effect.controllability === 'user'
                ? { onToggle: (active: boolean) => onToggle(effect, active) }
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
