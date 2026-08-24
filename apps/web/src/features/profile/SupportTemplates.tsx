import { useState } from 'react';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { SupportTemplate } from '@fgo-lab/schema';
import './profile.css';

export function SupportTemplates({
  templates,
  servants,
  onAdd,
  onAddSource,
  onUpdateEffect,
}: {
  templates: SupportTemplate[];
  servants: ServantMaster[];
  onAdd: () => Promise<void>;
  onAddSource: (templateId: string, servantId: string) => Promise<void>;
  onUpdateEffect: (
    templateId: string,
    sourceId: string,
    effectId: string,
    patch: Partial<Pick<SupportTemplate['effects'][number], 'enabled' | 'skillLevel'>>,
  ) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.templateId ?? '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = templates.find((template) => template.templateId === selectedId) ?? templates[0];
  const servantById = new Map(servants.map((servant) => [servant.id, servant]));
  const sources = selected ? [...new Set(selected.effects.map((effect) => effect.sourceId))] : [];
  const candidates = servants
    .filter(
      (servant) =>
        servant.skills.length > 0 &&
        servant.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')),
    )
    .slice(0, 100);
  return (
    <section>
      <button
        className="primary"
        onClick={() =>
          void onAdd().then(() => {
            setSelectedId('');
          })
        }
      >
        支援条件を作成
      </button>
      {templates.length === 0 ? (
        <p>保存済みの支援条件はありません。</p>
      ) : (
        <>
          <label>
            保存済み支援条件
            <select
              value={selected?.templateId ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.templateId} value={template.templateId}>
                  {template.name}（{template.effects.filter((effect) => effect.enabled).length}
                  スキル使用）
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <section aria-label="支援条件の編集">
              <h2>{selected.name}</h2>
              <p>
                支援元 {sources.length}騎 / 使用中{' '}
                {selected.effects.filter((effect) => effect.enabled).length}スキル / DB{' '}
                {selected.masterDataVersion}
              </p>
              <button onClick={() => setDialogOpen(true)}>支援元を追加</button>
              {sources.map((sourceId) => {
                const source = servantById.get(sourceId);
                const effects = selected.effects.filter((effect) => effect.sourceId === sourceId);
                return (
                  <section key={sourceId} className="support-source">
                    <h3>{source?.name ?? sourceId}</h3>
                    <ul className="plain-list">
                      {effects.map((effect) => {
                        const skill = source?.skills.find(
                          (candidate) => candidate.id === effect.effectId,
                        );
                        return (
                          <li key={effect.effectId}>
                            <label>
                              <input
                                type="checkbox"
                                checked={effect.enabled}
                                onChange={(event) =>
                                  void onUpdateEffect(
                                    selected.templateId,
                                    sourceId,
                                    effect.effectId,
                                    {
                                      enabled: event.target.checked,
                                    },
                                  )
                                }
                              />
                              {skill?.name ?? effect.effectId}を使用
                            </label>
                            <label>
                              Lv
                              <select
                                aria-label={`${skill?.name ?? effect.effectId}のスキルレベル`}
                                value={effect.skillLevel}
                                onChange={(event) =>
                                  void onUpdateEffect(
                                    selected.templateId,
                                    sourceId,
                                    effect.effectId,
                                    {
                                      skillLevel: Number(event.target.value),
                                    },
                                  )
                                }
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <small>
                              {skill?.detail}
                              {skill?.effects.map(
                                (item) => ` / ${item.label}・対象:${item.target}`,
                              )}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </section>
          )}
        </>
      )}
      {dialogOpen && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-source-title"
          className="dialog"
        >
          <div className="dialog-panel">
            <h2 id="support-source-title">支援元サーヴァントを検索</h2>
            <label>
              サーヴァント名
              <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
            </label>
            <ul className="plain-list">
              {candidates.map((servant) => (
                <li key={servant.id}>
                  <span>
                    {servant.name} / {servant.skills.length}スキル
                  </span>
                  <button
                    onClick={() => {
                      void onAddSource(selected.templateId, servant.id);
                      setDialogOpen(false);
                    }}
                  >
                    追加
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setDialogOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </section>
  );
}
