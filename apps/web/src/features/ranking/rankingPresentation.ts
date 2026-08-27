import {
  DEFAULT_RANKING_CONDITIONS,
  type RankingConditions,
  type RankingRowSummary,
} from '@fgo-lab/calculation-application';
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

export function countChangedRankingConditions(conditions: RankingConditions): number {
  const defaults = DEFAULT_RANKING_CONDITIONS;
  return (Object.keys(defaults) as (keyof RankingConditions)[]).filter(
    (key) => conditions[key] !== defaults[key],
  ).length;
}
