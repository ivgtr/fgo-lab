import type { RankingDetail } from '@fgo-lab/calculation-application';
import type { MasterDataSnapshot } from '@fgo-lab/master-data';
import { MasterImage } from '../../ui/MasterImage';
import { ServantFilterIcon } from '../../ui/ServantFilterIcon';
import { numberFormatter } from '../../ui/i18n';
import { npCardIconUrl, npCardLabel, servantClassLabels } from '../../ui/servantFilterOptions';
import type { RankingPresentedRow } from './rankingPresentation';
import { RankingEffectDetails } from './RankingEffectDetails';

export function RankingList({
  rows,
  openEntryId,
  details,
  detailErrors,
  master,
  onToggle,
  onRetryDetail,
  onOpenCalculator,
}: {
  rows: readonly RankingPresentedRow[];
  openEntryId: string | null;
  details: Readonly<Record<string, RankingDetail>>;
  detailErrors: Readonly<Record<string, string>>;
  master: MasterDataSnapshot;
  onToggle: (row: RankingPresentedRow) => void;
  onRetryDetail: (row: RankingPresentedRow) => void;
  onOpenCalculator: (detail: RankingDetail) => void;
}) {
  return rows.length === 0 ? (
    <p className="empty">条件に一致する計算済みサーヴァントはいません。</p>
  ) : (
    <ol className="ranking-list" aria-label="宝具火力ランキング">
      {rows.map((row) => {
        const expanded = openEntryId === row.entryId;
        const detail = details[row.entryId];
        const detailError = detailErrors[row.entryId];
        const detailId = `ranking-detail-${row.entryId.replace(':', '-')}`;
        return (
          <li key={row.entryId} className={row.rank <= 3 ? 'ranking-top' : undefined}>
            <article className="ranking-row">
              <span className="ranking-position" aria-label={`${String(row.rank)}位`}>
                {row.rank}
              </span>
              <MasterImage src={row.imageKey} alt="" fallback={row.name} className="ranking-face" />
              <span className="ranking-servant">
                <strong>{row.name}</strong>
                <small>
                  <ServantFilterIcon
                    className="ranking-card-icon"
                    src={npCardIconUrl(row.npCard)}
                    fallback={row.npCard.slice(0, 1).toUpperCase()}
                  />
                  <span className="visually-hidden">{npCardLabel(row.npCard)}</span>
                  <span className="ranking-np-summary">
                    {row.npTarget === 'all' ? '全体' : '単体'}・
                    {row.attackProfile.terminalFormLabel
                      ? `${row.attackProfile.terminalFormLabel}・`
                      : ''}
                    {row.noblePhantasmName}・★
                    {row.rarity}・{servantClassLabels.get(row.classId) ?? row.classId}
                  </span>
                  {row.specialAttackApplied ? (
                    <span className="ranking-special-badge">特攻</span>
                  ) : null}
                </small>
                {row.owned ? (
                  <small>
                    Lv{row.level}・NP{row.npLevel}
                  </small>
                ) : null}
              </span>
              <span className="ranking-primary-damage">
                <strong>{numberFormatter.format(row.primaryDamage)}</strong>
                <small>
                  効果{row.appliedEffectCount}・支援{row.supportSourceCount}
                </small>
              </span>
              <button
                type="button"
                className="ranking-detail-toggle"
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => onToggle(row)}
              >
                {expanded ? '閉じる' : '詳細'}
              </button>
            </article>
            {expanded ? (
              <section id={detailId} aria-label={`${row.name}の計算詳細`}>
                {detail ? (
                  <RankingEffectDetails
                    detail={detail}
                    master={master}
                    onOpenCalculator={onOpenCalculator}
                  />
                ) : detailError ? (
                  <p role="alert" className="notice">
                    詳細を読み込めませんでした: {detailError}{' '}
                    <button type="button" onClick={() => onRetryDetail(row)}>
                      再試行
                    </button>
                  </p>
                ) : (
                  <p role="status" className="notice">
                    詳細を読み込み中…
                  </p>
                )}
              </section>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
