import { useRef, useState } from 'react';
import type {
  CalcInput,
  CalcResult,
  CalculationSelection,
  CalculationShareSnapshot,
} from '@fgo-lab/schema';
import { createShareFragment, resultCardPng } from './adapters/share';
import { numberFormatter } from './i18n';
import { MasterImage } from './MasterImage';

export function CalculationResult({
  input,
  result,
  selection,
  attackerName,
  attackerImage,
  targetSummary,
  craftEssenceSummary,
  supportSummary,
  enabledAttackerSkillCount,
  onFinalize,
}: {
  input: CalcInput;
  result: CalcResult;
  selection: CalculationSelection;
  attackerName: string;
  attackerImage: string | null;
  targetSummary: string;
  craftEssenceSummary: string;
  supportSummary: string;
  enabledAttackerSkillCount: number;
  onFinalize: (input: CalcInput, result: CalcResult) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const resultCardRef = useRef<HTMLElement>(null);
  const snapshot = {
    kind: 'fgo-lab-calculation-share',
    schemaVersion: 1,
    sharedAt: new Date().toISOString(),
    input,
    result,
    composition: {
      craftEssence: selection.craftEssence
        ? {
            craftEssenceId: selection.craftEssence.craftEssenceId,
            level: selection.craftEssence.level,
            limitBreak: selection.craftEssence.limitBreak,
          }
        : null,
    },
  } satisfies CalculationShareSnapshot;
  async function copyUrl() {
    try {
      await onFinalize(input, result);
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
      await onFinalize(input, result);
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
  function saveShareJson() {
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
            {result.results.map((row) => (
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
        <footer className="result-card-foot">
          <span className={`precision precision-${result.precision}`}>{result.precision}</span>
          <small>FGO Lab・DB {result.versions.masterDataVersion}</small>
        </footer>
      </article>
      <div className="result-actions">
        <button className="primary" onClick={() => void copyUrl()}>
          URLをコピー
        </button>
        <button onClick={() => void saveImage()}>画像として保存</button>
        <button aria-label="共有専用JSONを保存" onClick={saveShareJson}>
          共有専用JSON
        </button>
      </div>
      <p aria-live="polite">{message}</p>
      <details className="result-details">
        <summary>計算内訳・仮定・警告</summary>
        <ul>
          {result.assumptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {result.warnings.map((item) => (
            <li key={item}>警告: {item}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
