import { applyRankingSelectionCommand } from '@fgo-lab/calculation-application';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application/ranking-contracts';
import { useMemo, useState } from 'react';
import type { RankingPolicyDetail, RankingProfileInput } from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { RankingConditions } from './RankingConditions';
import { RankingFilters } from './RankingFilters';
import { RankingList } from './RankingList';
import { filterAndRankRows, rankingPolicyLabel } from './rankingPresentation';
import { useRankingUrlState } from './rankingState';
import { useRanking } from './useRanking';
import './ranking.css';

function resetConditions() {
  const result = applyRankingSelectionCommand(DEFAULT_RANKING_POLICY_CONDITIONS, { kind: 'reset' });
  if (result.status === 'invalid') throw new TypeError(result.reason);
  return result.selection;
}

export function Ranking({
  master,
  profile,
  versions,
  onOpenCalculator,
}: {
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  versions: VersionContext;
  onOpenCalculator: (detail: RankingPolicyDetail) => void;
}) {
  const [urlState, setUrlState] = useRankingUrlState();
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const ranking = useRanking({ master, profile, conditions: urlState.conditions, versions });
  const rows = useMemo(
    () => filterAndRankRows(ranking.rows, urlState.filters, urlState.metric),
    [ranking.rows, urlState.filters, urlState.metric],
  );
  const toggleDetail = (row: (typeof rows)[number]) => {
    const next = openEntryId === row.entryId ? null : row.entryId;
    setOpenEntryId(next);
    if (next) ranking.requestDetail(row);
  };
  return (
    <section className="ranking-page">
      <div className="section-heading ranking-heading">
        <div>
          <p className="eyebrow">RANKING</p>
          <h2>宝具火力ランキング</h2>
        </div>
        <span>
          {urlState.conditions ? rankingPolicyLabel(urlState.conditions) : '計算条件が無効です'}
        </span>
      </div>
      {urlState.conditions ? (
        <RankingConditions
          conditions={urlState.conditions}
          onChange={(conditions) => {
            setOpenEntryId(null);
            setUrlState((current) => ({ ...current, conditions }));
          }}
        />
      ) : (
        <div role="alert">
          計算条件が無効です。
          <button
            type="button"
            onClick={() =>
              setUrlState((current) => ({
                ...current,
                conditions: resetConditions(),
                invalidCalculationQuery: undefined,
              }))
            }
          >
            計算条件をリセット
          </button>
        </div>
      )}
      <RankingFilters
        filters={urlState.filters}
        metric={urlState.metric}
        master={master}
        onChange={(filters) => setUrlState((current) => ({ ...current, filters }))}
        onMetricChange={(metric) => setUrlState((current) => ({ ...current, metric }))}
      />
      <p role="status" className="ranking-status" aria-live="polite">
        {urlState.conditions === null
          ? '計算条件を確認してください'
          : ranking.loading
            ? `ランキングを更新中… 現在${String(rows.length)}件表示`
            : `${String(rows.length)}件表示 / ${String(ranking.rows.length)}件を計算${ranking.exclusions.length > 0 ? `・順位外 ${String(ranking.exclusions.length)}件` : ''}`}
      </p>
      {ranking.error ? (
        <p role="alert" className="empty">
          ランキングを更新できません: {ranking.error}
        </p>
      ) : null}
      {ranking.loading && ranking.rows.length === 0 ? (
        <div className="ranking-loading" aria-hidden="true">
          <span className="ranking-loading-spinner" />
          <span>
            <strong>ランキングを計算しています</strong>
            <small>サーヴァントと攻撃形態を比較中…</small>
          </span>
        </div>
      ) : (
        <RankingList
          rows={rows}
          openEntryId={openEntryId}
          details={ranking.details}
          detailErrors={ranking.detailErrors}
          master={master}
          onToggle={toggleDetail}
          onRetryDetail={ranking.requestDetail}
          onOpenCalculator={onOpenCalculator}
        />
      )}
      {ranking.exclusions.length > 0 ? (
        <details className="ranking-failures">
          <summary>順位外 {ranking.exclusions.length}件</summary>
          <ul>
            {ranking.exclusions.map((exclusion) => (
              <li key={exclusion.entryId}>
                <strong>{exclusion.name}</strong> —{' '}
                {exclusion.status === 'unavailableUnderPolicy' ? '条件下で実行不可' : '無効'}:{' '}
                {exclusion.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
