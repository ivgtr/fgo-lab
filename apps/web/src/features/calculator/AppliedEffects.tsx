import type {
  EffectControlViewModel,
  EffectInputViewModel,
  EffectProjection,
} from '@fgo-lab/calculation-application';
import type { CraftEssenceMaster, ServantMaster } from '@fgo-lab/master-data';
import type { ReactNode } from 'react';
import { effectSourceImage } from './effectSourcePresentation';
import { ModifierChip } from './ModifierChip';
import { EffectInlineInput } from './EffectInlineInput';
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
  if (
    effect.modifier === 'ignoreDefense' ||
    effect.modifier === 'ignoreDamageCut' ||
    effect.modifier === 'cardTypeChange'
  )
    return '有効';
  if (effect.value === null) return '倍率不明';
  if (effect.modifier === 'flatDamage') return `+${effect.value.toLocaleString('ja-JP')}`;
  if (effect.modifier === 'npSpecial') return `${effect.value.toFixed(2)}倍`;
  return effect.value.toLocaleString('ja-JP', {
    style: 'percent',
    signDisplay: 'always',
    maximumFractionDigits: 1,
  });
}

function effectStateLabel(effect: EffectProjection, valueDisplay: 'single' | 'sum') {
  if (effect.outcome === 'unsupported') return '未対応';
  const value = `${valueDisplay === 'sum' ? '合計' : ''}${effectValueLabel(effect)}`;
  return effect.outcome === 'applied' ? `${value}・計算中` : `${value}・計算外`;
}

function effectOriginLabel(effect: EffectProjection): string {
  if (effect.gameActivation === 'npBeforeDamage') return '宝具前';
  if (effect.gameActivation === 'skillUse') return effect.skillName;
  if (effect.source.origin === 'passive') return 'パッシブ';
  if (effect.source.origin === 'craftEssence') return '概念礼装';
  if (effect.gameActivation === 'derived') return '派生効果';
  return '常時効果';
}

function scenarioSelectionLabel(effect: EffectProjection): string {
  const selected = isEffectSelected(effect);
  if (effect.proc.kind === 'guaranteed' || effect.procRatePermille === 1_000)
    return selected ? '確定' : '比較のため除外';
  const rate = effect.procRatePermille;
  const rateLabel = rate === null ? '確率判定' : `${String(rate / 10)}%`;
  if (effect.proc.kind === 'chainedRolls') return `連続判定・各${rateLabel}`;
  return selected ? `成功時・${rateLabel}` : `失敗扱い・${rateLabel}`;
}

function sourceActivationLabel(effect: EffectProjection): string {
  if (effect.gameActivation !== 'skillUse') return '';
  return effect.sourceActive ? 'スキル使用中' : 'スキル未使用';
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
  inputs,
  servants,
  craftEssence,
  onToggle,
  onConditionChange,
  onInputChange,
  action,
}: {
  title: string;
  effects: readonly EffectControlViewModel[];
  inputs: readonly EffectInputViewModel[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
  onToggle: (projection: EffectProjection, active: boolean) => void;
  onConditionChange: (projection: EffectProjection, satisfied: boolean) => void;
  onInputChange: (key: string, value: number | null) => void;
  action?: ReactNode;
}) {
  const visibleEffects = effects;
  const firstVisibleProjectionForInput = new Map(
    inputs.map((input) => [
      input.key,
      input.relatedProjectionKeys.find((key) =>
        visibleEffects.some((effect) => effect.projection.projectionKey === key),
      ) ?? null,
    ]),
  );
  const unattachedInputs = inputs.filter(
    (input) => firstVisibleProjectionForInput.get(input.key) === null,
  );
  if (visibleEffects.length === 0 && inputs.length === 0 && !action) return null;

  return (
    <fieldset className="modifier-group calculator-applied-effect-group">
      <legend className="calculator-support-effect-legend">
        <span>
          <strong>{title}</strong>
          <small>{visibleEffects.length}件</small>
        </span>
        {action}
      </legend>
      {visibleEffects.length || inputs.length ? (
        <ul className="modifier-chip-list">
          {visibleEffects.map((control) => {
            const effect = control.projection;
            const attachedInputs = inputs.filter(
              (input) => firstVisibleProjectionForInput.get(input.key) === effect.projectionKey,
            );
            return (
              <li
                className="applied-effect-item"
                key={effect.projectionKey}
                data-active={isEffectSelected(effect)}
                data-has-input={attachedInputs.length > 0 || undefined}
              >
                <ModifierChip
                  bare
                  active={isEffectSelected(effect)}
                  label={effectLabel(effect)}
                  detail={`${effectStateLabel(effect, control.valueDisplay)}・${effectOriginLabel(effect)}・${sourceActivationLabel(effect) ? `${sourceActivationLabel(effect)}・` : ''}${scenarioSelectionLabel(effect)}`}
                  sources={[
                    {
                      key: `${effect.projectionKey}:source`,
                      label: `${effect.sourceName}・${effect.skillName}`,
                      imageKey: effectSourceImage(effect, servants, craftEssence),
                    },
                  ]}
                  {...(control.control === 'toggle' && effect.controllability === 'user'
                    ? { onToggle: (active: boolean) => onToggle(effect, active) }
                    : {})}
                  disabled={!effect.sourceActive}
                />
                {control.conditionControl === 'toggle' ? (
                  <button
                    type="button"
                    className="effect-condition-control"
                    disabled={!effect.sourceActive}
                    aria-pressed={effect.conditionDecision === 'assumeSatisfied'}
                    onClick={() =>
                      onConditionChange(effect, effect.conditionDecision !== 'assumeSatisfied')
                    }
                  >
                    条件成立として計算
                  </button>
                ) : control.conditionControl === 'singleChoice' ? (
                  <button
                    type="button"
                    className="effect-condition-control"
                    disabled={!effect.sourceActive}
                    role="radio"
                    aria-checked={effect.conditionDecision === 'assumeSatisfied'}
                    onClick={() => onConditionChange(effect, true)}
                  >
                    この条件を選択
                  </button>
                ) : null}
                {attachedInputs.map((input) => (
                  <EffectInlineInput key={input.key} input={input} onChange={onInputChange} />
                ))}
              </li>
            );
          })}
          {unattachedInputs.map((input) => (
            <li className="applied-effect-item applied-effect-input-only" key={input.key}>
              <p>
                <strong>{input.relatedEffectLabels.join('・')}</strong>
                <small>成立条件の入力</small>
              </p>
              <EffectInlineInput input={input} onChange={onInputChange} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice">宝具火力に反映できる効果はありません。</p>
      )}
    </fieldset>
  );
}
