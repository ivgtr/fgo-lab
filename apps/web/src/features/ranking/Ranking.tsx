import { applyRankingSelectionCommand } from '@fgo-lab/calculation-application';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application/ranking-contracts';
import { memo, useEffect, useMemo, useState } from 'react';
import { useLayoutEffect, useRef } from 'react';
import type {
  AttackProfile,
  RankingPolicyDetail,
  RankingProfileInput,
} from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import type { VersionContext } from '@fgo-lab/schema';
import { RankingConditions } from './RankingConditions';
import { RankingFilters } from './RankingFilters';
import { RankingList } from './RankingList';
import {
  rankingExclusionLabel,
  rankingExclusionRecoveryLabel,
  rankingExclusionStatusLabel,
} from './rankingDetailPresentation';
import { filterAndRankRows, rankingPolicyLabel } from './rankingPresentation';
import { useRankingUrlState } from './rankingState';
import { useRanking } from './useRanking';
import './ranking.css';

function resetConditions() {
  const result = applyRankingSelectionCommand(DEFAULT_RANKING_POLICY_CONDITIONS, { kind: 'reset' });
  if (result.status === 'invalid') throw new TypeError(result.reason);
  return result.selection;
}

function exclusionDomKey(entryId: string): string {
  return entryId.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
}

