import { useState } from 'react';
import { deriveCraftEssenceAtk, type CraftEssenceMaster } from '@fgo-lab/master-data';
import type { CraftEssenceCopy } from '@fgo-lab/schema';
import { MasterImage } from '../../ui/MasterImage';
import './profile.css';

export function CraftEssences({
  copies,
  masters,
  onAdd,
  onRemove,
  onUpdate,
}: {
  copies: CraftEssenceCopy[];
  masters: CraftEssenceMaster[];
  onAdd: (craftEssenceId: string) => Promise<void>;
  onRemove: (copyId: string) => Promise<void>;
  onUpdate: (
    copyId: string,
    patch: Pick<Partial<CraftEssenceCopy>, 'level' | 'limitBreak'>,
  ) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const names = new Map(masters.map((master) => [master.id, master.name]));
  const masterById = new Map(masters.map((master) => [master.id, master]));
  const orderedCopies = [...copies].sort(
    (a, b) =>
      (names.get(a.craftEssenceId) ?? a.craftEssenceId).localeCompare(
        names.get(b.craftEssenceId) ?? b.craftEssenceId,
        'ja',
      ) || a.copyId.localeCompare(b.copyId),
  );
  const candidates = masters
    .filter((master) =>
      master.name.toLocaleLowerCase('ja').includes(search.toLocaleLowerCase('ja')),
    )
    .slice(0, 100);
  return (
    <section className="craft-essence-page">
      <h2>登録済み {copies.length}枚</h2>
      <button className="primary" onClick={() => setDialogOpen(true)}>
        DBから礼装を登録
      </button>
      <ul className="plain-list" aria-label="登録済み概念礼装">
        {orderedCopies.map((copy) => {
          const master = masterById.get(copy.craftEssenceId);
          const label = names.get(copy.craftEssenceId) ?? copy.craftEssenceId;
          return (
            <li key={copy.copyId}>
              <MasterImage src={master?.imageKey ?? null} alt="" fallback={label} />
              <span className="list-row-main">
                <strong>{label}</strong>
                <small>
                  {master
                    ? `ATK ${String(deriveCraftEssenceAtk(master, copy.level, copy.limitBreak))}`
                    : ''}
                </small>
              </span>
              <label>
                Lv
                <input
                  aria-label={`${label}のレベル`}
                  type="number"
                  min="1"
                  max={master?.maxLevelByLimitBreak[copy.limitBreak] ?? 100}
                  value={copy.level}
                  onChange={(event) =>
                    void onUpdate(copy.copyId, { level: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                限界突破
                <select
                  aria-label={`${label}の限界突破`}
                  value={copy.limitBreak}
                  onChange={(event) =>
                    void onUpdate(copy.copyId, { limitBreak: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value === 4 ? '最大解放' : `${String(value)}回`}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => void onRemove(copy.copyId)}>登録解除</button>
            </li>
          );
        })}
      </ul>
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ce-dialog-title"
          className="dialog"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDialogOpen(false);
          }}
        >
          <div className="dialog-panel">
            <h2 id="ce-dialog-title">概念礼装を検索</h2>
            <label>
              礼装名
              <input value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
            </label>
            <ul className="plain-list" aria-label="概念礼装DB検索結果">
              {candidates.map((master) => (
                <li key={master.id}>
                  <span>{master.name}</span>
                  <button
                    onClick={() => {
                      void onAdd(master.id);
                      setDialogOpen(false);
                    }}
                  >
                    登録
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
