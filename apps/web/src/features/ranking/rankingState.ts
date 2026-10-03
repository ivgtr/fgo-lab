import { compileRankingSelection } from '@fgo-lab/calculation-application';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_RANKING_POLICY_CONDITIONS,
  type RankingPolicyConditions,
} from '@fgo-lab/calculation-application/ranking-contracts';

export type RankingDamageMetric = 'average' | 'minimum' | 'maximum';
export type RankingOwnershipFilter = 'all' | 'owned' | 'unowned';

export interface RankingFiltersState {
  search: string;
  classId: string | null;
  rarity: number | null;
  card: 'buster' | 'arts' | 'quick' | null;
  target: 'single' | 'all' | null;
  ownership: RankingOwnershipFilter;
}

export interface RankingUrlState {
  conditions: RankingPolicyConditions | null;
  invalidCalculationQuery?: string | undefined;
  metric: RankingDamageMetric;
  filters: RankingFiltersState;
}

export const DEFAULT_RANKING_URL_STATE: RankingUrlState = {
  conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
  metric: 'average',
  filters: {
    search: '',
    classId: null,
    rarity: null,
    card: null,
    target: null,
    ownership: 'all',
  },
};

const COMPARISON_QUERY_KEYS = [
  'rGrowth',
  'rPopulation',
  'rLevelBasis',
  'rNpBasis',
  'rOc',
  'rAffinity',
  'rSelf',
  'rConditional',
] as const;
const DISPLAY_QUERY_KEYS = [
  'rMetric',
  'rSearch',
  'rClass',
  'rRarity',
  'rCard',
  'rTarget',
  'rOwned',
] as const;
const comparisonKeys = new Set<string>(COMPARISON_QUERY_KEYS);
const displayKeys = new Set<string>(DISPLAY_QUERY_KEYS);

function enumValue<T extends string>(
  params: URLSearchParams,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = params.get(key);
  return values.includes(value as T) ? (value as T) : fallback;
}

function nullableRarity(params: URLSearchParams): number | null {
  if (!params.has('rRarity')) return null;
  const value = Number(params.get('rRarity'));
  return Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
}

export function parseRankingUrlState(search: string): RankingUrlState {
  const params = new URLSearchParams(search);
  const unknown = [...params.keys()].some(
    (key) => key.startsWith('r') && !comparisonKeys.has(key) && !displayKeys.has(key),
  );
  const absent = COMPARISON_QUERY_KEYS.every((key) => !params.has(key));
  const complete = COMPARISON_QUERY_KEYS.every((key) => params.getAll(key).length === 1);
  const npToken = params.get('rNpBasis');
  const parsed = compileRankingSelection({
    initialOvercharge: /^[1-3]$/.test(params.get('rOc') ?? '') ? Number(params.get('rOc')) : null,
    growthBasis: params.get('rGrowth'),
    population: params.get('rPopulation'),
    levelBasis: params.get('rLevelBasis'),
    npLevelBasis:
      npToken === 'owned'
        ? { kind: 'owned' }
        : { kind: 'specified', npLevel: /^[1-5]$/.test(npToken ?? '') ? Number(npToken) : null },
    classAffinity: params.get('rAffinity'),
    selfBuffs: params.get('rSelf'),
    conditionalEffects: params.get('rConditional'),
  });
  const conditions =
    !unknown && absent
      ? DEFAULT_RANKING_POLICY_CONDITIONS
      : !unknown && complete && parsed.status === 'valid'
        ? parsed.selection
        : null;
  return {
    conditions,
    ...(conditions === null ? { invalidCalculationQuery: search } : {}),
    metric: enumValue(params, 'rMetric', ['average', 'minimum', 'maximum'], 'average'),
    filters: {
      search: params.get('rSearch') ?? '',
      classId: params.get('rClass'),
      rarity: nullableRarity(params),
      card: params.has('rCard')
        ? enumValue(params, 'rCard', ['buster', 'arts', 'quick'] as const, 'buster')
        : null,
      target: params.has('rTarget')
        ? enumValue(params, 'rTarget', ['single', 'all'] as const, 'single')
        : null,
      ownership: enumValue(params, 'rOwned', ['all', 'owned', 'unowned'], 'all'),
    },
  };
}

function setIf(params: URLSearchParams, key: string, value: string | number | null, keep: boolean) {
  if (keep && value !== null && value !== '') params.set(key, String(value));
  else params.delete(key);
}

export function serializeRankingUrlState(state: RankingUrlState, currentSearch = ''): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of [...params.keys()]) if (key.startsWith('r')) params.delete(key);
  params.set('page', 'ranking');
  const conditions = state.conditions;
  if (conditions) {
    params.set('rGrowth', conditions.growthBasis);
    params.set('rPopulation', conditions.population);
    params.set('rLevelBasis', conditions.levelBasis);
    params.set(
      'rNpBasis',
      conditions.npLevelBasis.kind === 'owned' ? 'owned' : String(conditions.npLevelBasis.npLevel),
    );
    params.set('rOc', String(conditions.initialOvercharge));
    params.set('rAffinity', conditions.classAffinity);
    params.set('rSelf', conditions.selfBuffs);
    params.set('rConditional', conditions.conditionalEffects);
  } else {
    const invalid = new URLSearchParams(state.invalidCalculationQuery);
    for (const [key, value] of invalid)
      if (key.startsWith('r') && !displayKeys.has(key)) params.append(key, value);
  }
  setIf(params, 'rMetric', state.metric, state.metric !== 'average');
  setIf(params, 'rSearch', state.filters.search, state.filters.search.length > 0);
  setIf(params, 'rClass', state.filters.classId, state.filters.classId !== null);
  setIf(params, 'rRarity', state.filters.rarity, state.filters.rarity !== null);
  setIf(params, 'rCard', state.filters.card, state.filters.card !== null);
  setIf(params, 'rTarget', state.filters.target, state.filters.target !== null);
  setIf(params, 'rOwned', state.filters.ownership, state.filters.ownership !== 'all');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useRankingUrlState(): [
  RankingUrlState,
  (update: RankingUrlState | ((current: RankingUrlState) => RankingUrlState)) => void,
] {
  const [state, setState] = useState(() => parseRankingUrlState(location.search));
  useEffect(() => {
    const restore = () => setState(parseRankingUrlState(location.search));
    addEventListener('popstate', restore);
    return () => removeEventListener('popstate', restore);
  }, []);
  const update = useCallback(
    (next: RankingUrlState | ((current: RankingUrlState) => RankingUrlState)) => {
      setState((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        const url = new URL(location.href);
        url.search = serializeRankingUrlState(resolved, url.search);
        history.replaceState(history.state, '', url);
        return resolved;
      });
    },
    [],
  );
  return [state, update];
}
