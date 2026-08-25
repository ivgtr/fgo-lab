import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getPrimaryNpPresentation, type ServantMaster } from '@fgo-lab/master-data';
import { MasterImage } from './MasterImage';
import {
  ServantAdvancedFilterFields,
  ServantClassQuickFilter,
  ServantFilterChips,
} from './ServantFilters';
import {
  clearServantFilterDetails,
  countActiveServantFilterGroups,
  createEmptyServantFilters,
  filterServants,
} from './servantFilters';
import { servantClassLabels } from './servantFilterOptions';
import './servant-picker.css';

type SourceOption = {
  id: string;
  label: string;
  includes: (servant: ServantMaster) => boolean;
};

function trapModalKeyboard(event: ReactKeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function ServantPicker({
  purpose,
  title,
  servants,
  sources,
  initialSourceId,
  description,
  onSelect,
  onClose,
}: {
  purpose: 'attacker' | 'support';
  title: string;
  servants: ServantMaster[];
  sources?: SourceOption[];
  initialSourceId?: string;
  description: (servant: ServantMaster, sourceId: string) => string;
  onSelect: (servant: ServantMaster, sourceId: string) => void;
  onClose: () => void;
}) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const filterPanelId = `${generatedId}-filters`;
  const defaultSourceId = initialSourceId ?? sources?.[0]?.id ?? 'all';
  const [sourceId, setSourceId] = useState(defaultSourceId);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(createEmptyServantFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const showNpFilters = purpose === 'attacker';
  const source = sources?.find((candidate) => candidate.id === sourceId);
  const sourceServants = servants.filter((servant) => source?.includes(servant) ?? true);
  const filtered = filterServants(sourceServants, filters, search);
  const visible = filtered.slice(0, 100);
  const activeDetailFilterCount =
    countActiveServantFilterGroups(filters) - (filters.classId === null ? 0 : 1);
  const closeFilters = () => {
    setFiltersOpen(false);
    window.requestAnimationFrame(() => filterButtonRef.current?.focus());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="dialog"
      onKeyDown={(event) => trapModalKeyboard(event, onClose)}
    >
      <div className="dialog-panel servant-picker-panel">
        <div className="section-heading servant-picker-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onClose} autoFocus>
            閉じる
          </button>
        </div>
        {sources && sources.length > 1 ? (
          <div role="tablist" aria-label="サーヴァントの選択元" className="source-tabs">
            {sources.map((option) => {
              const count = servants.filter(option.includes).length;
              return (
                <button
                  type="button"
                  role="tab"
                  key={option.id}
                  aria-label={option.label}
                  aria-selected={sourceId === option.id}
                  onClick={() => setSourceId(option.id)}
                >
                  {option.label} <small>{count}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="servant-picker-search-row">
          <label>
            <span className="visually-hidden">名前で検索</span>
            <input
              type="search"
              value={search}
              placeholder="名前で検索"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            ref={filterButtonRef}
            className="servant-picker-filter-button"
            aria-expanded={filtersOpen}
            aria-controls={filterPanelId}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            絞り込み
            {activeDetailFilterCount > 0 ? <span>{activeDetailFilterCount}</span> : null}
          </button>
        </div>
        <ServantClassQuickFilter
          classId={filters.classId}
          onChange={(classId) => setFilters((current) => ({ ...current, classId }))}
        />
        <ServantFilterChips filters={filters} onChange={setFilters} showNpFilters={showNpFilters} />
        <div className={`servant-picker-content${filtersOpen ? ' filters-open' : ''}`}>
          {filtersOpen ? (
            <section
              id={filterPanelId}
              className="servant-picker-filter-panel"
              aria-label="詳細条件"
            >
              <div className="servant-picker-filter-heading">
                <div>
                  <strong>詳細な絞り込み</strong>
                  <small>項目内は複数選択できます</small>
                </div>
                <button
                  type="button"
                  onClick={() => setFilters((current) => clearServantFilterDetails(current))}
                  disabled={activeDetailFilterCount === 0}
                >
                  条件をクリア
                </button>
              </div>
              <div className="servant-picker-filter-body">
                <ServantAdvancedFilterFields
                  filters={filters}
                  onChange={setFilters}
                  showNpFilters={showNpFilters}
                />
              </div>
              <button type="button" className="servant-picker-show-results" onClick={closeFilters}>
                {filtered.length}騎の候補を見る
              </button>
            </section>
          ) : null}
          <section className="servant-result-panel" aria-label="候補一覧">
            <p className="servant-result-count" role="status" aria-live="polite">
              <strong>{filtered.length}騎</strong>
              <span> / {sourceServants.length}騎中</span>
              {filtered.length > visible.length ? <span>・100騎まで表示</span> : null}
            </p>
            {visible.length === 0 ? (
              <p className="empty">条件に一致するサーヴァントはいません。</p>
            ) : (
              <ul className="plain-list picker-result-list servant-picker-results">
                {visible.map((candidate) => {
                  const np = getPrimaryNpPresentation(candidate);
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="list-row"
                        onClick={() => onSelect(candidate, sourceId)}
                      >
                        <MasterImage src={candidate.imageKey} alt="" fallback={candidate.name} />
                        <span className="list-row-main">
                          <strong>{candidate.name}</strong>
                          <small>
                            ★{candidate.rarity}・
                            {servantClassLabels.get(candidate.classId) ?? candidate.classId}
                            {showNpFilters && np
                              ? `・${np.card === 'buster' ? 'Buster' : np.card === 'arts' ? 'Arts' : 'Quick'}・${np.target === 'all' ? '全体' : '単体'}宝具`
                              : ''}
                          </small>
                          <small>{description(candidate, sourceId)}</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
