import { useState } from 'react';
import type { VersionContext } from '@fgo-lab/schema';
import { numberFormatter } from '../../ui/i18n';
import { useRanking } from './useRanking';
import type { RankingCandidate } from './ranking.worker';
import './ranking.css';

export function Ranking({
  candidates,
  versions,
}: {
  candidates: RankingCandidate[];
  versions: VersionContext;
}) {
  const ranking = useRanking(candidates, versions);
  const [classId, setClassId] = useState('any');
  const [card, setCard] = useState('any');
  const [target, setTarget] = useState('any');
  const [rarity, setRarity] = useState('any');
  const [scope, setScope] = useState<'all' | 'owned'>('all');
  const classes = [...new Set(candidates.map((candidate) => candidate.classId))].sort((a, b) =>
    a.localeCompare(b),
  );
  const rows = ranking.rows.filter(
    (row) =>
      (classId === 'any' || row.classId === classId) &&
      (card === 'any' || row.npCard === card) &&
      (target === 'any' || row.npTarget === target) &&
      (rarity === 'any' || row.rarity === Number(rarity)) &&
      (scope === 'all' || row.owned),
  );
  return (
    <section>
      <div className="toolbar">
        <label>
          対象範囲
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as 'all' | 'owned')}
          >
            <option value="all">全サーヴァント</option>
            <option value="owned">所持サーヴァント</option>
          </select>
        </label>
        <label>
          クラス
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="any">すべて</option>
            {classes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          宝具カード
          <select value={card} onChange={(event) => setCard(event.target.value)}>
            <option value="any">すべて</option>
            <option value="buster">Buster</option>
            <option value="arts">Arts</option>
            <option value="quick">Quick</option>
          </select>
        </label>
        <label>
          宝具範囲
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="any">すべて</option>
            <option value="single">単体</option>
            <option value="all">全体</option>
          </select>
        </label>
        <label>
          レアリティ
          <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
            <option value="any">すべて</option>
            {[5, 4, 3, 2, 1, 0].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ranking-table-scroll" role="region" tabIndex={0} aria-label="ランキング表">
        <table>
          <caption>共通条件の平均ダメージ順</caption>
          <thead>
            <tr>
              <th>順位</th>
              <th>サーヴァント</th>
              <th>平均</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.servantId}>
                <td>{index + 1}</td>
                <th>{row.name}</th>
                <td className="average">{numberFormatter.format(row.average)}</td>
                <td>{row.precision}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status" className="notice">
        {ranking.loading
          ? 'Workerで計算中…'
          : `${String(rows.length)}件表示 / ${String(ranking.rows.length)}件をWorkerで計算・unsupported ${String(ranking.unsupported.length)}件`}
      </p>
    </section>
  );
}