function RankingView({
  active = true,
  master,
  profile,
  versions,
  onOpenCalculator,
  onOpenCalculatorForAttackProfile,
  onComparisonChange,
  onRankingSearchChange,
  onReload,
  onEditSavedBuild,
}: {
  active?: boolean;
  master: MasterDataSnapshot;
  profile: RankingProfileInput;
  versions: VersionContext;
  onOpenCalculator: (detail: RankingPolicyDetail) => void;
  onOpenCalculatorForAttackProfile: (target: {
    servantId: string;
    attackProfile: AttackProfile;
  }) => void;
  onComparisonChange?: () => void;
  onRankingSearchChange?: ((search: string) => void) | undefined;
  onReload?: () => void;
  onEditSavedBuild: () => void;
}) {
  const [urlState, setUrlState] = useRankingUrlState();
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState(true);
  const rankingStatusRef = useRef<HTMLParagraphElement>(null);
  const focusStatusAfterResetRef = useRef(false);
  const ranking = useRanking({ master, profile, conditions: urlState.conditions, versions });
  useLayoutEffect(() => {
    if (active) onRankingSearchChange?.(location.search);
  }, [active, onRankingSearchChange, urlState]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 760px)');
    const alignWithViewport = () => setConditionsOpen(!media.matches);
    alignWithViewport();
    media.addEventListener('change', alignWithViewport);
    return () => media.removeEventListener('change', alignWithViewport);
  }, []);
  useLayoutEffect(() => {
    if (active) onComparisonChange?.();
  }, [
    active,
    onComparisonChange,
    urlState.conditions,
    master,
    profile.servantBuilds,
    versions.schemaVersion,
    versions.masterDataVersion,
    versions.engineVersion,
    versions.appVersion,
    versions.gameRegion,
    versions.masterDataLocale,
  ]);
  const rows = useMemo(
    () => filterAndRankRows(ranking.rows, urlState.filters, urlState.metric),
    [ranking.rows, urlState.filters, urlState.metric],
  );
  const toggleDetail = (row: (typeof rows)[number]) => {
    const next = openEntryId === row.entryId ? null : row.entryId;
    setOpenEntryId(next);
    if (next) ranking.requestDetail(row);
    else ranking.clearDetail();
  };
  const resetRankingConditions = () => {
    setOpenEntryId(null);
    focusStatusAfterResetRef.current = true;
    setUrlState((current) => ({
      ...current,
      conditions: resetConditions(),
      invalidCalculationQuery: undefined,
    }));
  };
  useLayoutEffect(() => {
    if (!focusStatusAfterResetRef.current) return;
    rankingStatusRef.current?.focus();
    focusStatusAfterResetRef.current = false;
  }, [urlState.conditions]);
  const reloadRanking = onReload ?? (() => window.location.reload());
  return (
    <section className="ranking-page">
      <div className="ranking-context" aria-label="現在の比較条件">
        <strong>現在の比較条件</strong>
        <p>
          {urlState.conditions ? rankingPolicyLabel(urlState.conditions) : '計算条件が無効です'}
        </p>
      </div>
      {urlState.conditions ? (
        <details
          className="ranking-condition-disclosure"
          open={conditionsOpen}
          onToggle={(event) => setConditionsOpen(event.currentTarget.open)}
        >
          <summary>比較条件を変更</summary>
          <RankingConditions
            conditions={urlState.conditions}
            onChange={(conditions) => {
              setOpenEntryId(null);
              setUrlState((current) => ({ ...current, conditions }));
            }}
          />
        </details>
      ) : (
        <div role="alert">
          計算条件が無効です。
          <button type="button" onClick={resetRankingConditions}>
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
      <p
        ref={rankingStatusRef}
        role="status"
        className="ranking-status"
        aria-live="polite"
        tabIndex={-1}
      >
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
          onOpenCalculatorForAttackProfile={onOpenCalculatorForAttackProfile}
          onReload={reloadRanking}
        />
      )}
      {ranking.exclusions.length > 0 ? (
        <details className="ranking-failures">
          <summary>順位外 {ranking.exclusions.length}件</summary>
          <ul aria-label="順位外の計算結果">
            {ranking.exclusions.map((exclusion) => {
              const domKey = exclusionDomKey(exclusion.entryId);
              const reasonId = `ranking-exclusion-reason-${domKey}`;
              const inputsId = `ranking-exclusion-inputs-${domKey}`;
              const descriptionIds = exclusion.requiredInputs.length
                ? `${reasonId} ${inputsId}`
                : reasonId;
              return (
                <li
                  key={exclusion.entryId}
                  data-outcome-status={exclusion.status}
                  className="ranking-exclusion"
                >
                  <strong>{exclusion.name}</strong>
                  <span> — {rankingExclusionStatusLabel(exclusion.status)}</span>
                  <p id={reasonId}>{rankingExclusionLabel(exclusion.status, exclusion.reason)}</p>
                  {exclusion.requiredInputs.length > 0 ? (
                    <ul
                      id={inputsId}
                      className="ranking-required-inputs"
                      aria-label={`${exclusion.name}に必要な入力`}
                    >
                      {exclusion.requiredInputs.map((input) => (
                        <li key={input.key}>
                          <strong>{input.label}</strong>: {input.description}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {exclusion.recovery.kind === 'openCalculator' && exclusion.attackProfile ? (
                    <button
                      type="button"
                      aria-describedby={descriptionIds}
                      onClick={() =>
                        onOpenCalculatorForAttackProfile({
                          servantId: exclusion.servantId,
                          attackProfile: exclusion.attackProfile!,
                        })
                      }
                    >
                      {rankingExclusionRecoveryLabel(exclusion.recovery)}
                    </button>
                  ) : exclusion.recovery.kind === 'editSavedBuild' ? (
                    <button
                      type="button"
                      aria-describedby={descriptionIds}
                      onClick={onEditSavedBuild}
                    >
                      {rankingExclusionRecoveryLabel(exclusion.recovery)}
                    </button>
                  ) : exclusion.recovery.kind === 'resetRankingConditions' ? (
                    <button
                      type="button"
                      aria-describedby={descriptionIds}
                      onClick={resetRankingConditions}
                    >
                      {rankingExclusionRecoveryLabel(exclusion.recovery)}
                    </button>
                  ) : exclusion.recovery.kind === 'reload' ? (
                    <button type="button" aria-describedby={descriptionIds} onClick={reloadRanking}>
                      {rankingExclusionRecoveryLabel(exclusion.recovery)}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export const Ranking = memo(
  RankingView,
  // Keep the last active worker inputs while another page is shown.
  (previous, next) => previous.active === false && next.active === false,
);
