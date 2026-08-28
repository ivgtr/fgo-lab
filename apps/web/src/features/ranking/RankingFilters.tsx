import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import { allServantClasses, npCardLabel } from '../../ui/servantFilterOptions';
import { countActiveRankingFilters } from './rankingPresentation';
import type { RankingDamageMetric, RankingFiltersState } from './rankingState';

export function RankingFilters({
  filters,
  metric,
  master,
  onChange,
  onMetricChange,
}: {
  filters: RankingFiltersState;
  metric: RankingDamageMetric;
  master: MasterDataSnapshot;
  onChange: (filters: RankingFiltersState) => void;
  onMetricChange: (metric: RankingDamageMetric) => void;
}) {
  const activeCount = countActiveRankingFilters(filters);
  const classes = [...new Set(master.servants.map((servant) => servant.classId))].sort();
  return (
    <section className="ranking-filter-section" aria-label="ランキングの表示絞り込み">
      <div className="ranking-filter-primary">
        <label>
          <span className="visually-hidden">名前検索</span>
          <input
            type="search"
            value={filters.search}
            placeholder="名前で検索"
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
        </label>
        <label>
          並び順
          <select
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as RankingDamageMetric)}
          >
            <option value="average">平均順</option>
            <option value="minimum">最低順</option>
            <option value="maximum">最大順</option>
          </select>
        </label>
      </div>
      <details className="ranking-filter-details">
        <summary>絞り込み {activeCount > 0 ? `${String(activeCount)}件` : ''}</summary>
        <div className="ranking-filter-grid">
          <label>
            クラス
            <select
              value={filters.classId ?? ''}
              onChange={(event) => onChange({ ...filters, classId: event.target.value || null })}
            >
              <option value="">すべて</option>
              {classes.map((value) => (
                <option key={value} value={value}>
                  {allServantClasses.find((option) => option.values.includes(value))?.label ??
                    value}
                </option>
              ))}
            </select>
          </label>
          <label>
            レアリティ
            <select
              value={filters.rarity ?? ''}
              onChange={(event) =>
                onChange({
                  ...filters,
                  rarity: event.target.value ? Number(event.target.value) : null,
                })
              }
            >
              <option value="">すべて</option>
              {[5, 4, 3, 2, 1, 0].map((value) => (
                <option key={value} value={value}>
                  ★{value}
                </option>
              ))}
            </select>
          </label>
          <label>
            宝具カード
            <select
              value={filters.card ?? ''}
              onChange={(event) =>
                onChange({
                  ...filters,
                  card: (event.target.value || null) as RankingFiltersState['card'],
                })
              }
            >
              <option value="">すべて</option>
              {(['buster', 'arts', 'quick'] as const).map((value) => (
                <option key={value} value={value}>
                  {npCardLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            宝具範囲
            <select
              value={filters.target ?? ''}
              onChange={(event) =>
                onChange({
                  ...filters,
                  target: (event.target.value || null) as RankingFiltersState['target'],
                })
              }
            >
              <option value="">すべて</option>
              <option value="single">単体</option>
              <option value="all">全体</option>
            </select>
          </label>
          <label>
            所持状態
            <select
              value={filters.ownership}
              onChange={(event) =>
                onChange({
                  ...filters,
                  ownership: event.target.value as RankingFiltersState['ownership'],
                })
              }
            >
              <option value="all">すべて</option>
              <option value="owned">所持</option>
              <option value="unowned">未所持</option>
            </select>
          </label>
          <button
            type="button"
            className="ranking-filter-clear"
            disabled={activeCount === 0}
            onClick={() =>
              onChange({
                search: '',
                classId: null,
                rarity: null,
                card: null,
                target: null,
                ownership: 'all',
              })
            }
          >
            絞り込みを解除
          </button>
        </div>
      </details>
    </section>
  );
}
