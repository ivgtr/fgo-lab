import { useState } from 'react';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { ServantBuild, ServantTarget } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import './profile.css';

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
  const [tab, setTab] = useState<'current' | 'target'>('current');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'owned' | 'unowned'>('all');
  const [selectedId, setSelectedId] = useState(servants[0]?.id ?? '');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const visible = servants.filter((candidate) => {
    const owned = (builds[candidate.id]?.npLevel ?? 0) > 0;
    const normalizedSearch = search.toLocaleLowerCase('ja');
    return (
      (candidate.name.toLocaleLowerCase('ja').includes(normalizedSearch) ||
        candidate.classId.toLocaleLowerCase('ja').includes(normalizedSearch)) &&
      (scope === 'all' || (scope === 'owned' ? owned : !owned))
    );
  });
  const selected = servants.find((candidate) => candidate.id === selectedId) ?? visible[0];
  const build = selected ? builds[selected.id] : undefined;
  const target = selected ? targets[selected.id] : undefined;
  return (
    <div className={`master-detail${mobileDetailOpen ? ' mobile-detail-open' : ''}`}>
      <section className="overview-pane">
        <label>
          検索
          <input
            type="search"
            placeholder="名称・クラス"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="toolbar" aria-label="所持状態フィルター">
          {(['all', 'owned', 'unowned'] as const).map((value) => (
            <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>
              {value === 'all' ? '全件' : value === 'owned' ? '所持のみ' : '未所持のみ'}
            </button>
          ))}
        </div>
        <p>{visible.length}騎</p>
        <div className="servant-list" role="list" aria-label="サーヴァント一覧">
          {visible.map((candidate) => (
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
                  {candidate.classId}・{candidate.npTarget === 'all' ? '全体' : '単体'}
                  {candidate.npCard.toUpperCase()}
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
              </span>
            </button>
          ))}
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
                  {selected.classId}・{selected.npTarget === 'all' ? '全体' : '単体'}
                  {selected.npCard.toUpperCase()}宝具
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
