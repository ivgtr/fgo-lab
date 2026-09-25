import { useRef, useState } from 'react';
import type { EffectInputViewModel } from '@fgo-lab/calculation-application';
import type {
  DamageResolutionInput,
  CalculationResult as CalculationResultValue,
  CalculationShareSnapshot,
  PortableCalculationRequest,
} from '@fgo-lab/schema';
import { SCHEMA_VERSION } from '@fgo-lab/schema';
import { createShareFragment, resultCardPng } from '../../adapters/share';
import { numberFormatter } from '../../ui/i18n';
import { MasterImage } from '../../ui/MasterImage';
import { CalculationContextNotice } from './CalculationContextNotice';
import './calculation-result.css';

function effectInputValue(input: EffectInputViewModel): string | null {
  if (input.value === null) return null;
  return input.control === 'percentage' ? `${String(input.value / 10)}%` : String(input.value);
}

export function CalculationResult({
  input,
  result,
  request,
  attackerName,
  attackerImage,
  targetSummary,
  craftEssenceSummary,
  supportSummary,
  enabledAttackerSkillCount,
  effectInputs,
  onFinalize,
  onResetPortableRequest,
  resetPending,
  resetError,
}: {
  input: DamageResolutionInput;
  result: CalculationResultValue;
  request: PortableCalculationRequest;
  attackerName: string;
  attackerImage: string | null;
  targetSummary: string;
  craftEssenceSummary: string;
  supportSummary: string;
  enabledAttackerSkillCount: number;
  effectInputs: readonly EffectInputViewModel[];
  onFinalize: () => Promise<void>;
  onResetPortableRequest: () => Promise<void>;
  resetPending?: boolean | undefined;
  resetError?: string | undefined;
}) {
  const [message, setMessage] = useState('');
  const resultCardRef = useRef<HTMLElement>(null);
  const snapshot = {
    kind: 'fgo-lab-calculation-share',
    schemaVersion: SCHEMA_VERSION,
    sharedAt: new Date().toISOString(),
    request,
    result,
  } satisfies CalculationShareSnapshot;
  const specialInputSummary = effectInputs.flatMap((item) => {
    const value = effectInputValue(item);
    return value === null ? [] : [`${item.label} ${value}`];
  });
  async function copyUrl() {
    try {
      await onFinalize();
      const url = new URL(location.href);
      url.hash = createShareFragment(snapshot);
      await navigator.clipboard.writeText(url.toString());
      setMessage('共有URLをコピーしました');
    } catch (cause) {
      setMessage(
        cause instanceof RangeError
          ? 'URLが長いため共有専用JSONまたは画像を使用してください'
          : 'URLをコピーできませんでした',
      );
    }
  }
  async function saveImage() {
    try {
      if (!resultCardRef.current) throw new Error('result_card_missing');
      await onFinalize();
      const url = URL.createObjectURL(await resultCardPng(resultCardRef.current));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fgo-lab-result.png';
      link.click();
      URL.revokeObjectURL(url);
      setMessage('結果画像を保存しました');
    } catch {
      setMessage('画像を保存できません。結果カードをスクリーンショットしてください。');
    }
  }
  async function saveShareJson() {
    await onFinalize();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fgo-lab-calculation.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('共有専用JSONを保存しました');
  }
  return (
    <div className="result-column">
      <CalculationContextNotice
        state="current"
        request={request}
        onReset={onResetPortableRequest}
        resetPending={resetPending}
        resetError={resetError}
      />
      <article
        ref={resultCardRef}
        className="result-card"
        data-share-card
        aria-label="共有対象の計算結果"
      >
        <header className="result-card-head">
          <div className="result-card-title">
            <div>
              <p className="eyebrow">RESULT</p>
              <h2 tabIndex={-1} data-calculation-result-heading>
                宝具ダメージ
              </h2>
            </div>
            <span>平均・最低・最大</span>
          </div>
          <div className="result-subject">
            <MasterImage src={attackerImage} alt="" fallback={attackerName} />
            <span>
              <strong>{attackerName}</strong>
              <small>
                Lv.{input.attackerLevel}・NP{input.npLevel}・{craftEssenceSummary}
              </small>
            </span>
          </div>
        </header>
        <dl className="result-conditions">
          <div>
            <dt>攻撃対象</dt>
            <dd>{targetSummary}</dd>
          </div>
          <div>
            <dt>自身スキル</dt>
            <dd>{enabledAttackerSkillCount ? `${enabledAttackerSkillCount}件適用` : 'なし'}</dd>
          </div>
          <div>
            <dt>支援</dt>
            <dd>{supportSummary}</dd>
          </div>
          {specialInputSummary.length ? (
            <div>
              <dt>特殊条件</dt>
              <dd>{specialInputSummary.join('・')}</dd>
            </div>
          ) : null}
        </dl>
        {result.status !== 'calculated' ? (
          <p className="empty" role="alert">
            {result.status === 'inputRequired'
              ? '正確な計算に必要な戦闘情報を入力してください。'
              : result.status === 'unavailable'
                ? result.reason === 'attackerDead'
                  ? 'HPが0のため宝具を使用できません。準備開始時のHPと準備操作を確認してください。'
                  : result.reason === 'selectedAttackProfileHasNoAttack'
                    ? '選択中の攻撃宝具へ到達できません。形態変更と宝具選択の効果を確認してください。'
                    : result.reason === 'selectedAttackProfileChanged'
                      ? '選択中とは別の攻撃宝具が選ばれました。形態変更と宝具選択の効果を確認してください。'
                      : '現在の準備状態では宝具を使用できません。NPゲージと準備操作を確認してください。'
                : '現在の条件は正確に計算できないため、ダメージ値を表示していません。'}
          </p>
        ) : (
          <table className="np-result-table">
            <caption className="visually-hidden">宝具レベル別のダメージ</caption>
            <thead>
              <tr>
                <th>宝具Lv</th>
                <th className="average">平均</th>
                <th>最低</th>
                <th>最大</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr
                  key={row.npLevel}
                  aria-current={row.npLevel === input.npLevel ? 'true' : undefined}
                >
                  <th>
                    NP{row.npLevel}
                    {row.npLevel === input.npLevel && <small>現在</small>}
                  </th>
                  <td className="average">{numberFormatter.format(row.average)}</td>
                  <td>{numberFormatter.format(row.minimum)}</td>
                  <td>{numberFormatter.format(row.maximum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <footer className="result-card-foot">
          <small>
            FGO Lab・DB {result.versions.masterDataVersion}・Engine {result.versions.engineVersion}
            ・
            {result.status === 'calculated'
              ? result.precision === 'exact'
                ? '検証済み精度'
                : '暫定精度'
              : '計算対象外'}
          </small>
        </footer>
      </article>
      <div className="result-actions">
        <button className="primary" onClick={() => void copyUrl()}>
          URLをコピー
        </button>
        <button onClick={() => void saveImage()}>画像として保存</button>
        <button aria-label="共有専用JSONを保存" onClick={() => void saveShareJson()}>
          共有専用JSON
        </button>
      </div>
      <p aria-live="polite">{message}</p>
      <details className="result-details">
        <summary>計算内訳・根拠・仮定・警告</summary>
        {result.status === 'calculated' && (
          <section>
            <h3>精度</h3>
            <p>
              {result.precision === 'exact'
                ? '使用した計算要素はすべて検証済みです。'
                : '検証途上の計算要素を含むため暫定値です。'}
            </p>
            <h3>計算内訳</h3>
            <dl>
              {result.breakdown.map((item) => (
                <div key={item.key}>
                  <dt>{item.labelKey}</dt>
                  <dd>{numberFormatter.format(item.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {result.status === 'unsupported' && (
          <section>
            <h3>計算できない理由</h3>
            <ul>
              {result.missingEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {result.status === 'inputRequired' && (
          <section>
            <h3>必要な入力</h3>
            <ul>
              {result.requiredInputs.map((item) => (
                <li key={item.key}>
                  {item.label}: {item.description}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>仮定</h3>
          {result.assumptions.length ? (
            <ul>
              {result.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>追加の仮定はありません。</p>
          )}
        </section>
        {specialInputSummary.length ? (
          <section>
            <h3>特殊入力</h3>
            <ul>
              {effectInputs.map((item) => (
                <li key={item.key}>
                  {item.label}: {effectInputValue(item) ?? '未入力'}
                  {item.explicit ? '（明示入力）' : '（自動導出）'}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h3>警告</h3>
          {result.issues.length ? (
            <ul>
              {result.issues.map((item) => (
                <li key={`${item.code}:${item.detail}`}>
                  {item.code}: {item.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p>警告はありません。</p>
          )}
        </section>
        <section>
          <h3>計算trace</h3>
          <ol>
            {result.trace.map((item, index) => (
              <li key={`${String(index)}:${item.step}:${item.detail}`}>
                {item.step}: {item.detail}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>検証根拠</h3>
          <ul>
            {result.evidence.map((item) => (
              <li key={item.key}>
                {item.key} — {item.status === 'validated' ? '検証済み' : '暫定'}（確認日{' '}
                {item.reviewedAt}）
              </li>
            ))}
          </ul>
        </section>
      </details>
    </div>
  );
}
