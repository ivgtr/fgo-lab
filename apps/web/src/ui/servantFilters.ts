import type { ServantMaster } from '@fgo-lab/master-data';
import { allServantClasses } from './servantFilterOptions';

export type ServantFilterState = {
  classId: string | null;
  rarities: Set<number>;
  npCards: Set<ServantMaster['npCard']>;
  npTargets: Set<ServantMaster['npTarget']>;
};

export function createEmptyServantFilters(): ServantFilterState {
  return {
    classId: null,
    rarities: new Set(),
    npCards: new Set(),
    npTargets: new Set(),
  };
}

export function toggleFilterValue<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function countActiveServantFilterGroups(filters: ServantFilterState): number {
  return (
    (filters.classId === null ? 0 : 1) +
    (filters.rarities.size > 0 ? 1 : 0) +
    (filters.npCards.size > 0 ? 1 : 0) +
    (filters.npTargets.size > 0 ? 1 : 0)
  );
}

export function clearServantFilterDetails(filters: ServantFilterState): ServantFilterState {
  return { ...createEmptyServantFilters(), classId: filters.classId };
}

export function filterServants(
  servants: ServantMaster[],
  filters: ServantFilterState,
  search: string,
): ServantMaster[] {
  const normalizedSearch = search.trim().toLocaleLowerCase('ja');
  const selectedClass = allServantClasses.find((option) => option.id === filters.classId);
  return servants.filter(
    (candidate) =>
      (normalizedSearch.length === 0 ||
        [candidate.name, candidate.id]
          .join(' ')
          .toLocaleLowerCase('ja')
          .includes(normalizedSearch)) &&
      (!selectedClass || selectedClass.values.includes(candidate.classId)) &&
      (filters.rarities.size === 0 || filters.rarities.has(candidate.rarity)) &&
      (filters.npCards.size === 0 ||
        (candidate.hasAttackNp && filters.npCards.has(candidate.npCard))) &&
      (filters.npTargets.size === 0 ||
        (candidate.hasAttackNp && filters.npTargets.has(candidate.npTarget))),
  );
}
