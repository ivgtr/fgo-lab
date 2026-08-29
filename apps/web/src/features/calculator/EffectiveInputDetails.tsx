import type { DamageResolutionInput } from '@fgo-lab/schema';
import { numberFormatter } from '../../ui/i18n';
import type { DamageEffectStack } from '../../presentation/damageEffectStacks';
import {
  damageEffectContributes,
  damageEffectStateLabel,
} from '../../presentation/damageEffectStacks';
import { ModifierChip } from './ModifierChip';
import './effective-input.css';

export function EffectiveInputDetails({
  input,
  mode,
  damageEffectStacks,
}: {
  input: DamageResolutionInput;
  mode: 'quick' | 'direct';
  damageEffectStacks: readonly DamageEffectStack[];
}) {
  return (
    <section className="automatic-abilities" aria-label="計算に使用する最終値">
      <details className="effective-input-details">
        <summary>
          <strong>計算に使用する最終値</strong>
          <small>{mode === 'quick' ? 'マスターと対象から解決' : '入力値をそのまま使用'}</small>
        </summary>
        <dl className="automatic-modifiers">
          <div>
            <dt>合計ATK</dt>
            <dd>
              {numberFormatter.format(input.attackerAtk + input.fouAtk + input.craftEssenceAtk)}
            </dd>
          </div>
          <div>
            <dt>クラス攻撃補正</dt>
            <dd>{input.classAttackRate.toFixed(2)}倍</dd>
          </div>
          <div>
            <dt>クラス相性</dt>
            <dd>{input.classAffinity.toFixed(2)}倍</dd>
          </div>
          <div>
            <dt>属性相性</dt>
            <dd>{input.attributeAffinity.toFixed(2)}倍</dd>
          </div>
          <div>
            <dt>攻撃バフ／敵防御</dt>
            <dd>
              {(input.attackBuff * 100).toFixed(1)}%／{(input.defenseBuff * 100).toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt>{input.cardType.toUpperCase()}性能／耐性</dt>
            <dd>
              {(input.cardBuff * 100).toFixed(1)}%／{(input.cardResistance * 100).toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt>宝具威力／耐性</dt>
            <dd>
              {(input.npDamageBuff * 100).toFixed(1)}%／{(input.npResistance * 100).toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt>特攻状態＋イベント</dt>
            <dd>{((input.powerMod + input.eventDamageBuff) * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>NP{input.npLevel} 特攻宝具</dt>
            <dd>{((input.npSpecialMultipliers[input.npLevel - 1] ?? 1) * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>特殊威力／特殊耐性</dt>
            <dd>
              {(input.specialDamageBuff * 100).toFixed(1)}%／
              {(input.specialResistance * 100).toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt>固定ダメージ／軽減</dt>
            <dd>
              {numberFormatter.format(input.flatDamage)}／{numberFormatter.format(input.damageCut)}
              {input.ignoreDamageCut ? '（軽減貫通）' : ''}
            </dd>
          </div>
        </dl>
        {mode === 'quick' && damageEffectStacks.length ? (
          <fieldset className="modifier-group">
            <legend>火力効果の内訳</legend>
            <ul className="modifier-chip-list">
              {damageEffectStacks.map((stack) => (
                <ModifierChip
                  key={stack.kind}
                  active={stack.sources.some(damageEffectContributes)}
                  label={stack.label}
                  detail={stack.sources
                    .map((source) => `${source.effectLabel} ${damageEffectStateLabel(source)}`)
                    .join('・')}
                  sources={stack.sources.map((source) => ({
                    key: source.key,
                    label: `${source.sourceName}・${source.effectName} ${damageEffectStateLabel(source)}`,
                    imageKey: source.imageKey,
                  }))}
                />
              ))}
            </ul>
          </fieldset>
        ) : mode === 'quick' ? (
          <p className="notice">自動適用される宝具火力能力はありません。</p>
        ) : null}
      </details>
      {mode === 'direct' ? (
        <p className="notice">直接入力ではパッシブ・スキル・礼装効果を自動加算しません。</p>
      ) : null}
    </section>
  );
}
