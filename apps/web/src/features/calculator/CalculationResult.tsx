import { useRef, useState } from 'react';
import type {
  DamageResolutionInput,
  CalculationResult as CalculationResultValue,
  CalculationScenario,
  CalculationShareSnapshot,
} from '@fgo-lab/schema';
import { SCHEMA_VERSION } from '@fgo-lab/schema';
import { createShareFragment, resultCardPng } from '../../adapters/share';
import { numberFormatter } from '../../ui/i18n';
import { MasterImage } from '../../ui/MasterImage';
import './calculation-result.css';

export function CalculationResult({
  input,
  result,
  scenario,
  attackerName,
  attackerImage,
  targetSummary,
  craftEssenceSummary,
  supportSummary,
  enabledAttackerSkillCount,
  onFinalize,
}: {
  input: DamageResolutionInput;
  result: CalculationResultValue;
  scenario: CalculationScenario;
  attackerName: string;
  attackerImage: string | null;
  targetSummary: string;
  craftEssenceSummary: string;
  supportSummary: string;
  enabledAttackerSkillCount: number;
  onFinalize: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const resultCardRef = useRef<HTMLElement>(null);
  const snapshot = {
    kind: 'fgo-lab-calculation-share',
    schemaVersion: SCHEMA_VERSION,
    sharedAt: new Date().toISOString(),
    scenario,
    result,
  } satisfies CalculationShareSnapshot;
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
              <h2>宝具ダメージ</h2>
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
        </dl>
        {result.status === 'unsupported' ? (
          <p className="empty" role="alert">
            現在の条件は正確に計算できないため、ダメージ値を表示していません。
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
            FGO Lab・DB {result.versions.masterDataVersion}・Engine {result.versions.engineVersion}・
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
