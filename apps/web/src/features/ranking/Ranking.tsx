import { useMemo, useState } from 'react';
import type { RankingProfileInput } from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { CalculationScenario, VersionContext } from '@fgo-lab/schema';
import { RankingConditions } from './RankingConditions';
import { RankingFilters } from './RankingFilters';
import { RankingList } from './RankingList';
import { filterAndRankRows } from './rankingPresentation';
import { useRankingUrlState } from './rankingState';
import { useRanking } from './useRanking';
import './ranking.css';

export function Ranking({
  master,
  profile,
  versions,
  onOpenCalculator,
}: {
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  versions: VersionContext;
  onOpenCalculator: (scenario: CalculationScenario) => void;
}) {
  const [urlState, setUrlState] = useRankingUrlState();
  const [openServantId, setOpenServantId] = useState<string | null>(null);
  const ranking = useRanking({ master, profile, conditions: urlState.conditions, versions });
  const rows = useMemo(
    () => filterAndRankRows(ranking.rows, urlState.filters, urlState.metric),
    [ranking.rows, urlState.filters, urlState.metric],
  );
  const toggleDetail = (servantId: string) => {
    const next = openServantId === servantId ? null : servantId;
    setOpenServantId(next);
    if (next) ranking.requestDetail(next);
  };
  return (
    <section className="ranking-page">
      <div className="section-heading ranking-heading">
        <div>
          <p className="eyebrow">RANKING</p>
          <h2>宝具火力ランキング</h2>
        </div>
        <span>{urlState.conditions.comparisonMode === 'standard' ? '標準比較' : '所持戦力'}</span>
      </div>
      <RankingConditions
        conditions={urlState.conditions}
        onChange={(conditions) => {
          setOpenServantId(null);
          setUrlState((current) => ({ ...current, conditions }));
        }}
      />
      <RankingFilters
        filters={urlState.filters}
        metric={urlState.metric}
        master={master}
        onChange={(filters) => setUrlState((current) => ({ ...current, filters }))}
        onMetricChange={(metric) => setUrlState((current) => ({ ...current, metric }))}
      />
      <p role="status" className="ranking-status" aria-live="polite">
        {ranking.loading
          ? `ランキングを更新中… 現在${String(rows.length)}件表示`
          : `${String(rows.length)}件表示 / ${String(ranking.rows.length)}件を計算${ranking.failures.length > 0 ? `・順位外 ${String(ranking.failures.length)}件` : ''}`}
      </p>
      {ranking.error ? (
        <p role="alert" className="empty">
          ランキングを更新できません: {ranking.error}
        </p>
      ) : null}
      <RankingList
        rows={rows}
        openServantId={openServantId}
        details={ranking.details}
        detailErrors={ranking.detailErrors}
        master={master}
        onToggle={toggleDetail}
        onRetryDetail={ranking.requestDetail}
        onOpenCalculator={onOpenCalculator}
      />
      {ranking.failures.length > 0 ? (
        <details className="ranking-failures">
          <summary>順位外 {ranking.failures.length}件</summary>
          <ul>
            {ranking.failures.map((failure) => (
              <li key={failure.servantId}>
                <strong>{failure.name}</strong> —{' '}
                {failure.status === 'inputRequired' ? '入力が必要' : '計算対象外'}: {failure.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
