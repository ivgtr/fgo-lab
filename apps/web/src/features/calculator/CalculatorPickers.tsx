import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  deriveCraftEssenceAtk,
  type CraftEssenceMaster,
  type ServantMaster,
} from '@fgo-lab/master-data';
import type { CraftEssenceCopy, ServantBuild, SupportTemplate } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import './calculator-pickers.css';

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

export function AttackerPicker({
  servants,
  builds,
  initialSource,
  onSelect,
  onClose,
}: {
  servants: ServantMaster[];
  builds: Record<string, ServantBuild>;
  initialSource: 'owned' | 'master';
  onSelect: (servant: ServantMaster, source: 'owned' | 'master') => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState(initialSource);
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('ja');
  const visible = servants
    .filter((candidate) => source === 'master' || Boolean(builds[candidate.id]?.npLevel))
    .filter((candidate) =>
      [candidate.name, candidate.classId, candidate.id]
        .join(' ')
        .toLocaleLowerCase('ja')
        .includes(normalizedSearch),
    )
    .slice(0, 100);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attacker-picker-title"
      className="dialog"
      onKeyDown={(event) => trapModalKeyboard(event, onClose)}
    >
      <div className="dialog-panel picker-dialog-panel">
        <div className="section-heading">
          <h2 id="attacker-picker-title">攻撃役を選択</h2>
          <button onClick={onClose}>閉じる</button>
        </div>
        <div role="tablist" aria-label="攻撃役の選択元" className="source-tabs">
          <button role="tab" aria-selected={source === 'owned'} onClick={() => setSource('owned')}>
            所持・育成管理
          </button>
          <button
            role="tab"
            aria-selected={source === 'master'}
            onClick={() => setSource('master')}
          >
            全DB
          </button>
        </div>
        <label>
          名前・クラス
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </label>
        {visible.length === 0 ? (
          <p className="empty">一致する攻撃役はありません。</p>
        ) : (
          <ul className="plain-list picker-result-list">
            {visible.map((candidate) => {
              const saved = builds[candidate.id];
              return (
                <li key={candidate.id}>
                  <button className="list-row" onClick={() => onSelect(candidate, source)}>
                    <MasterImage src={candidate.imageKey} alt="" fallback={candidate.name} />
                    <span className="list-row-main">
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.classId}・
                        {source === 'owned' && saved
                          ? `Lv${saved.level} / NP${saved.npLevel} / フォウ${saved.fouAtk}`
                          : 'Lv90 / NP1 / フォウ1000（仮想）'}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {visible.length === 100 && (
          <p className="notice">先頭100件を表示中です。名前またはクラスで絞り込んでください。</p>
        )}
      </div>
    </div>
  );
}

export function CraftEssencePicker({
  copies,
  masters,
  initialSource,
  onSelect,
  onClose,
}: {
  copies: CraftEssenceCopy[];
  masters: CraftEssenceMaster[];
  initialSource: 'registered' | 'master';
  onSelect: (
    master: CraftEssenceMaster,
    source: 'registered' | 'master',
    copy?: CraftEssenceCopy,
  ) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState(initialSource);
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('ja');
  const visible =
    source === 'registered'
      ? copies
          .map((copy) => ({
            copy,
            master: masters.find((candidate) => candidate.id === copy.craftEssenceId),
          }))
          .filter((entry): entry is { copy: CraftEssenceCopy; master: CraftEssenceMaster } =>
            Boolean(entry.master),
          )
          .filter(({ master }) =>
            [master.name, master.id].join(' ').toLocaleLowerCase('ja').includes(normalizedSearch),
          )
          .slice(0, 100)
      : masters
          .filter((candidate) =>
            [candidate.name, candidate.id]
              .join(' ')
              .toLocaleLowerCase('ja')
              .includes(normalizedSearch),
          )
          .slice(0, 100)
          .map((master) => ({ master, copy: undefined }));
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculation-ce-picker-title"
      className="dialog"
      onKeyDown={(event) => trapModalKeyboard(event, onClose)}
    >
      <div className="dialog-panel picker-dialog-panel">
        <div className="section-heading">
          <h2 id="calculation-ce-picker-title">概念礼装を選択</h2>
          <button onClick={onClose}>閉じる</button>
        </div>
        <div role="tablist" aria-label="概念礼装の選択元" className="source-tabs">
          <button
            role="tab"
            aria-selected={source === 'registered'}
            onClick={() => setSource('registered')}
          >
            登録済みコピー
          </button>
          <button
            role="tab"
            aria-selected={source === 'master'}
            onClick={() => setSource('master')}
          >
            全DB
          </button>
        </div>
        <label>
          礼装名
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </label>
        {visible.length === 0 ? (
          <p className="empty">
            {source === 'registered'
              ? '登録済みの概念礼装はありません。全DBから仮想礼装を選択できます。'
              : '一致する概念礼装はありません。'}
          </p>
        ) : (
          <ul className="plain-list picker-result-list">
            {visible.map(({ master, copy }) => (
              <li key={copy?.copyId ?? master.id}>
                <button className="list-row" onClick={() => onSelect(master, source, copy)}>
                  <MasterImage src={master.imageKey} alt="" fallback={master.name} />
                  <span className="list-row-main">
                    <strong>{master.name}</strong>
                    <small>
                      {copy
                        ? `登録コピー・Lv${copy.level}・${copy.limitBreak === 4 ? '最大解放' : `${copy.limitBreak}回突破`}・ATK ${deriveCraftEssenceAtk(master, copy.level, copy.limitBreak)}`
                        : `Lv1・未突破（仮想）・ATK ${deriveCraftEssenceAtk(master, 1, 0)}`}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {visible.length === 100 && (
          <p className="notice">先頭100件を表示中です。礼装名で絞り込んでください。</p>
        )}
      </div>
    </div>
  );
}

export function SupportTemplatePicker({
  templates,
  servants,
  onSelect,
  onClose,
}: {
  templates: SupportTemplate[];
  servants: ServantMaster[];
  onSelect: (template: SupportTemplate) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const visible = templates.filter((template) => {
    const sourceNames = template.effects.map(
      (effect) => servants.find((servant) => servant.id === effect.sourceId)?.name ?? '',
    );
    return [template.name, ...sourceNames]
      .join(' ')
      .toLocaleLowerCase('ja')
      .includes(search.toLocaleLowerCase('ja'));
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-template-picker-title"
      className="dialog"
      onKeyDown={(event) => trapModalKeyboard(event, onClose)}
    >
      <div className="dialog-panel">
        <h2 id="support-template-picker-title">保存済み支援条件</h2>
        <label>
          条件名・サーヴァント名
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </label>
        {visible.length === 0 ? (
          <p>一致する支援条件はありません。</p>
        ) : (
          <ul className="plain-list template-picker-list">
            {visible.map((template) => {
              const sourceIds = [...new Set(template.effects.map((effect) => effect.sourceId))];
              return (
                <li key={template.templateId}>
                  <span className="list-row-main">
                    <strong>{template.name}</strong>
                    <small>
                      {sourceIds.length}騎・使用中
                      {template.effects.filter((effect) => effect.enabled).length}スキル
                    </small>
                  </span>
                  <button onClick={() => onSelect(template)}>呼び出す</button>
                </li>
              );
            })}
          </ul>
        )}
        <button onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
