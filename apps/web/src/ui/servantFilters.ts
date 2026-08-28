import {
  getBaseAttackNoblePhantasmVariant,
  getPrimaryNpDamage,
  type AttackNoblePhantasmVariant,
  type NpDamageSpec,
  type ServantMaster,
} from '@fgo-lab/master-data';
import { allServantClasses } from './servantFilterOptions';

export type ServantFilterState = {
  classId: string | null;
  rarities: Set<number>;
  npCards: Set<AttackNoblePhantasmVariant['card']>;
  npTargets: Set<NpDamageSpec['target']>;
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
  return servants.filter((candidate) => {
    const noblePhantasm = getBaseAttackNoblePhantasmVariant(candidate);
    const damage = getPrimaryNpDamage(candidate);
    return (
      (normalizedSearch.length === 0 ||
        [candidate.name, candidate.id]
          .join(' ')
          .toLocaleLowerCase('ja')
          .includes(normalizedSearch)) &&
      (!selectedClass || selectedClass.values.includes(candidate.classId)) &&
      (filters.rarities.size === 0 || filters.rarities.has(candidate.rarity)) &&
      (filters.npCards.size === 0 || (noblePhantasm && filters.npCards.has(noblePhantasm.card))) &&
      (filters.npTargets.size === 0 || (damage && filters.npTargets.has(damage.target)))
    );
  });
}
