import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
  type RankingRowSummary,
} from '@fgo-lab/calculation-application/ranking-contracts';
import { allServantClasses } from '../../ui/servantFilterOptions';
import type { RankingDamageMetric, RankingFiltersState } from './rankingState';

export interface RankingPresentedRow extends RankingRowSummary {
  rank: number;
  primaryDamage: number;
}

export function rankingMetricValue(row: RankingRowSummary, metric: RankingDamageMetric): number {
  return row[metric];
}

export function filterAndRankRows(
  rows: readonly RankingRowSummary[],
  filters: RankingFiltersState,
  metric: RankingDamageMetric,
): RankingPresentedRow[] {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('ja');
  const selectedClass = allServantClasses.find((option) => option.id === filters.classId);
  return rows
    .filter(
      (row) =>
        (normalizedSearch.length === 0 ||
          `${row.name} ${row.servantId}`.toLocaleLowerCase('ja').includes(normalizedSearch)) &&
        (!selectedClass || selectedClass.values.includes(row.classId)) &&
        (filters.rarity === null || row.rarity === filters.rarity) &&
        (filters.card === null || row.npCard === filters.card) &&
        (filters.target === null || row.npTarget === filters.target) &&
        (filters.ownership === 'all' || (filters.ownership === 'owned' ? row.owned : !row.owned)),
    )
    .sort(
      (left, right) =>
        rankingMetricValue(right, metric) - rankingMetricValue(left, metric) ||
        left.name.localeCompare(right.name, 'ja'),
    )
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      primaryDamage: rankingMetricValue(row, metric),
    }));
}

export function countActiveRankingFilters(filters: RankingFiltersState): number {
  return (
    (filters.search ? 1 : 0) +
    (filters.classId ? 1 : 0) +
    (filters.rarity === null ? 0 : 1) +
    (filters.card ? 1 : 0) +
    (filters.target ? 1 : 0) +
    (filters.ownership === 'all' ? 0 : 1)
  );
}

export function countChangedRankingConditions(conditions: RankingPolicyConditions): number {
  const defaults = DEFAULT_RANKING_POLICY_CONDITIONS;
  return (Object.keys(defaults) as (keyof RankingPolicyConditions)[]).filter(
    (key) => JSON.stringify(conditions[key]) !== JSON.stringify(defaults[key]),
  ).length;
}

export function rankingPolicyLabel(conditions: RankingPolicyConditions): string {
  return [
    conditions.population === 'all' ? '全サーヴァント' : '保有サーヴァント',
    { naturalLimit: '自然上限', uniformLevel90: 'Lv.90統一', ownedLevel: '保有レベル' }[
      conditions.levelBasis
    ],
    conditions.npLevelBasis.kind === 'owned'
      ? '保有宝具レベル'
      : `NP${conditions.npLevelBasis.npLevel}`,
    conditions.classAffinity === 'favorable' ? '相性有利' : '等倍',
    conditions.selfBuffs === 'included' ? '自己バフあり' : '自己バフなし',
    conditions.conditionalEffects === 'satisfied' ? '条件効果成立込み' : '条件効果通常のみ',
    `初期OC${conditions.initialOvercharge}（開始NP ${conditions.initialOvercharge * 100}%）`,
  ].join('・');
}
