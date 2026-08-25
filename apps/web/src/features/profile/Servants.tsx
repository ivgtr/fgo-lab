import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getPrimaryNpPresentation, type ServantMaster } from '@fgo-lab/master-data';
import type { ServantBuild, ServantTarget } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import {
  ServantAdvancedFilterFields,
  ServantClassQuickFilter,
  ServantFilterChips,
} from '../../ui/ServantFilters';
import {
  clearServantFilterDetails,
  countActiveServantFilterGroups,
  createEmptyServantFilters,
  filterServants,
  toggleFilterValue,
} from '../../ui/servantFilters';
import './profile.css';

type Scope = 'all' | 'owned' | 'unowned';
type PlanStatus = 'unplanned' | 'gap' | 'achieved';
type SortOrder = 'master' | 'updated' | 'level';

function hasGrowthGap(build: ServantBuild | undefined, target: ServantTarget | undefined) {
  if (!target?.planned) return false;
  if (target.level > (build?.level ?? 1)) return true;
  if (target.ascension > (build?.ascension ?? 0)) return true;
  if (target.fouAtk > (build?.fouAtk ?? 0)) return true;
  for (const slot of ['1', '2', '3']) {
    if ((target.skills[slot] ?? 1) > (build?.skills[slot] ?? 1)) return true;
  }
  for (const slot of ['1', '2', '3', '4', '5']) {
    if ((target.appends[slot] ?? 0) > (build?.appends[slot] ?? 0)) return true;
  }
  return false;
}

function getPlanStatus(
  build: ServantBuild | undefined,
  target: ServantTarget | undefined,
): PlanStatus {
  if (!target?.planned) return 'unplanned';
  return hasGrowthGap(build, target) ? 'gap' : 'achieved';
}

