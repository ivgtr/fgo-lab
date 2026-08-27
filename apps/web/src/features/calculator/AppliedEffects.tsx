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

function effectOriginLabel(effect: EffectProjection): string {
  if (effect.gameActivation === 'npBeforeDamage') return '宝具前';
  if (effect.gameActivation === 'skillUse') return effect.skillName;
  if (effect.source.origin === 'passive') return 'パッシブ';
  if (effect.source.origin === 'craftEssence') return '概念礼装';
  if (effect.gameActivation === 'derived') return '派生効果';
  return '常時効果';
}

function effectOriginShortLabel(
  effect: EffectProjection,
  servants: readonly ServantMaster[],
): string {
  if (effect.gameActivation === 'npBeforeDamage') return '宝具前';
  if (effect.source.origin === 'passive') return '常時';
  if (effect.source.origin === 'craftEssence') return '礼装';
  if (effect.source.origin === 'mysticCode') return '魔術礼装';
  if (effect.gameActivation === 'derived') return '派生';
  if (effect.gameActivation !== 'skillUse') return '常時';
  const source = servants.find((servant) => servant.id === effect.source.sourceId);
  const skill = source?.skills.find((candidate) => candidate.id === effect.source.skillId);
  return skill ? `S${String(skill.slot)}` : 'スキル';
}

function scenarioSelectionLabel(effect: EffectProjection, selected: boolean): string {
  if (effect.proc.kind === 'guaranteed' || effect.procRatePermille === 1_000)
    return selected ? '確定' : '比較のため除外';
  const rate = effect.procRatePermille;
  const rateLabel = rate === null ? '確率判定' : `${String(rate / 10)}%`;
  if (effect.proc.kind === 'chainedRolls') return `連続判定・各${rateLabel}`;
  return selected ? `成功時・${rateLabel}` : `失敗扱い・${rateLabel}`;
}

function chainedProcLabel(
  control: EffectControlViewModel,
  inputs: readonly EffectInputViewModel[],
): string | null {
  if (control.projection.proc.kind !== 'chainedRolls') return null;
  const input = inputs.find((candidate) => candidate.kind === 'procSuccessCount');
  const value = input?.value ?? input?.defaultValue ?? 0;
  return value === 0
    ? '失敗'
    : `成功${String(value)}/${String(control.projection.proc.maximumSuccesses)}`;
}

function compactEffectDetail(
  control: EffectControlViewModel,
  servants: readonly ServantMaster[],
  inputs: readonly EffectInputViewModel[],
) {
  const effect = control.projection;
  const value = `${control.valueDisplay === 'sum' ? '合計' : ''}${effectValueLabel(effect)}`;
  const origin = effectOriginShortLabel(effect, servants);
  if (effect.outcome === 'unsupported') return `${value}・${origin}・未対応`;
  if (!effect.sourceActive) return `${value}・${origin}・未使用`;
  const proc = chainedProcLabel(control, inputs);
  if (proc) return `${value}・${origin}・${proc}`;
  const selected = control.active;
  if (!selected) {
    const selection = scenarioSelectionLabel(effect, false);
    return `${value}・${origin}・${selection === '比較のため除外' ? '除外' : selection}`;
  }
  if (control.interaction === 'singleChoice' && effect.conditionDecision !== 'assumeSatisfied')
    return `${value}・${origin}・条件外`;
  if (effect.outcome !== 'applied' && control.interaction !== 'singleChoice')
    return `${value}・${origin}・条件外`;
  if (effect.proc.kind !== 'guaranteed' && effect.procRatePermille !== 1_000)
    return `${value}・${origin}・${scenarioSelectionLabel(effect, true).replace('時・', '')}`;
  return `${value}・${origin}`;
}

function accessibleEffectLabel(
  control: EffectControlViewModel,
  inputs: readonly EffectInputViewModel[],
) {
  const effect = control.projection;
  const chainedInput = inputs.find((candidate) => candidate.kind === 'procSuccessCount');
  const chainedCount = chainedInput?.value ?? chainedInput?.defaultValue ?? 0;
  const selection =
    effect.proc.kind === 'chainedRolls'
      ? chainedCount === 0
        ? `失敗・成功0/${String(effect.proc.maximumSuccesses)}`
        : `成功${String(chainedCount)}/${String(effect.proc.maximumSuccesses)}`
      : scenarioSelectionLabel(effect, control.active);
  const stateLabel = (() => {
    switch (control.presentationState) {
      case 'sourceInactive':
        return 'スキル未使用';
      case 'conditionUnsatisfied':
        return '条件不成立';
      case 'conditionUnselected':
        return '条件未選択';
      case 'unsupported':
        return '未対応';
      case 'impossible':
        return '成立不能';
      case 'applied':
        return effect.explanation.condition === null ? '' : '条件成立';
      case 'manuallyExcluded':
      case 'procFailed':
        return '';
    }
  })();
  return [
    effectLabel(effect),
    effectValueLabel(effect),
    effectOriginLabel(effect),
    effect.sourceName,
    effect.skillName,
    selection,
    stateLabel,
  ]
    .filter(Boolean)
    .join('、');
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
  onInputChange,
  action,
}: {
  title: string;
  effects: readonly EffectControlViewModel[];
  inputs: readonly EffectInputViewModel[];
  servants: readonly ServantMaster[];
  craftEssence: CraftEssenceMaster | undefined;
  onToggle: (control: EffectControlViewModel, active: boolean) => void;
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
            const active = control.active;
            return (
              <li
                className="applied-effect-item"
                key={effect.projectionKey}
                data-active={active}
                data-has-input={attachedInputs.length > 0 || undefined}
              >
                <ModifierChip
                  bare
                  active={active}
                  label={effectLabel(effect)}
                  detail={compactEffectDetail(control, servants, attachedInputs)}
                  accessibleLabel={accessibleEffectLabel(control, attachedInputs)}
                  sources={[
                    {
                      key: `${effect.projectionKey}:source`,
                      label: `${effect.sourceName}・${effect.skillName}`,
                      imageKey: effectSourceImage(effect, servants, craftEssence),
                    },
                  ]}
                  {...(control.interaction !== 'none'
                    ? { onToggle: (active: boolean) => onToggle(control, active) }
                    : {})}
                  selection={control.interaction === 'singleChoice' ? 'singleChoice' : 'toggle'}
                />
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
