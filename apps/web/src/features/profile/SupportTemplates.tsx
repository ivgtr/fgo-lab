import { useMemo, useState } from 'react';
import type { ServantMaster } from '@fgo-lab/master-data';
import type { ServantBuild, SupportEffect, SupportTemplate } from '@fgo-lab/schema';
import { ServantPicker } from '../../ui/ServantPicker';
import { SupportSourceCard } from '../support/SupportSourceCard';
import { SupportTemplateRow } from '../support/SupportTemplateRow';
import {
  createServantMap,
  groupSupportSources,
  supportTemplateSearchText,
} from '../support/supportTemplatePresentation';
import './profile.css';

type SortOrder = 'used' | 'updated' | 'name';

export function SupportTemplates({
  templates,
  servants,
  builds,
  onAdd,
  onAddSource,
  onUpdateTemplate,
  onRemoveTemplate,
  onRemoveSource,
  onUpdateSource,
  onUpdateEffect,
}: {
  templates: SupportTemplate[];
  servants: ServantMaster[];
  builds: Record<string, ServantBuild>;
  onAdd: () => Promise<string>;
  onAddSource: (
    templateId: string,
    servantId: string,
    ownership: SupportEffect['ownership'],
  ) => Promise<void>;
  onUpdateTemplate: (
    templateId: string,
    patch: Partial<Pick<SupportTemplate, 'name' | 'lastUsedAt'>>,
  ) => Promise<void>;
  onRemoveTemplate: (templateId: string) => Promise<void>;
  onRemoveSource: (templateId: string, sourceInstanceId: string) => Promise<void>;
  onUpdateSource: (
    templateId: string,
    sourceInstanceId: string,
    ownership: SupportEffect['ownership'],
  ) => Promise<void>;
  onUpdateEffect: (
    templateId: string,
    sourceInstanceId: string,
    effectId: string,
    patch: Partial<Pick<SupportEffect, 'enabled' | 'skillLevel'>>,
  ) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.templateId ?? '');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('used');
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const servantById = useMemo(() => createServantMap(servants), [servants]);
  const normalizedSearch = search.trim().toLocaleLowerCase('ja');
  const visible = [...templates]
    .filter((template) =>
      supportTemplateSearchText(template, servantById).includes(normalizedSearch),
    )
    .sort((left, right) => {
      if (sortOrder === 'name') return left.name.localeCompare(right.name, 'ja');
      const leftDate = sortOrder === 'used' ? (left.lastUsedAt ?? left.updatedAt) : left.updatedAt;
      const rightDate =
        sortOrder === 'used' ? (right.lastUsedAt ?? right.updatedAt) : right.updatedAt;
      return rightDate.localeCompare(leftDate);
    });
  const selected = templates.find((template) => template.templateId === selectedId) ?? templates[0];
  const sources = selected ? groupSupportSources(selected) : [];

  async function createTemplate() {
    const templateId = await onAdd();
    setSelectedId(templateId);
    setMobileDetailOpen(true);
  }

  async function removeTemplate() {
    if (!selected || !confirm(`「${selected.name}」を削除しますか？`)) return;
    await onRemoveTemplate(selected.templateId);
    setMobileDetailOpen(false);
  }

  return (
    <div
      className={`master-detail support-master-detail${mobileDetailOpen ? ' mobile-detail-open' : ''}`}
    >
      <section className="overview-pane">
        <div className="support-template-search-row">
          <label>
            <span className="visually-hidden">支援条件を検索</span>
            <input
              type="search"
              placeholder="条件名・支援役・効果で検索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button type="button" className="primary" onClick={() => void createTemplate()}>
            新規作成
          </button>
        </div>
        <div className="profile-list-summary">
          <p>{visible.length}件</p>
          <select
            aria-label="支援条件の並び順"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          >
            <option value="used">最近使用</option>
            <option value="updated">更新が新しい</option>
            <option value="name">名前順</option>
          </select>
        </div>
        {visible.length === 0 ? (
          <div className="support-empty-state">
            <p>
              {templates.length === 0
                ? '保存済みの支援条件はありません。'
                : '検索条件に一致する支援条件はありません。'}
            </p>
            {templates.length === 0 ? (
              <button type="button" className="primary" onClick={() => void createTemplate()}>
                最初の支援条件を作成
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="servant-list support-template-list"
            role="list"
            aria-label="保存済み支援条件"
          >
            {visible.map((template) => (
              <span role="listitem" key={template.templateId}>
                <SupportTemplateRow
                  template={template}
                  servantById={servantById}
                  selected={selected?.templateId === template.templateId}
                  onSelect={() => {
                    setSelectedId(template.templateId);
                    setMobileDetailOpen(true);
                  }}
                />
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="detail-editor support-template-editor" aria-label="支援条件の編集">
        <button className="mobile-back" onClick={() => setMobileDetailOpen(false)}>
          ← 支援条件一覧へ戻る
        </button>
        {!selected ? (
          <div className="support-empty-state">
            <p>左の一覧から編集する支援条件を選択してください。</p>
          </div>
        ) : (
          <>
            <label className="support-template-name">
              <span>支援条件名</span>
              <input
                key={selected.templateId}
                defaultValue={selected.name}
                maxLength={80}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (!name) {
                    event.target.value = selected.name;
                    return;
                  }
                  if (name !== selected.name) void onUpdateTemplate(selected.templateId, { name });
                }}
              />
            </label>
            <p className="support-template-summary">
              支援元 {sources.length}騎・使用中{' '}
              {selected.effects.filter((effect) => effect.enabled).length}スキル
            </p>

            <div className="support-source-stack">
              {sources.map((sourceGroup) => {
                const servant = servantById.get(sourceGroup.sourceId);
                const duplicateCount = sources.filter(
                  (candidate) => candidate.sourceId === sourceGroup.sourceId,
                ).length;
                const duplicateIndex =
                  sources
                    .filter((candidate) => candidate.sourceId === sourceGroup.sourceId)
                    .findIndex(
                      (candidate) => candidate.sourceInstanceId === sourceGroup.sourceInstanceId,
                    ) + 1;
                const sourceName = servant?.name ?? sourceGroup.sourceId;
                return (
                  <SupportSourceCard
                    key={sourceGroup.sourceInstanceId}
                    group={sourceGroup}
                    servant={servant}
                    displayName={`${sourceName}${duplicateCount > 1 ? ` ${String(duplicateIndex)}` : ''}`}
                    onOwnershipChange={(ownership) =>
                      void onUpdateSource(
                        selected.templateId,
                        sourceGroup.sourceInstanceId,
                        ownership,
                      )
                    }
                    onRemove={() =>
                      void onRemoveSource(selected.templateId, sourceGroup.sourceInstanceId)
                    }
                    onEffectChange={(sourceInstanceId, effectId, patch) =>
                      void onUpdateEffect(selected.templateId, sourceInstanceId, effectId, patch)
                    }
                  />
                );
              })}
            </div>

            <button type="button" onClick={() => setSourceDialogOpen(true)}>
              ＋ 支援元を追加
            </button>

            <details className="support-effect-summary">
              <summary>適用効果の概要</summary>
              {selected.effects.some((effect) => effect.enabled) ? (
                <ul>
                  {sources.flatMap((sourceGroup) => {
                    const servant = servantById.get(sourceGroup.sourceId);
                    return sourceGroup.effects.flatMap((effect) => {
                      if (!effect.enabled) return [];
                      const skill = servant?.skills.find(
                        (candidate) => candidate.id === effect.effectId,
                      );
                      return (skill?.effects ?? []).map((item) => (
                        <li key={`${sourceGroup.sourceInstanceId}:${effect.effectId}:${item.id}`}>
                          <strong>{item.label}</strong>
                          <span>
                            {servant?.name ?? sourceGroup.sourceId}・
                            {skill?.name ?? effect.effectId}
                          </span>
                        </li>
                      ));
                    });
                  })}
                </ul>
              ) : (
                <p>使用中のスキルはありません。</p>
              )}
            </details>

            <p aria-live="polite" className="support-save-state">
              妥当な変更は端末内へ自動保存されます。
            </p>
            <button type="button" className="danger-text" onClick={() => void removeTemplate()}>
              この支援条件を削除
            </button>
          </>
        )}
      </section>

      {sourceDialogOpen && selected ? (
        <ServantPicker
          purpose="support"
          title="支援元サーヴァントを選択"
          servants={servants.filter((servant) => servant.skills.length > 0)}
          sources={[
            {
              id: 'owned',
              label: '所持・育成管理',
              includes: (servant) => Boolean(builds[servant.id]?.npLevel),
            },
            { id: 'master', label: '全サーヴァント', includes: () => true },
          ]}
          initialSourceId="owned"
          description={(servant, sourceId) =>
            sourceId === 'owned'
              ? `保存スキルLv ${servant.skills.map((skill) => String(builds[servant.id]?.skills[String(skill.slot)] ?? 1)).join('/')}`
              : `${String(servant.skills.length)}スキル・フレンドとして追加`
          }
          onSelect={(servant, sourceId) => {
            void onAddSource(
              selected.templateId,
              servant.id,
              sourceId === 'owned' ? 'owned' : 'friend',
            );
            setSourceDialogOpen(false);
          }}
          onClose={() => setSourceDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
