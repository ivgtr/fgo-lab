import { useState } from 'react';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportTemplate, VersionContext } from '@fgo-lab/schema';
import { numberFormatter } from '../../ui/i18n';
import { SupportTemplatePicker } from '../calculator/CalculatorPickers';
import { useRanking } from './useRanking';
import type { RankingCandidate } from './ranking.worker';
import './ranking.css';

export function Ranking({
  candidates,
  versions,
  releaseValidated,
  supportTemplates,
  servants,
  selectedSupport,
  onSupportSelect,
}: {
  candidates: RankingCandidate[];
  versions: VersionContext;
  releaseValidated: boolean;
  supportTemplates: SupportTemplate[];
  servants: ServantMaster[];
  selectedSupport: SupportTemplate | undefined;
  onSupportSelect: (template: SupportTemplate | undefined) => Promise<void>;
}) {
  const ranking = useRanking(candidates, versions, releaseValidated);
  const [classId, setClassId] = useState('any');
  const [card, setCard] = useState('any');
  const [target, setTarget] = useState('any');
  const [rarity, setRarity] = useState('any');
  const [scope, setScope] = useState<'all' | 'owned'>('all');
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
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
      <section className="ranking-common-condition" aria-label="ランキングの共通支援条件">
        <span>
          <strong>支援条件</strong>
          <small>
            {selectedSupport
              ? `${selectedSupport.name}・使用${String(selectedSupport.effects.filter((effect) => effect.enabled).length)}スキル`
              : '支援なし'}
          </small>
        </span>
        <button type="button" onClick={() => setSupportDialogOpen(true)}>
          {selectedSupport ? '変更' : '選択'}
        </button>
        {selectedSupport ? (
          <button type="button" onClick={() => void onSupportSelect(undefined)}>
            解除
          </button>
        ) : null}
      </section>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.servantId}>
                <td>{index + 1}</td>
                <th>{row.name}</th>
                <td className="average">{numberFormatter.format(row.average)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status" className="notice">
        {ranking.loading
          ? 'Workerで計算中…'
          : `${String(rows.length)}件表示 / ${String(ranking.rows.length)}件を計算${ranking.unsupported.length > 0 ? `・計算対象外 ${String(ranking.unsupported.length)}件` : ''}`}
      </p>
      {supportDialogOpen ? (
        <SupportTemplatePicker
          templates={supportTemplates}
          servants={servants}
          onSelect={(template) => {
            void onSupportSelect(template);
            setSupportDialogOpen(false);
          }}
          onClose={() => setSupportDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}