function trapDialogKeyboard(event: ReactKeyboardEvent<HTMLDivElement>, close: () => void) {
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

export function Servants({
  servants,
  builds,
  targets,
  onChange,
  onTargetChange,
}: {
  servants: ServantMaster[];
  builds: Record<string, ServantBuild>;
  targets: Record<string, ServantTarget>;
  onChange: (servantId: string, patch: Partial<ServantBuild>) => Promise<void>;
  onTargetChange: (servantId: string, patch: Partial<ServantTarget>) => Promise<void>;
}) {
  const generatedId = useId();
  const [tab, setTab] = useState<'current' | 'target'>('current');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [filters, setFilters] = useState(createEmptyServantFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [planStatuses, setPlanStatuses] = useState<Set<PlanStatus>>(() => new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>('master');
  const [selectedId, setSelectedId] = useState(servants[0]?.id ?? '');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const planFiltered = servants.filter(
    (candidate) =>
      planStatuses.size === 0 ||
      planStatuses.has(getPlanStatus(builds[candidate.id], targets[candidate.id])),
  );
  const filteredWithoutScope = filterServants(planFiltered, filters, search);
  const scoped = filteredWithoutScope.filter((candidate) => {
    const owned = (builds[candidate.id]?.npLevel ?? 0) > 0;
    return scope === 'all' || (scope === 'owned' ? owned : !owned);
  });
  const visible = [...scoped].sort((left, right) => {
    if (sortOrder === 'level') {
      return (builds[right.id]?.level ?? 0) - (builds[left.id]?.level ?? 0);
    }
    if (sortOrder === 'updated') {
      return (builds[right.id]?.updatedAt ?? '').localeCompare(builds[left.id]?.updatedAt ?? '');
    }
    return 0;
  });
  const selected = visible.find((candidate) => candidate.id === selectedId) ?? visible[0];
  const selectedNp = selected ? getPrimaryNpPresentation(selected) : null;
  const build = selected ? builds[selected.id] : undefined;
  const target = selected ? targets[selected.id] : undefined;
  const ownershipCounts = filteredWithoutScope.reduce(
    (counts, candidate) => {
      if ((builds[candidate.id]?.npLevel ?? 0) > 0) counts.owned += 1;
      else counts.unowned += 1;
      return counts;
    },
    { owned: 0, unowned: 0 },
  );
  const activeDetailFilterCount =
    countActiveServantFilterGroups(filters) -
    (filters.classId === null ? 0 : 1) +
    (planStatuses.size > 0 ? 1 : 0);
  const clearDetailFilters = () => {
    setFilters((current) => clearServantFilterDetails(current));
    setPlanStatuses(new Set());
  };
  const closeFilters = () => {
    setFiltersOpen(false);
    window.requestAnimationFrame(() => filterButtonRef.current?.focus());
  };
  return (
    <div className={`master-detail${mobileDetailOpen ? ' mobile-detail-open' : ''}`}>
      <section className="overview-pane">
        <div className="profile-servant-search-row">
          <label>
            <span className="visually-hidden">名前で検索</span>
            <input
              type="search"
              placeholder="名前で検索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            ref={filterButtonRef}
            className="profile-detail-filter-button"
            aria-haspopup="dialog"
            onClick={() => setFiltersOpen(true)}
          >
            絞り込み
            {activeDetailFilterCount > 0 ? <span>{activeDetailFilterCount}</span> : null}
          </button>
        </div>
        <div className="profile-scope-filter" aria-label="所持状態フィルター">
          {(['all', 'owned', 'unowned'] as const).map((value) => {
            const count =
              value === 'all'
                ? filteredWithoutScope.length
                : value === 'owned'
                  ? ownershipCounts.owned
                  : ownershipCounts.unowned;
            return (
              <button
                type="button"
                key={value}
                aria-label={
                  value === 'all' ? '全件' : value === 'owned' ? '所持のみ' : '未所持のみ'
                }
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                <span>{value === 'all' ? '全' : value === 'owned' ? '所持' : '未所持'}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
        <ServantClassQuickFilter
          classId={filters.classId}
          onChange={(classId) => setFilters((current) => ({ ...current, classId }))}
        />
        <ServantFilterChips filters={filters} onChange={setFilters} showNpFilters>
          {planStatuses.size > 0 ? (
            <button type="button" onClick={() => setPlanStatuses(new Set())}>
              育成状況 <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </ServantFilterChips>
        <div className="profile-list-summary">
          <p>{visible.length}騎</p>
          <div>
            <select
              aria-label="並び順"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            >
              <option value="master">実装順</option>
              <option value="updated">更新が新しい順</option>
              <option value="level">レベルが高い順</option>
            </select>
          </div>
        </div>
        {filtersOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${generatedId}-filter-title`}
            className="profile-filter-dialog"
            onKeyDown={(event) => trapDialogKeyboard(event, closeFilters)}
          >
            <div className="profile-filter-panel">
              <div className="profile-filter-heading">
                <div>
                  <h2 id={`${generatedId}-filter-title`}>詳細な絞り込み</h2>
                  <p>項目内は複数選択できます</p>
                </div>
                <button
                  type="button"
                  onClick={closeFilters}
                  autoFocus
                  aria-label="絞り込みを閉じる"
                >
                  閉じる
                </button>
              </div>
              <div className="profile-filter-body">
                <ServantAdvancedFilterFields filters={filters} onChange={setFilters} showNpFilters>
                  <fieldset className="servant-advanced-filter-group">
                    <legend>育成状況</legend>
                    <div className="servant-advanced-filter-options">
                      {(
                        [
                          ['unplanned', '予定なし'],
                          ['gap', '育成差分あり'],
                          ['achieved', '目標達成'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={planStatuses.has(value)}
                          onClick={() =>
                            setPlanStatuses((current) => toggleFilterValue(current, value))
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </ServantAdvancedFilterFields>
              </div>
              <div className="profile-filter-actions">
                <button
                  type="button"
                  onClick={clearDetailFilters}
                  disabled={activeDetailFilterCount === 0}
                >
                  条件をクリア
                </button>
                <button type="button" className="primary" onClick={closeFilters}>
                  {visible.length}騎を表示
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="servant-list" role="list" aria-label="サーヴァント一覧">
          {visible.map((candidate) => {
            const np = getPrimaryNpPresentation(candidate);
            return (
              <button
                role="listitem"
                key={candidate.id}
                className="list-row"
                aria-current={selected?.id === candidate.id ? 'true' : undefined}
                onClick={() => {
                  setSelectedId(candidate.id);
                  setMobileDetailOpen(true);
                }}
              >
                <MasterImage src={candidate.imageKey} alt="" fallback={candidate.name} />
                <span className="list-row-main">
                  <strong>{candidate.name}</strong>
                  <small>
                    {candidate.classId}・{np?.target === 'all' ? '全体' : '単体'}
                    {np?.card.toUpperCase()}
                  </small>
                </span>
                <span className="list-row-state">
                  <strong>
                    {builds[candidate.id]?.npLevel
                      ? `NP${String(builds[candidate.id]?.npLevel)}`
                      : 'NP0'}
                  </strong>
                  <small>
                    {builds[candidate.id]?.npLevel
                      ? `Lv.${String(builds[candidate.id]?.level)}`
                      : '未所持'}
                  </small>
                  {targets[candidate.id]?.planned ? (
                    <em
                      className={`growth-status ${hasGrowthGap(builds[candidate.id], targets[candidate.id]) ? 'gap' : 'achieved'}`}
                    >
                      {hasGrowthGap(builds[candidate.id], targets[candidate.id])
                        ? '育成差分'
                        : '目標達成'}
                    </em>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="detail-editor">
        <button className="mobile-back" onClick={() => setMobileDetailOpen(false)}>
          ← 一覧へ戻る
        </button>
        {!selected ? (
          <p>条件に一致するサーヴァントはいません。</p>
        ) : (
          <>
            <div role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'current'}
                onClick={() => setTab('current')}
              >
                現在値
              </button>
              <button role="tab" aria-selected={tab === 'target'} onClick={() => setTab('target')}>
                育成目標
              </button>
            </div>
            <div className="entity-summary detail-hero">
              <MasterImage
                src={selected.imageKey}
                alt=""
                fallback={selected.name}
                className="large"
              />
              <p>
                <strong>{selected.name}</strong>
                <small>
                  {selected.classId}・{selectedNp?.target === 'all' ? '全体' : '単体'}
                  {selectedNp?.card.toUpperCase()}宝具
                </small>
              </p>
            </div>
            {tab === 'current' && (
              <label>
                宝具Lv
                <select
                  value={build?.npLevel ?? 0}
                  onChange={(event) =>
                    void onChange(selected.id, { npLevel: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'NP0・未所持' : `NP${value}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              レベル
              <input
                type="number"
                min="1"
                max="120"
                value={
                  tab === 'current' ? (build?.level ?? 1) : (target?.level ?? build?.level ?? 1)
                }
                onChange={(event) =>
                  void (tab === 'current'
                    ? onChange(selected.id, { level: Number(event.target.value) })
                    : onTargetChange(selected.id, {
                        level: Number(event.target.value),
                        planned: true,
                      }))
                }
              />
            </label>
            <label>
              再臨段階
              <select
                value={tab === 'current' ? (build?.ascension ?? 0) : (target?.ascension ?? 0)}
                onChange={(event) =>
                  void (tab === 'current'
                    ? onChange(selected.id, { ascension: Number(event.target.value) })
                    : onTargetChange(selected.id, {
                        ascension: Number(event.target.value),
                        planned: true,
                      }))
                }
              >
                {[0, 1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ATKフォウ
              <input
                type="number"
                min="0"
                max="5000"
                step="10"
                value={tab === 'current' ? (build?.fouAtk ?? 0) : (target?.fouAtk ?? 0)}
                onChange={(event) =>
                  void (tab === 'current'
                    ? onChange(selected.id, { fouAtk: Number(event.target.value) })
                    : onTargetChange(selected.id, {
                        fouAtk: Number(event.target.value),
                        planned: true,
                      }))
                }
              />
            </label>
            {[1, 2, 3].map((slot) => {
              const key = String(slot);
              const skill = selected.skills[slot - 1];
              return (
                <label key={`skill:${key}`} className="skill-field">
                  <span className="field-identity">
                    <MasterImage
                      src={skill?.imageKey ?? null}
                      alt=""
                      fallback={skill?.name ?? String(slot)}
                      className="skill-icon"
                    />
                    <span>
                      <strong>{skill?.name ?? `スキル${String(slot)}`}</strong>
                      <small>スキル{slot}</small>
                    </span>
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={
                      tab === 'current' ? (build?.skills[key] ?? 1) : (target?.skills[key] ?? 1)
                    }
                    onChange={(event) => {
                      const level = Number(event.target.value);
                      if (tab === 'current')
                        void onChange(selected.id, {
                          skills: { ...build?.skills, [key]: level },
                        });
                      else
                        void onTargetChange(selected.id, {
                          skills: { ...target?.skills, [key]: level },
                          planned: true,
                        });
                    }}
                  />
                </label>
              );
            })}
            <details>
              <summary>アペンドスキル</summary>
              <div className="form-grid">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const key = String(slot);
                  return (
                    <label key={`append:${key}`}>
                      アペンド{slot}
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={
                          tab === 'current'
                            ? (build?.appends[key] ?? 0)
                            : (target?.appends[key] ?? 0)
                        }
                        onChange={(event) => {
                          const level = Number(event.target.value);
                          if (tab === 'current')
                            void onChange(selected.id, {
                              appends: { ...build?.appends, [key]: level },
                            });
                          else
                            void onTargetChange(selected.id, {
                              appends: { ...target?.appends, [key]: level },
                              planned: true,
                            });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            </details>
            <div className="toolbar">
              {[90, 100, 120].map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    void (tab === 'current'
                      ? onChange(selected.id, { level })
                      : onTargetChange(selected.id, { level, planned: true }))
                  }
                >
                  Lv{level}
                </button>
              ))}
              <button
                onClick={() =>
                  void (tab === 'current'
                    ? onChange(selected.id, {
                        skills: { ...build?.skills, '1': 10, '2': 10, '3': 10 },
                      })
                    : onTargetChange(selected.id, {
                        skills: { ...target?.skills, '1': 10, '2': 10, '3': 10 },
                        planned: true,
                      }))
                }
              >
                スキル全て10
              </button>
            </div>
            {tab === 'target' && (
              <label>
                <input
                  type="checkbox"
                  checked={target?.planned ?? false}
                  onChange={(event) =>
                    void onTargetChange(selected.id, { planned: event.target.checked })
                  }
                />
                育成計画へ含める
              </label>
            )}
            <p aria-live="polite">妥当な変更は端末内へ自動保存されます。</p>
          </>
        )}
      </section>
    </div>
  );
}
