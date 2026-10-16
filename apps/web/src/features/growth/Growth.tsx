import { useState } from 'react';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import { calculateGrowthLedger, filterAndSortLedger } from '@fgo-lab/profile-domain';
import type { activeProfile } from '@fgo-lab/profile-domain';
import { MasterImage } from '../../ui/MasterImage';
import './growth.css';

export function Growth({
  master,
  profile,
  onOpenTargets,
}: {
  master: MasterDataSnapshot;
  profile: ReturnType<typeof activeProfile>;
  onOpenTargets: () => void;
}) {
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<'game' | 'amount' | 'name'>('game');
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState<string>();
  const ledger = calculateGrowthLedger(
    master.servants,
    master.materials,
    profile.servantBuilds,
    profile.servantTargets,
  );
  const visible = filterAndSortLedger(ledger, search, category, order);
  const hasPlannedTarget = Object.values(profile.servantTargets).some((target) => target.planned);
  const selected = ledger.find((entry) => entry.material.id === selectedId) ?? visible[0];
  const servantById = new Map(master.servants.map((servant) => [servant.id, servant]));
  return (
    <section>
      {ledger.length === 0 ? (
        <section className="growth-empty">
          <p className="growth-empty-step">次にすること</p>
          <h2>
            {hasPlannedTarget ? '集計対象の追加素材はありません' : '育成目標を設定しましょう'}
          </h2>
          <p>
            {hasPlannedTarget
              ? '現在値と目標を確認し、次の育成を計画できます。'
              : 'サーヴァントの現在値と目標を登録すると、集計できる素材をここで確認できます。'}
          </p>
          <button type="button" className="primary" onClick={onOpenTargets}>
            {hasPlannedTarget ? '育成目標を見直す' : '育成目標を設定する'}
          </button>
        </section>
      ) : (
        <>
          <p className="notice">種火条件: 星5・クラス一致・成功ボーナスなし</p>
          <div className="toolbar">
            <label>
              素材名検索
              <input value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label>
              カテゴリ
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">すべて</option>
                {[...new Set(ledger.map((entry) => entry.material.category))].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              並び順
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as typeof order)}
              >
                <option value="game">ゲーム内順</option>
                <option value="amount">必要数順</option>
                <option value="name">素材名順</option>
              </select>
            </label>
          </div>
          <div className="growth-layout">
            <table>
              <caption>必要素材台帳</caption>
              <thead>
                <tr>
                  <th>素材</th>
                  <th>必要数</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <tr
                    key={entry.material.id}
                    aria-current={selected?.material.id === entry.material.id ? 'true' : undefined}
                  >
                    <th>
                      <button onClick={() => setSelectedId(entry.material.id)}>
                        <MasterImage
                          src={entry.material.imageKey}
                          alt=""
                          fallback={entry.material.name}
                          className="material-icon"
                        />
                        <span>
                          <strong>{entry.material.name}</strong>
                          <small>{entry.material.category}</small>
                        </span>
                      </button>
                    </th>
                    <td>{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <aside className="usage-detail" aria-label="素材の使用先">
              <h2>{selected?.material.name ?? '素材を選択'}</h2>
              <ul className="plain-list">
                {selected?.usages.map((usage) => (
                  <li key={`${usage.servantId}:${usage.purpose}`}>
                    <MasterImage
                      src={servantById.get(usage.servantId)?.imageKey ?? null}
                      alt=""
                      fallback={servantById.get(usage.servantId)?.name ?? usage.servantId}
                    />
                    <span className="list-row-main">
                      <strong>{servantById.get(usage.servantId)?.name ?? usage.servantId}</strong>
                      <small>{usage.purpose}</small>
                    </span>
                    <strong>{usage.amount}</strong>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
