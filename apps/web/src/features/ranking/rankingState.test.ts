import { describe, expect, it } from 'vitest';
import { DEFAULT_RANKING_POLICY_CONDITIONS } from '@fgo-lab/calculation-application';
import {
  DEFAULT_RANKING_URL_STATE,
  parseRankingUrlState,
  serializeRankingUrlState,
} from './rankingState';

describe('ranking URL state', () => {
  it('round-trips calculation conditions, filters, and metric through one model', () => {
    const state = {
      ...DEFAULT_RANKING_URL_STATE,
      conditions: {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        initialOvercharge: 3 as const,
        population: 'owned' as const,
        npLevelBasis: { kind: 'specified' as const, npLevel: 5 as const },
        classAffinity: 'favorable' as const,
        selfBuffs: 'excluded' as const,
        conditionalEffects: 'satisfied' as const,
      },
      metric: 'maximum' as const,
      filters: {
        ...DEFAULT_RANKING_URL_STATE.filters,
        search: 'アルトリア',
        card: 'buster' as const,
      },
    };
    expect(parseRankingUrlState(serializeRankingUrlState(state))).toEqual(state);
  });

  it('rejects out-of-domain values without guessing executable defaults', () => {
    const state = parseRankingUrlState(
      '?rNp=9&rMode=unknown&rAffinity=invalid&rSelf=invalid&rConditional=invalid&rSpecial=active&rField=active',
    );
    expect(state.conditions).toBeNull();
    const retained = new URLSearchParams(serializeRankingUrlState(state));
    expect(retained.get('rSpecial')).toBe('active');
    expect(retained.get('rField')).toBe('active');
    expect(parseRankingUrlState(retained.toString()).conditions).toBeNull();
  });
});

describe('strict comparison URL boundary', () => {
  it('rejects entire unknown or retired queries, retaining original values until explicit reset', () => {
    const canonical = serializeRankingUrlState(DEFAULT_RANKING_URL_STATE);
    for (const query of [
      '?rField=active',
      '?rSpecial=active',
      '?rMode=standard',
      '?rNp=1',
      '?rUnknown=first&rUnknown=second',
      `${canonical}&rField=active`,
      `${canonical}&rUnknown=first&rUnknown=second`,
      `${canonical}&rGrowth=saved`,
      canonical.replace('rGrowth=common', 'rGrowth=unknown'),
    ]) {
      const state = parseRankingUrlState(query);
      expect(state.conditions, query).toBeNull();
      expect(state.invalidCalculationQuery).toBe(query);
      const changed = {
        ...state,
        metric: 'maximum' as const,
        filters: { ...state.filters, search: 'edited' },
      };
      const serialized = serializeRankingUrlState(changed);
      const retained = new URLSearchParams(serialized);
      const original = new URLSearchParams(query);
      for (const key of original.keys())
        expect(retained.getAll(key), `${query}: ${key}`).toEqual(original.getAll(key));
      expect(parseRankingUrlState(serialized).conditions).toBeNull();
      const reset = serializeRankingUrlState(
        {
          ...changed,
          conditions: DEFAULT_RANKING_POLICY_CONDITIONS,
          invalidCalculationQuery: undefined,
        },
        serialized,
      );
      expect(parseRankingUrlState(reset).conditions).toEqual(DEFAULT_RANKING_POLICY_CONDITIONS);
      expect(reset).not.toMatch(/rField|rSpecial|rMode|rNp=|rUnknown/);
    }
  });

  it('round-trips a current saved selection and uses declared defaults for display-only queries', () => {
    const state = {
      ...DEFAULT_RANKING_URL_STATE,
      conditions: {
        ...DEFAULT_RANKING_POLICY_CONDITIONS,
        growthBasis: 'saved' as const,
        population: 'owned' as const,
        levelBasis: 'ownedLevel' as const,
        npLevelBasis: { kind: 'owned' as const },
      },
    };
    expect(parseRankingUrlState(serializeRankingUrlState(state))).toEqual(state);
    expect(parseRankingUrlState('?rSearch=test&rMetric=maximum').conditions).toEqual(
      DEFAULT_RANKING_POLICY_CONDITIONS,
    );
  });

  it('rejects partial, duplicate, mixed and noncanonical NP tokens, preserving invalid state on filter edits', () => {
    const canonical = serializeRankingUrlState(DEFAULT_RANKING_URL_STATE);
    expect(parseRankingUrlState('')).toEqual(DEFAULT_RANKING_URL_STATE);
    for (const query of [
      '?rPopulation=all',
      `${canonical}&rPopulation=all`,
      `${canonical}&rMode=standard`,
      `${canonical}&rNp=1`,
      canonical.replace('rOc=1', 'rOc=2'),
      canonical.replace('rOc=1', 'rOc=1.0'),
      canonical.replace(/&?rOc=1/, ''),
      `${canonical}&rOc=1`,
      canonical.replace('rNpBasis=1', 'rNpBasis=1.0'),
      canonical.replace('rNpBasis=1', 'rNpBasis='),
      canonical.replace('rLevelBasis=naturalLimit', 'rLevelBasis=ownedLevel'),
    ]) {
      const state = parseRankingUrlState(query);
      expect(state.conditions, query).toBeNull();
      const changed = {
        ...state,
        metric: 'maximum' as const,
        filters: { ...state.filters, search: 'test' },
      };
      expect(parseRankingUrlState(serializeRankingUrlState(changed)).conditions).toBeNull();
      expect(
        parseRankingUrlState(
          serializeRankingUrlState({
            ...changed,
            conditions: DEFAULT_RANKING_URL_STATE.conditions,
          }),
        ).conditions,
      ).toEqual(DEFAULT_RANKING_URL_STATE.conditions);
    }
  });
});
