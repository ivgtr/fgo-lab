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
  const topLevelKeys = (Object.keys(defaults) as (keyof RankingConditions)[]).filter(
    (key) => key !== 'canonicalInputs',
  );
  return (
    topLevelKeys.filter((key) => JSON.stringify(conditions[key]) !== JSON.stringify(defaults[key]))
      .length +
    (
      Object.keys(defaults.canonicalInputs) as (keyof RankingConditions['canonicalInputs'])[]
    ).filter((key) => conditions.canonicalInputs[key] !== defaults.canonicalInputs[key]).length
  );
}

export function rankingConditionSummary(
  conditions: RankingConditions,
  supportName: string | undefined,
): string[] {
  const level =
    conditions.comparisonMode === 'owned'
      ? '保存育成値'
      : conditions.levelRule === 'natural'
        ? '自然上限'
        : `Lv${conditions.levelRule.slice('level'.length)}`;
  return [
    `${conditions.comparisonMode === 'standard' ? '標準比較' : '所持戦力'}・${level}・${conditions.comparisonMode === 'standard' ? `NP${String(conditions.npLevel)}` : '保存NP'}・Fou${conditions.comparisonMode === 'standard' ? String(conditions.fouAtk) : '保存値'}・自己バフ${conditions.includeSelfEffects ? 'あり' : 'なし'}`,
    `クラス${conditions.classAffinityRule === 'favorable' ? '有利' : conditions.classAffinityRule === 'attackAdvantage' ? '攻撃有利' : conditions.classAffinityRule === 'unfavorable' ? '不利' : conditions.classAffinityRule === 'auto' ? '敵クラスから自動' : '等倍'}・属性${conditions.attributeAffinityRule === 'favorable' ? '有利' : conditions.attributeAffinityRule === 'unfavorable' ? '不利' : conditions.attributeAffinityRule === 'auto' ? '敵属性から自動' : '等倍'}・${supportName ?? '支援なし'}`,
  ];
}
