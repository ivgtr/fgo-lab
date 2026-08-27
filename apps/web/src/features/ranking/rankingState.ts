import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_RANKING_CONDITIONS,
  type RankingConditions,
} from '@fgo-lab/calculation-application';

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
  conditions: RankingConditions;
  metric: RankingDamageMetric;
  filters: RankingFiltersState;
}

export const DEFAULT_RANKING_URL_STATE: RankingUrlState = {
  conditions: DEFAULT_RANKING_CONDITIONS,
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

function integer(
  params: URLSearchParams,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!params.has(key)) return fallback;
  const value = Number(params.get(key));
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function nullableInteger(
  params: URLSearchParams,
  key: string,
  minimum: number,
  maximum: number,
): number | null {
  if (!params.has(key)) return null;
  const value = Number(params.get(key));
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function nullableIntegerWithDefault(
  params: URLSearchParams,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (!params.has(key)) return fallback;
  if (params.get(key) === 'none') return null;
  return nullableInteger(params, key, minimum, maximum) ?? fallback;
}

function enumValue<T extends string>(
  params: URLSearchParams,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = params.get(key);
  return values.includes(value as T) ? (value as T) : fallback;
}

function list(params: URLSearchParams, key: string): string[] {
  return [
    ...new Set(
      (params.get(key) ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseRankingUrlState(search: string): RankingUrlState {
  const params = new URLSearchParams(search);
  const defaults = DEFAULT_RANKING_CONDITIONS;
  const craftEssenceId = params.get('rCe');
  const mysticCodeId = params.get('rMc');
  return {
    conditions: {
      ...defaults,
      comparisonMode: enumValue(params, 'rMode', ['standard', 'owned'], defaults.comparisonMode),
      levelRule: enumValue(
        params,
        'rLevel',
        ['natural', 'level90', 'level100', 'level120'],
        defaults.levelRule,
      ),
      npLevel: integer(params, 'rNp', defaults.npLevel, 1, 5),
      fouAtk: integer(params, 'rFou', defaults.fouAtk, 0, 2_000),
      overcharge: integer(params, 'rOc', defaults.overcharge, 1, 5),
      includeSelfEffects: params.get('rSelf') !== '0',
      supportTemplateId: params.get('rSupport'),
      craftEssence: craftEssenceId
        ? {
            craftEssenceId,
            level: integer(params, 'rCeLevel', 1, 1, 100),
            limitBreak: integer(params, 'rCeLb', 0, 0, 4),
          }
        : null,
      mysticCode: mysticCodeId
        ? {
            mysticCodeId,
            skillLevel: integer(params, 'rMcLevel', 10, 1, 10),
          }
        : null,
      classAffinityRule: enumValue(
        params,
        'rClassAffinity',
        ['favorable', 'attackAdvantage', 'neutral', 'unfavorable', 'auto'],
        defaults.classAffinityRule,
      ),
      attributeAffinityRule: enumValue(
        params,
        'rAttributeAffinity',
        ['favorable', 'neutral', 'unfavorable', 'auto'],
        defaults.attributeAffinityRule,
      ),
      targetClassId: params.get('rTargetClass') ?? defaults.targetClassId,
      targetAttribute: enumValue(
        params,
        'rTargetAttribute',
        ['man', 'earth', 'sky', 'star', 'beast', 'unknown'],
        defaults.targetAttribute,
      ),
      targetTraits: list(params, 'rTargetTraits'),
      fieldTraits: list(params, 'rFieldTraits'),
      attackerHpPermille: nullableIntegerWithDefault(
        params,
        'rHp',
        defaults.attackerHpPermille ?? 1_000,
        0,
        1_000,
      ),
      battlePointPhase: nullableIntegerWithDefault(
        params,
        'rBp',
        defaults.battlePointPhase ?? 0,
        0,
        10,
      ),
      procPolicy: enumValue(params, 'rProc', ['success', 'failure'], defaults.procPolicy),
      chainedProcPolicy: enumValue(
        params,
        'rChain',
        ['maximum', 'minimum'],
        defaults.chainedProcPolicy,
      ),
      canonicalInputs: {
        currentTurn: nullableInteger(params, 'rTurn', 1, 99),
        criticalStars: nullableInteger(params, 'rStars', 0, 99),
        effectStackCount: nullableInteger(params, 'rStacks', 0, 99),
        fieldActorCount: nullableInteger(params, 'rFieldCount', 0, 99),
        availableSkillCount: nullableInteger(params, 'rSkills', 0, 99),
        friendshipLevel: nullableInteger(params, 'rBond', 0, 15),
        sourceHpPermille: nullableInteger(params, 'rSourceHp', 0, 1_000),
        allyCount: nullableInteger(params, 'rAllies', 1, 6),
        enemyCount: nullableInteger(params, 'rEnemies', 1, 6),
        allActorCount: nullableInteger(params, 'rActors', 1, 12),
      },
    },
    metric: enumValue(params, 'rMetric', ['average', 'minimum', 'maximum'], 'average'),
    filters: {
      search: params.get('rSearch') ?? '',
      classId: params.get('rClass'),
      rarity: nullableInteger(params, 'rRarity', 0, 5),
      card: params.has('rCard')
        ? enumValue(params, 'rCard', ['buster', 'arts', 'quick'] as const, 'buster')
        : (null as RankingFiltersState['card']),
      target: params.has('rTarget')
        ? enumValue(params, 'rTarget', ['single', 'all'] as const, 'single')
        : (null as RankingFiltersState['target']),
      ownership: enumValue(params, 'rOwned', ['all', 'owned', 'unowned'], 'all'),
    },
  };
}

function setIf(params: URLSearchParams, key: string, value: string | number | null, keep: boolean) {
  if (keep && value !== null && value !== '') params.set(key, String(value));
  else params.delete(key);
}

function setNullableDifference(
  params: URLSearchParams,
  key: string,
  value: number | null,
  fallback: number,
) {
  if (value === fallback) params.delete(key);
  else params.set(key, value === null ? 'none' : String(value));
}

export function serializeRankingUrlState(state: RankingUrlState, currentSearch = ''): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of [...params.keys()]) if (key.startsWith('r')) params.delete(key);
  params.set('page', 'ranking');
  const conditions = state.conditions;
  setIf(params, 'rMode', conditions.comparisonMode, conditions.comparisonMode !== 'standard');
  setIf(params, 'rLevel', conditions.levelRule, conditions.levelRule !== 'natural');
  setIf(params, 'rNp', conditions.npLevel, conditions.npLevel !== 1);
  setIf(params, 'rFou', conditions.fouAtk, conditions.fouAtk !== 1_000);
  setIf(params, 'rOc', conditions.overcharge, conditions.overcharge !== 1);
  setIf(params, 'rSelf', 0, !conditions.includeSelfEffects);
  setIf(params, 'rSupport', conditions.supportTemplateId, conditions.supportTemplateId !== null);
  setIf(params, 'rCe', conditions.craftEssence?.craftEssenceId ?? null, !!conditions.craftEssence);
  setIf(params, 'rCeLevel', conditions.craftEssence?.level ?? null, !!conditions.craftEssence);
  setIf(params, 'rCeLb', conditions.craftEssence?.limitBreak ?? null, !!conditions.craftEssence);
  setIf(params, 'rMc', conditions.mysticCode?.mysticCodeId ?? null, !!conditions.mysticCode);
  setIf(params, 'rMcLevel', conditions.mysticCode?.skillLevel ?? null, !!conditions.mysticCode);
  setIf(
    params,
    'rClassAffinity',
    conditions.classAffinityRule,
    conditions.classAffinityRule !== 'favorable',
  );
  setIf(
    params,
    'rAttributeAffinity',
    conditions.attributeAffinityRule,
    conditions.attributeAffinityRule !== 'neutral',
  );
  setIf(params, 'rTargetClass', conditions.targetClassId, conditions.targetClassId !== 'lancer');
  setIf(
    params,
    'rTargetAttribute',
    conditions.targetAttribute,
    conditions.targetAttribute !== 'unknown',
  );
  setIf(
    params,
    'rTargetTraits',
    conditions.targetTraits.join(','),
    conditions.targetTraits.length > 0,
  );
  setIf(
    params,
    'rFieldTraits',
    conditions.fieldTraits.join(','),
    conditions.fieldTraits.length > 0,
  );
  setNullableDifference(params, 'rHp', conditions.attackerHpPermille, 1_000);
  setNullableDifference(params, 'rBp', conditions.battlePointPhase, 0);
  setIf(params, 'rProc', conditions.procPolicy, conditions.procPolicy !== 'success');
  setIf(params, 'rChain', conditions.chainedProcPolicy, conditions.chainedProcPolicy !== 'maximum');
  const inputKeys: [keyof typeof conditions.canonicalInputs, string][] = [
    ['currentTurn', 'rTurn'],
    ['criticalStars', 'rStars'],
    ['effectStackCount', 'rStacks'],
    ['fieldActorCount', 'rFieldCount'],
    ['availableSkillCount', 'rSkills'],
    ['friendshipLevel', 'rBond'],
    ['sourceHpPermille', 'rSourceHp'],
    ['allyCount', 'rAllies'],
    ['enemyCount', 'rEnemies'],
    ['allActorCount', 'rActors'],
  ];
  for (const [key, parameter] of inputKeys)
    setIf(
      params,
      parameter,
      conditions.canonicalInputs[key],
      conditions.canonicalInputs[key] !== null,
    );
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
